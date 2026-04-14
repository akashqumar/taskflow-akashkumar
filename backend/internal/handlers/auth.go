package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/taskflow/backend/internal/auth"
	"github.com/taskflow/backend/internal/models"
	"github.com/taskflow/backend/internal/repository"
)

type AuthHandler struct {
	users  *repository.UserRepo
	jwtSvc *auth.Service
}

func NewAuthHandler(pool *pgxpool.Pool, jwtSvc *auth.Service) *AuthHandler {
	return &AuthHandler{
		users:  repository.NewUserRepo(pool),
		jwtSvc: jwtSvc,
	}
}

// Register handles POST /auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate
	fields := map[string]string{}
	if strings.TrimSpace(req.Name) == "" {
		fields["name"] = "is required"
	}
	if strings.TrimSpace(req.Email) == "" {
		fields["email"] = "is required"
	} else if !strings.Contains(req.Email, "@") {
		fields["email"] = "is invalid"
	}
	if len(req.Password) < 8 {
		fields["password"] = "must be at least 8 characters"
	}
	if len(fields) > 0 {
		respondValidationError(w, fields)
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	user, err := h.users.Create(r.Context(), req.Name, strings.ToLower(req.Email), string(hash))
	if err != nil {
		// Unique constraint on email
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			respondValidationError(w, map[string]string{"email": "already registered"})
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	token, err := h.jwtSvc.GenerateToken(user.ID, user.Email)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respond(w, http.StatusCreated, models.AuthResponse{Token: token, User: *user})
}

// Login handles POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	fields := map[string]string{}
	if strings.TrimSpace(req.Email) == "" {
		fields["email"] = "is required"
	}
	if req.Password == "" {
		fields["password"] = "is required"
	}
	if len(fields) > 0 {
		respondValidationError(w, fields)
		return
	}

	user, hash, err := h.users.GetByEmail(r.Context(), strings.ToLower(req.Email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.jwtSvc.GenerateToken(user.ID, user.Email)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respond(w, http.StatusOK, models.AuthResponse{Token: token, User: *user})
}

// ListUsers returns all users (id, name, email) for the assignee picker.
func (h *AuthHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.users.ListAll(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}
	respond(w, http.StatusOK, map[string]any{"users": users})
}

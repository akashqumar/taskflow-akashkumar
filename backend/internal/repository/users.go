package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/taskflow/backend/internal/models"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

// Create inserts a new user and returns the created record (without password).
func (r *UserRepo) Create(ctx context.Context, name, email, hashedPw string) (*models.User, error) {
	var u models.User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (name, email, password)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, email, created_at`,
		name, email, hashedPw,
	).Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &u, nil
}

// GetByEmail returns the user plus their hashed password for login verification.
func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*models.User, string, error) {
	var u models.User
	var hash string
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, email, password, created_at FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Name, &u.Email, &hash, &u.CreatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("get user by email: %w", err)
	}
	return &u, hash, nil
}

// GetByID returns a user by primary key.
func (r *UserRepo) GetByID(ctx context.Context, id string) (*models.User, error) {
	var u models.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, email, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

// ListAll returns all users (id, name, email only — no passwords).
// Used to populate the assignee picker on the frontend.
func (r *UserRepo) ListAll(ctx context.Context) ([]models.User, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, email, created_at FROM users ORDER BY name ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	if users == nil {
		users = []models.User{}
	}
	return users, nil
}

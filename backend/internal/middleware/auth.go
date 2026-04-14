package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/taskflow/backend/internal/auth"
)

type contextKey string

const (
	ContextUserID    contextKey = "user_id"
	ContextUserEmail contextKey = "user_email"
)

// UserIDFromCtx extracts the authenticated user ID from the request context.
func UserIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(ContextUserID).(string)
	return v
}

// Auth is a JWT Bearer token middleware. It accepts the token either via the
// "Authorization: Bearer <token>" header (normal requests) or via the
// "?token=<token>" query parameter (for SSE / EventSource clients that cannot
// set custom headers).
func Auth(jwtSvc *auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenStr string

			header := r.Header.Get("Authorization")
			if strings.HasPrefix(header, "Bearer ") {
				tokenStr = strings.TrimPrefix(header, "Bearer ")
			} else {
				// Fallback: query param for SSE / EventSource clients
				tokenStr = r.URL.Query().Get("token")
			}

			if tokenStr == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			claims, err := jwtSvc.ValidateToken(tokenStr)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), ContextUserID, claims.UserID)
			ctx = context.WithValue(ctx, ContextUserEmail, claims.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

package db

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Connect opens a pgxpool connection and pings the database.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

// Migrate runs all pending up migrations from the migrations/ directory.
func Migrate(databaseURL string) error {
	m, err := migrate.New("file://migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}

	slog.Info("database migrations up to date")
	return nil
}

// Seed inserts initial data only if the users table is empty (idempotent).
func Seed(ctx context.Context, pool *pgxpool.Pool) error {
	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return fmt.Errorf("checking users: %w", err)
	}
	if count > 0 {
		slog.Info("database already seeded, skipping")
		return nil
	}

	// Create test user
	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	var userID string
	err = pool.QueryRow(ctx,
		`INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id`,
		"Test User", "test@example.com", string(hash),
	).Scan(&userID)
	if err != nil {
		return fmt.Errorf("insert seed user: %w", err)
	}

	var projectID string
	err = pool.QueryRow(ctx,
		`INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id`,
		"Website Redesign", "Q2 redesign project", userID,
	).Scan(&projectID)
	if err != nil {
		return fmt.Errorf("insert seed project: %w", err)
	}

	tasks := []struct{ title, status, priority string }{
		{"Design homepage mockups", "todo", "high"},
		{"Build REST API endpoints", "in_progress", "high"},
		{"Write developer documentation", "done", "low"},
	}
	for _, t := range tasks {
		_, err = pool.Exec(ctx,
			`INSERT INTO tasks (title, status, priority, project_id, assignee_id) VALUES ($1, $2, $3, $4, $5)`,
			t.title, t.status, t.priority, projectID, userID,
		)
		if err != nil {
			return fmt.Errorf("insert seed task: %w", err)
		}
	}

	slog.Info("database seeded", "user_email", "test@example.com", "password", "password123")
	return nil
}

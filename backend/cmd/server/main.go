package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/taskflow/backend/internal/auth"
	"github.com/taskflow/backend/internal/broadcaster"
	"github.com/taskflow/backend/internal/db"
	"github.com/taskflow/backend/internal/handlers"
	"github.com/taskflow/backend/internal/middleware"
)

func main() {
	// Load .env for local development (ignored in Docker where env vars are set directly)
	_ = godotenv.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		slog.Error("JWT_SECRET is required")
		os.Exit(1)
	}

	// Connect to DB with retry (extra safety on top of docker depends_on health check)
	ctx := context.Background()
	var pool *pgxpool.Pool
	var connErr error
	for i := range 15 {
		pool, connErr = db.Connect(ctx, dbURL)
		if connErr == nil {
			break
		}
		slog.Warn("waiting for database", "attempt", i+1, "error", connErr)
		time.Sleep(2 * time.Second)
	}
	if connErr != nil {
		slog.Error("could not connect to database", "error", connErr)
		os.Exit(1)
	}
	defer pool.Close()

	// Run migrations
	if err := db.Migrate(dbURL); err != nil {
		slog.Error("migrations failed", "error", err)
		os.Exit(1)
	}

	// Seed if empty
	if err := db.Seed(ctx, pool); err != nil {
		slog.Warn("seeding failed", "error", err)
	}

	// Build services
	jwtSvc := auth.NewService(jwtSecret)
	hub := broadcaster.NewHub()

	// Build router
	r := chi.NewRouter()
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.RequestID)
	r.Use(middleware.Logger(logger))
	r.Use(middleware.CORS())
	r.Use(chimiddleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	// Public routes
	authHandler := handlers.NewAuthHandler(pool, jwtSvc)
	r.Post("/auth/register", authHandler.Register)
	r.Post("/auth/login", authHandler.Login)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(jwtSvc))

		// Users (for assignee picker)
		r.Get("/users", authHandler.ListUsers)

		// Projects
		projectHandler := handlers.NewProjectHandler(pool)
		r.Get("/projects", projectHandler.List)
		r.Post("/projects", projectHandler.Create)
		r.Get("/projects/{id}", projectHandler.Get)
		r.Patch("/projects/{id}", projectHandler.Update)
		r.Delete("/projects/{id}", projectHandler.Delete)
		r.Get("/projects/{id}/stats", projectHandler.Stats)

		// Tasks
		taskHandler := handlers.NewTaskHandler(pool, hub)
		r.Get("/projects/{id}/tasks", taskHandler.List)
		r.Post("/projects/{id}/tasks", taskHandler.Create)
		r.Patch("/tasks/{id}", taskHandler.Update)
		r.Delete("/tasks/{id}", taskHandler.Delete)
		// SSE — real-time task events
		r.Get("/projects/{id}/stream", taskHandler.ServeSSE)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		slog.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down gracefully...")

	shutCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		slog.Error("forced shutdown", "error", err)
	}
	slog.Info("server stopped")
}

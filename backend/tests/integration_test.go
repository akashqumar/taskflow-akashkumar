//go:build integration

package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/taskflow/backend/internal/auth"
	"github.com/taskflow/backend/internal/broadcaster"
	"github.com/taskflow/backend/internal/db"
	"github.com/taskflow/backend/internal/handlers"
	"github.com/taskflow/backend/internal/middleware"
)

func setupTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping integration tests")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	t.Cleanup(func() { pool.Close() })

	if err := db.Migrate(dbURL); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	// Clean test data
	pool.Exec(ctx, `DELETE FROM tasks`)
	pool.Exec(ctx, `DELETE FROM projects`)
	pool.Exec(ctx, `DELETE FROM users`)

	jwtSecret := "test-secret-for-integration-tests-min-32-chars"
	jwtSvc := auth.NewService(jwtSecret)

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.CORS())

	authHandler := handlers.NewAuthHandler(pool, jwtSvc)
	r.Post("/auth/register", authHandler.Register)
	r.Post("/auth/login", authHandler.Login)

	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(jwtSvc))
		projectHandler := handlers.NewProjectHandler(pool)
		r.Get("/projects", projectHandler.List)
		r.Post("/projects", projectHandler.Create)
		r.Get("/projects/{id}", projectHandler.Get)
		r.Patch("/projects/{id}", projectHandler.Update)
		r.Delete("/projects/{id}", projectHandler.Delete)
		r.Get("/projects/{id}/stats", projectHandler.Stats)

		taskHandler := handlers.NewTaskHandler(pool, broadcaster.NewHub())
		r.Get("/projects/{id}/tasks", taskHandler.List)
		r.Post("/projects/{id}/tasks", taskHandler.Create)
		r.Patch("/tasks/{id}", taskHandler.Update)
		r.Delete("/tasks/{id}", taskHandler.Delete)
	})

	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, jwtSecret
}

func postJSON(t *testing.T, url string, body any, token string) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return resp
}

func patchJSON(t *testing.T, url string, body any, token string) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPatch, url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PATCH %s: %v", url, err)
	}
	return resp
}

func getJSON(t *testing.T, url, token string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	return resp
}

// ── Test 1: Register ──────────────────────────────────────────────────────────

func TestRegister(t *testing.T) {
	srv, _ := setupTestServer(t)

	t.Run("success", func(t *testing.T) {
		resp := postJSON(t, srv.URL+"/auth/register", map[string]string{
			"name": "Alice", "email": fmt.Sprintf("alice_%d@test.com", time.Now().UnixNano()), "password": "secret123",
		}, "")
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		var body map[string]any
		json.NewDecoder(resp.Body).Decode(&body)
		if body["token"] == nil {
			t.Fatal("expected token in response")
		}
	})

	t.Run("duplicate email returns 400", func(t *testing.T) {
		email := fmt.Sprintf("dup_%d@test.com", time.Now().UnixNano())
		postJSON(t, srv.URL+"/auth/register", map[string]string{"name": "A", "email": email, "password": "secret123"}, "")
		resp := postJSON(t, srv.URL+"/auth/register", map[string]string{"name": "B", "email": email, "password": "secret123"}, "")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("missing fields returns 400 with field errors", func(t *testing.T) {
		resp := postJSON(t, srv.URL+"/auth/register", map[string]string{}, "")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
		var body map[string]any
		json.NewDecoder(resp.Body).Decode(&body)
		if body["error"] != "validation failed" {
			t.Fatalf("expected validation error, got %v", body["error"])
		}
	})
}

// ── Test 2: Login ─────────────────────────────────────────────────────────────

func TestLogin(t *testing.T) {
	srv, _ := setupTestServer(t)
	email := fmt.Sprintf("login_%d@test.com", time.Now().UnixNano())
	postJSON(t, srv.URL+"/auth/register", map[string]string{"name": "Bob", "email": email, "password": "pass1234"}, "")

	t.Run("success returns token", func(t *testing.T) {
		resp := postJSON(t, srv.URL+"/auth/login", map[string]string{"email": email, "password": "pass1234"}, "")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		var body map[string]any
		json.NewDecoder(resp.Body).Decode(&body)
		if body["token"] == nil {
			t.Fatal("expected token")
		}
	})

	t.Run("wrong password returns 401", func(t *testing.T) {
		resp := postJSON(t, srv.URL+"/auth/login", map[string]string{"email": email, "password": "wrongpass"}, "")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})

	t.Run("unknown email returns 401", func(t *testing.T) {
		resp := postJSON(t, srv.URL+"/auth/login", map[string]string{"email": "nobody@test.com", "password": "pass"}, "")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})
}

// ── Test 3: Task lifecycle ────────────────────────────────────────────────────

func TestTaskLifecycle(t *testing.T) {
	srv, _ := setupTestServer(t)

	// Register and get token
	email := fmt.Sprintf("task_%d@test.com", time.Now().UnixNano())
	regResp := postJSON(t, srv.URL+"/auth/register", map[string]string{"name": "Carol", "email": email, "password": "pass1234"}, "")
	var regBody map[string]any
	json.NewDecoder(regResp.Body).Decode(&regBody)
	token := regBody["token"].(string)

	// Create project
	projResp := postJSON(t, srv.URL+"/projects", map[string]string{"name": "Test Project"}, token)
	if projResp.StatusCode != http.StatusCreated {
		t.Fatalf("create project: expected 201, got %d", projResp.StatusCode)
	}
	var project map[string]any
	json.NewDecoder(projResp.Body).Decode(&project)
	projectID := project["id"].(string)

	// Create task
	taskResp := postJSON(t, fmt.Sprintf("%s/projects/%s/tasks", srv.URL, projectID),
		map[string]string{"title": "Write tests", "priority": "high"}, token)
	if taskResp.StatusCode != http.StatusCreated {
		t.Fatalf("create task: expected 201, got %d", taskResp.StatusCode)
	}
	var task map[string]any
	json.NewDecoder(taskResp.Body).Decode(&task)
	taskID := task["id"].(string)

	if task["status"] != "todo" {
		t.Fatalf("expected initial status todo, got %v", task["status"])
	}

	// Update task status
	patchResp := patchJSON(t, fmt.Sprintf("%s/tasks/%s", srv.URL, taskID),
		map[string]string{"status": "in_progress"}, token)
	if patchResp.StatusCode != http.StatusOK {
		t.Fatalf("update task: expected 200, got %d", patchResp.StatusCode)
	}
	var updated map[string]any
	json.NewDecoder(patchResp.Body).Decode(&updated)
	if updated["status"] != "in_progress" {
		t.Fatalf("expected in_progress, got %v", updated["status"])
	}

	// List tasks with filter
	listResp := getJSON(t, fmt.Sprintf("%s/projects/%s/tasks?status=in_progress", srv.URL, projectID), token)
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("list tasks: expected 200, got %d", listResp.StatusCode)
	}

	// Unauthenticated request returns 401
	req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/projects", srv.URL), nil)
	unauthResp, _ := http.DefaultClient.Do(req)
	if unauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated, got %d", unauthResp.StatusCode)
	}
}

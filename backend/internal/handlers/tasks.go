package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/taskflow/backend/internal/broadcaster"
	"github.com/taskflow/backend/internal/middleware"
	"github.com/taskflow/backend/internal/models"
	"github.com/taskflow/backend/internal/repository"
)

type TaskHandler struct {
	tasks    *repository.TaskRepo
	projects *repository.ProjectRepo
	hub      *broadcaster.Hub
}

func NewTaskHandler(pool *pgxpool.Pool, hub *broadcaster.Hub) *TaskHandler {
	return &TaskHandler{
		tasks:    repository.NewTaskRepo(pool),
		projects: repository.NewProjectRepo(pool),
		hub:      hub,
	}
}

// GET /projects/:id/tasks?status=&assignee=&page=&limit=
func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	page, limit := parsePagination(r)

	// Verify project exists
	if _, err := h.projects.GetByID(r.Context(), projectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	statusFilter := r.URL.Query().Get("status")
	assigneeFilter := r.URL.Query().Get("assignee")

	var sf, af *string
	if statusFilter != "" {
		sf = &statusFilter
	}
	if assigneeFilter != "" {
		af = &assigneeFilter
	}

	tasks, total, err := h.tasks.List(r.Context(), projectID, sf, af, page, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	totalPages := total / limit
	if total%limit != 0 {
		totalPages++
	}
	respond(w, http.StatusOK, map[string]any{
		"tasks": tasks,
		"meta": models.PageMeta{
			Total: total, Page: page, Limit: limit, TotalPages: totalPages,
		},
	})
}

// POST /projects/:id/tasks
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")

	// Verify project exists
	if _, err := h.projects.GetByID(r.Context(), projectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var req models.CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	fields := map[string]string{}
	if strings.TrimSpace(req.Title) == "" {
		fields["title"] = "is required"
	}
	validPriorities := map[string]bool{"low": true, "medium": true, "high": true}
	if req.Priority != "" && !validPriorities[req.Priority] {
		fields["priority"] = "must be low, medium, or high"
	}
	if len(fields) > 0 {
		respondValidationError(w, fields)
		return
	}

	task, err := h.tasks.Create(r.Context(), projectID, req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Broadcast real-time event
	h.hub.Publish(projectID, broadcaster.Event{Type: "task_created", Payload: task})

	respond(w, http.StatusCreated, task)
}

// PATCH /tasks/:id
func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Verify task exists
	if _, err := h.tasks.GetByID(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Decode raw body to distinguish absent vs null
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := models.UpdateTaskParams{}
	fields := map[string]string{}

	if v, ok := raw["title"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err != nil || strings.TrimSpace(s) == "" {
			fields["title"] = "must be a non-empty string"
		} else {
			params.Title = &s
		}
	}
	if v, ok := raw["description"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			params.Description = &s
		}
	}
	if v, ok := raw["status"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			valid := map[string]bool{"todo": true, "in_progress": true, "done": true}
			if !valid[s] {
				fields["status"] = "must be todo, in_progress, or done"
			} else {
				params.Status = &s
			}
		}
	}
	if v, ok := raw["priority"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			valid := map[string]bool{"low": true, "medium": true, "high": true}
			if !valid[s] {
				fields["priority"] = "must be low, medium, or high"
			} else {
				params.Priority = &s
			}
		}
	}
	if v, ok := raw["assignee_id"]; ok {
		if string(v) == "null" {
			params.SetAssigneeNull = true
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err == nil {
				params.AssigneeID = &s
			}
		}
	}
	if v, ok := raw["due_date"]; ok {
		if string(v) == "null" {
			params.SetDueDateNull = true
		} else {
			var s string
			if err := json.Unmarshal(v, &s); err == nil {
				params.DueDate = &s
			}
		}
	}

	if len(fields) > 0 {
		respondValidationError(w, fields)
		return
	}

	updated, err := h.tasks.Update(r.Context(), id, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Broadcast real-time event
	h.hub.Publish(updated.ProjectID, broadcaster.Event{Type: "task_updated", Payload: updated})

	respond(w, http.StatusOK, updated)
}

// DELETE /tasks/:id — project owner only
func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromCtx(r.Context())

	// Get full task first (need ProjectID for broadcast)
	task, err := h.tasks.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	ownerID, err := h.tasks.GetProjectOwnerForTask(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if ownerID != userID {
		respondError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := h.tasks.Delete(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Broadcast real-time event
	h.hub.Publish(task.ProjectID, broadcaster.Event{
		Type:    "task_deleted",
		Payload: map[string]string{"id": id, "project_id": task.ProjectID},
	})

	w.WriteHeader(http.StatusNoContent)
}

// ServeSSE — GET /projects/:id/stream
// Streams real-time task events to the caller via Server-Sent Events.
func (h *TaskHandler) ServeSSE(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	h.hub.ServeSSE(projectID, w, r)
}

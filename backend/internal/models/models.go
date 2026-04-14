package models

import "time"

// ── Domain types ──────────────────────────────────────────────────────────────

type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	OwnerID     string    `json:"owner_id"`
	IsPrivate   bool      `json:"is_private"`
	CreatedAt   time.Time `json:"created_at"`
}

type ProjectWithTasks struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	OwnerID     string    `json:"owner_id"`
	IsPrivate   bool      `json:"is_private"`
	CreatedAt   time.Time `json:"created_at"`
	Tasks       []Task    `json:"tasks"`
}

type Task struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description *string   `json:"description"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority"`
	ProjectID   string    `json:"project_id"`
	AssigneeID  *string   `json:"assignee_id"`
	DueDate     *string   `json:"due_date"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ── Auth request / response ───────────────────────────────────────────────────

type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// ── Project request ───────────────────────────────────────────────────────────

type CreateProjectRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	IsPrivate   bool    `json:"is_private"`
}

type UpdateProjectRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	IsPrivate   *bool   `json:"is_private"`
}

// ── Task request ──────────────────────────────────────────────────────────────

type CreateTaskRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Priority    string  `json:"priority"`
	AssigneeID  *string `json:"assignee_id"`
	DueDate     *string `json:"due_date"`
}

// UpdateTaskRequest keys are all optional. We use map[string]any for the raw
// body so we can distinguish "absent" from "explicitly null" (for assignee_id).
// The handler will decode into this and the repo accepts an UpdateTaskParams.
type UpdateTaskParams struct {
	Title       *string
	Description *string
	Status      *string
	Priority    *string
	AssigneeID  *string // nil = no change; use SetAssigneeNull to null it
	SetAssigneeNull bool
	DueDate     *string
	SetDueDateNull  bool
}

// ── Stats ─────────────────────────────────────────────────────────────────────

type AssigneeCount struct {
	AssigneeID   *string `json:"assignee_id"`
	AssigneeName *string `json:"assignee_name"`
	Count        int     `json:"count"`
}

type ProjectStats struct {
	StatusCounts   map[string]int  `json:"status_counts"`
	AssigneeCounts []AssigneeCount `json:"assignee_counts"`
}

// ── Pagination ────────────────────────────────────────────────────────────────

type PageMeta struct {
	Total      int `json:"total"`
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	TotalPages int `json:"total_pages"`
}

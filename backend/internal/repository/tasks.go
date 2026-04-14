package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/taskflow/backend/internal/models"
)

type TaskRepo struct {
	pool *pgxpool.Pool
}

func NewTaskRepo(pool *pgxpool.Pool) *TaskRepo {
	return &TaskRepo{pool: pool}
}

// List returns tasks for a project, with optional status/assignee filters and pagination.
func (r *TaskRepo) List(ctx context.Context, projectID string, statusFilter, assigneeFilter *string, page, limit int) ([]models.Task, int, error) {
	conditions := []string{"project_id = $1"}
	args := []any{projectID}
	idx := 2

	if statusFilter != nil && *statusFilter != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", idx))
		args = append(args, *statusFilter)
		idx++
	}
	if assigneeFilter != nil && *assigneeFilter != "" {
		conditions = append(conditions, fmt.Sprintf("assignee_id = $%d", idx))
		args = append(args, *assigneeFilter)
		idx++
	}

	where := strings.Join(conditions, " AND ")
	offset := (page - 1) * limit

	rows, err := r.pool.Query(ctx,
		fmt.Sprintf(`SELECT id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at
		 FROM tasks WHERE %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`, where, idx, idx+1),
		append(args, limit, offset)...,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		t, err := scanTaskRow(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan task row: %w", err)
		}
		tasks = append(tasks, *t)
	}

	var total int
	_ = r.pool.QueryRow(ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM tasks WHERE %s", where), args...,
	).Scan(&total)

	if tasks == nil {
		tasks = []models.Task{}
	}
	return tasks, total, nil
}

// Create inserts a new task and returns it.
func (r *TaskRepo) Create(ctx context.Context, projectID string, req models.CreateTaskRequest) (*models.Task, error) {
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	row := r.pool.QueryRow(ctx,
		`INSERT INTO tasks (title, description, priority, project_id, assignee_id, due_date)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at`,
		req.Title, req.Description, priority, projectID, req.AssigneeID, req.DueDate,
	)
	return scanTaskSingleRow(row)
}

// GetByID returns a single task.
func (r *TaskRepo) GetByID(ctx context.Context, id string) (*models.Task, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at
		 FROM tasks WHERE id = $1`,
		id,
	)
	t, err := scanTaskSingleRow(row)
	if err != nil {
		return nil, fmt.Errorf("get task: %w", err)
	}
	return t, nil
}

// Update applies a partial update (only provided fields change).
// It correctly handles setting assignee_id or due_date to NULL.
func (r *TaskRepo) Update(ctx context.Context, id string, p models.UpdateTaskParams) (*models.Task, error) {
	setClauses := []string{"updated_at = NOW()"}
	args := []any{}
	idx := 1

	if p.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", idx))
		args = append(args, *p.Title)
		idx++
	}
	if p.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", idx))
		args = append(args, *p.Description)
		idx++
	}
	if p.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", idx))
		args = append(args, *p.Status)
		idx++
	}
	if p.Priority != nil {
		setClauses = append(setClauses, fmt.Sprintf("priority = $%d", idx))
		args = append(args, *p.Priority)
		idx++
	}
	if p.SetAssigneeNull {
		setClauses = append(setClauses, "assignee_id = NULL")
	} else if p.AssigneeID != nil {
		setClauses = append(setClauses, fmt.Sprintf("assignee_id = $%d", idx))
		args = append(args, *p.AssigneeID)
		idx++
	}
	if p.SetDueDateNull {
		setClauses = append(setClauses, "due_date = NULL")
	} else if p.DueDate != nil {
		setClauses = append(setClauses, fmt.Sprintf("due_date = $%d", idx))
		args = append(args, *p.DueDate)
		idx++
	}

	args = append(args, id)
	query := fmt.Sprintf(
		`UPDATE tasks SET %s WHERE id = $%d
		 RETURNING id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at`,
		strings.Join(setClauses, ", "), idx,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	return scanTaskSingleRow(row)
}

// Delete removes a task.
func (r *TaskRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	return err
}

// GetProjectOwnerAndCreator returns the project owner_id along with the task
// so the handler can enforce "owner or task creator" delete permission.
// Note: tasks don't store creator_id in the spec, so we only check project owner.
// This function returns the project's owner_id for a given task.
func (r *TaskRepo) GetProjectOwnerForTask(ctx context.Context, taskID string) (string, error) {
	var ownerID string
	err := r.pool.QueryRow(ctx,
		`SELECT p.owner_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
		taskID,
	).Scan(&ownerID)
	if err != nil {
		return "", err
	}
	return ownerID, nil
}

// Note: scanTaskRow and scanTaskSingleRow are defined in projects.go
// (same package) and are used here directly.

package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/taskflow/backend/internal/models"
)

type ProjectRepo struct {
	pool *pgxpool.Pool
}

func NewProjectRepo(pool *pgxpool.Pool) *ProjectRepo {
	return &ProjectRepo{pool: pool}
}

// ListAll returns every project, visible to all authenticated users.
func (r *ProjectRepo) ListByUser(ctx context.Context, userID string, page, limit int) ([]models.Project, int, error) {
	offset := (page - 1) * limit
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, description, owner_id, is_private, created_at
		 FROM projects
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	var projects []models.Project
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.IsPrivate, &p.CreatedAt); err != nil {
			return nil, 0, err
		}
		projects = append(projects, p)
	}

	var total int
	_ = r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM projects`).Scan(&total)

	if projects == nil {
		projects = []models.Project{}
	}
	return projects, total, nil
}

// Create inserts a new project owned by ownerID.
func (r *ProjectRepo) Create(ctx context.Context, name string, description *string, ownerID string, isPrivate bool) (*models.Project, error) {
	var p models.Project
	err := r.pool.QueryRow(ctx,
		`INSERT INTO projects (name, description, owner_id, is_private)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, name, description, owner_id, is_private, created_at`,
		name, description, ownerID, isPrivate,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.IsPrivate, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}
	return &p, nil
}

// GetByID fetches a single project.
func (r *ProjectRepo) GetByID(ctx context.Context, id string) (*models.Project, error) {
	var p models.Project
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, description, owner_id, is_private, created_at FROM projects WHERE id = $1`,
		id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.IsPrivate, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	return &p, nil
}

// GetWithTasks fetches a project plus all its tasks.
func (r *ProjectRepo) GetWithTasks(ctx context.Context, projectID string) (*models.ProjectWithTasks, error) {
	var p models.ProjectWithTasks
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, description, owner_id, is_private, created_at FROM projects WHERE id = $1`,
		projectID,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.IsPrivate, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at
		 FROM tasks WHERE project_id = $1 ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("get tasks: %w", err)
	}
	defer rows.Close()

	p.Tasks = []models.Task{}
	for rows.Next() {
		t, err := scanTaskRow(rows)
		if err != nil {
			return nil, err
		}
		p.Tasks = append(p.Tasks, *t)
	}
	return &p, nil
}

// Update partially updates a project.
func (r *ProjectRepo) Update(ctx context.Context, id string, req models.UpdateProjectRequest) (*models.Project, error) {
	var p models.Project
	err := r.pool.QueryRow(ctx,
		`UPDATE projects
		 SET name        = COALESCE($1, name),
		     description = CASE WHEN $2::boolean THEN $3 ELSE description END,
		     is_private  = COALESCE($4, is_private)
		 WHERE id = $5
		 RETURNING id, name, description, owner_id, is_private, created_at`,
		req.Name, req.Description != nil, req.Description, req.IsPrivate, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.IsPrivate, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return &p, nil
}

// Delete removes a project and cascades to its tasks.
func (r *ProjectRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM projects WHERE id = $1`, id)
	return err
}

// Stats returns task counts by status and by assignee for a project.
func (r *ProjectRepo) Stats(ctx context.Context, projectID string) (*models.ProjectStats, error) {
	stats := &models.ProjectStats{
		StatusCounts:   make(map[string]int),
		AssigneeCounts: []models.AssigneeCount{},
	}

	// Status counts
	rows, err := r.pool.Query(ctx,
		`SELECT status, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY status`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		stats.StatusCounts[status] = count
	}

	// Assignee counts
	aRows, err := r.pool.Query(ctx,
		`SELECT t.assignee_id, u.name, COUNT(*)
		 FROM tasks t
		 LEFT JOIN users u ON u.id = t.assignee_id
		 WHERE t.project_id = $1
		 GROUP BY t.assignee_id, u.name
		 ORDER BY COUNT(*) DESC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer aRows.Close()
	for aRows.Next() {
		var ac models.AssigneeCount
		if err := aRows.Scan(&ac.AssigneeID, &ac.AssigneeName, &ac.Count); err != nil {
			return nil, err
		}
		stats.AssigneeCounts = append(stats.AssigneeCounts, ac)
	}

	return stats, nil
}

// ── shared task scanner ───────────────────────────────────────────────────────

func scanTaskRow(rows pgx.Rows) (*models.Task, error) {
	var t models.Task
	var dueDate *time.Time
	err := rows.Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &dueDate, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if dueDate != nil {
		s := dueDate.Format("2006-01-02")
		t.DueDate = &s
	}
	return &t, nil
}

func scanTaskSingleRow(row pgx.Row) (*models.Task, error) {
	var t models.Task
	var dueDate *time.Time
	err := row.Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &dueDate, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if dueDate != nil {
		s := dueDate.Format("2006-01-02")
		t.DueDate = &s
	}
	return &t, nil
}

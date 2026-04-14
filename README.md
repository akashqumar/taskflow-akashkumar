# TaskFlow

A complete task management system built as a take-home engineering assignment. Users can register, log in, create projects, add and manage tasks, and assign work to team members.

---

## 1. Overview

**What it is:** A full-stack web application for managing projects and tasks within teams.

**What it does:**
- User registration and authentication (JWT, bcrypt)
- Create, update, and manage project details
- Add tasks with status (todo / in_progress / done), priority (low / medium / high), assignees, and due dates
- Interactive drag-and-drop Kanban board view using `@dnd-kit`
- Real-time task synchronization across connected clients using Server-Sent Events (SSE)
- Optimistic UI updates for ultra-fast task interactions and deletion
- Filter tasks by status and assignee
- Project stats endpoint and detailed breakdown modal
- Dark / light mode toggle that persists across sessions
- Fully Dockerized — one command to run everything

**Tech stack:**

| Layer | Technology |
|---|---|
| Backend | Go 1.22, chi router, pgx/v5, golang-migrate |
| Auth | JWT (golang-jwt/v5), bcrypt cost 12 |
| Database | PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite |
| HTTP client | Axios (interceptors for JWT injection + 401 redirect) |
| Server state | TanStack Query v5 (optimistic UI, cache invalidation) |
| Styling | Vanilla CSS with custom properties (dark/light mode) |
| Infrastructure | Docker + Docker Compose, nginx (frontend proxy) |

---

## 2. Architecture Decisions

### Backend

**Go + chi over a framework like Gin:**  
Chi is idiomatic, composable, and closer to `net/http`. Fewer abstractions mean the code is easier to review — every handler is just `func(w, r)`.

**Raw SQL (pgx/v5) over an ORM:**  
ORMs hide what happens at the database layer. With raw SQL, every query is explicit and reviewable. pgx/v5 is the fastest Go PostgreSQL driver and natively handles connection pooling.

**golang-migrate over ORM auto-migrate:**  
Auto-migrate is a disqualifier in the spec. golang-migrate with `file://` source runs migrations on startup and supports proper `up`/`down` files. The tradeoff is no embedded binary support without changing the project layout — acceptable for this scope.

**Structured logging with `log/slog`:**  
slog is stdlib in Go 1.21+. JSON output, zero dependencies, structured fields. For production you'd switch to zap for performance, noted in "What I'd Do With More Time."

**Partial updates via `map[string]json.RawMessage`:**  
Standard `*string` fields can't distinguish "field absent" from "field explicitly set to null" when JSON-decoding. The task handler decodes raw JSON to a map first, then builds `UpdateTaskParams`, which tracks both `AssigneeID *string` and `SetAssigneeNull bool`. This lets callers send `{"assignee_id": null}` to unassign cleanly.

### Frontend

**Vanilla CSS over Tailwind or a component library:**  
Tailwind requires toolchain setup (PostCSS, config) that adds friction in Docker. A hand-crafted CSS design system with custom properties gives full control and is trivially inspectable. Dark/light mode is a single `data-theme` attribute on `<html>`.

**TanStack Query for server state:**  
Optimistic updates (task status changes) are the primary reason. React Query's `onMutate` / `onError` rollback pattern is the cleanest React-native approach without external state managers.

**localStorage over httpOnly cookies for JWT:**  
Simpler to implement and sufficient for a take-home. In production, httpOnly cookie + CSRF protection would be the right call (noted below).

### What I intentionally left out

- **Task creator tracking:** The schema doesn't store a `creator_id` on tasks, so delete permission is checked against the project owner only. Adding `created_by` to tasks is a one-migration change.
- **Real-time updates (SSE/WebSocket):** Would require backend changes + EventSource wiring. Not in scope for this timeline.
- **Full RBAC:** Owner vs. member is sufficient for the spec. A `project_members` join table would unlock per-project roles.
- **Rate limiting:** Production-critical but outside the assignment scope.

---

## 3. Running Locally

> Requirements: Docker Desktop (or docker + docker-compose). Nothing else needed.

```bash
git clone https://github.com/your-username/taskflow-yourname
cd taskflow-yourname

# Copy environment file (defaults work out of the box)
cp .env.example .env

# Build and start all services
docker compose up --build
```

- **Frontend:** http://localhost:3000
- **API:** http://localhost:8080
- **Health check:** http://localhost:8080/health

Migrations run automatically on backend startup. Seed data is inserted if the database is empty.

---

## 4. Running Migrations

Migrations run **automatically** when the backend container starts. No manual steps required.

If you need to run them manually (e.g., for local development without Docker):

```bash
# Install golang-migrate CLI
brew install golang-migrate

# Run migrations
migrate -path backend/migrations -database "postgres://taskflow:taskflow_secret@localhost:5432/taskflow?sslmode=disable" up

# Roll back one step
migrate -path backend/migrations -database "postgres://..." down 1
```

---

## 5. Test Credentials

The database is seeded automatically on first startup:

```
Email:    test@example.com
Password: password123
```

The seed creates:
- 1 user (above)
- 1 project: "Website Redesign"
- 3 tasks with different statuses (todo / in_progress / done)

---

## 6. API Reference

All protected endpoints require: `Authorization: Bearer <token>`

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register (`name`, `email`, `password`) → `{token, user}` |
| POST | `/auth/login` | Login (`email`, `password`) → `{token, user}` |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects` | List owned/collaborated projects (supports `?page=&limit=`) |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Project details + tasks |
| PATCH | `/projects/:id` | Update name/description (owner only) |
| DELETE | `/projects/:id` | Delete project + tasks (owner only) |
| GET | `/projects/:id/stats` | Task counts by status and assignee |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects/:id/tasks` | List tasks (supports `?status=&assignee=&page=&limit=`) |
| POST | `/projects/:id/tasks` | Create task |
| PATCH | `/tasks/:id` | Partial update (all fields optional; `null` unsets assignee/due_date) |
| DELETE | `/tasks/:id` | Delete task (project owner only) |

### Error responses

```json
// 400 Validation error
{"error": "validation failed", "fields": {"email": "is required"}}

// 401 Unauthenticated
{"error": "unauthorized"}

// 403 Forbidden
{"error": "forbidden"}

// 404 Not found
{"error": "not found"}
```

### Example: Create a task

```bash
curl -X POST http://localhost:8080/projects/<project-id>/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high", "due_date": "2026-05-01"}'
```

---

## 7. Running Integration Tests

```bash
cd backend

# Start postgres for testing
docker run -d --name taskflow-test-db \
  -e POSTGRES_USER=taskflow \
  -e POSTGRES_PASSWORD=taskflow_secret \
  -e POSTGRES_DB=taskflow_test \
  -p 5433:5432 postgres:16-alpine

# Run integration tests
TEST_DATABASE_URL="postgres://taskflow:taskflow_secret@localhost:5433/taskflow_test?sslmode=disable" \
  go test -tags integration -v ./tests/...
```

---

## 8. What You'd Do With More Time

**Security improvements:**
- Switch from `localStorage` JWT to `httpOnly` cookies with CSRF protection — XSS can't steal httpOnly cookies
- Add rate limiting on auth endpoints (token bucket per IP)
- Rotate JWT secret without downtime (key versioning in claims)

**Product features:**
- `created_by` on tasks so task creators can also delete their own tasks
- Project invite system with `project_members` table and role-based access
- File attachments on tasks (S3/R2)
- Markdown or Rich-text formatting support for task descriptions

**Engineering quality:**
- Switch from `log/slog` to `uber-go/zap` for production-grade performance
- Add request tracing (OpenTelemetry) 
- Testcontainers for hermetic integration tests (currently requires a manually started postgres)
- GitHub Actions CI that runs tests + docker build on every PR
- Proper health check endpoint that validates DB connectivity (currently just returns "ok")
- Pagination cursor-based instead of offset-based for large datasets

**Shortcuts I took:**
- Member list on the project detail page is inferred from task assignees + the current user rather than a proper `project_members` roster. This means you can "assign" any UUID but the name won't resolve unless they have a task in the project.
- The `GET /projects/:id` endpoint doesn't enforce access control beyond authentication — any authenticated user can view any project by ID if they know it. The `GET /projects` listing correctly filters, but the detail view should also check membership.
- No pagination on the task board (tasks fetched via project detail endpoint). High-volume projects would need the tasks endpoint with pagination.

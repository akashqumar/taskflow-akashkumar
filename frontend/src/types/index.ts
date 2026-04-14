export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_private: boolean;
  created_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  project_id: string;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithTasks extends Project {
  tasks: Task[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ProjectsResponse {
  projects: Project[];
  meta: PageMeta;
}

export interface TasksResponse {
  tasks: Task[];
  meta: PageMeta;
}

export interface ProjectStats {
  status_counts: Record<TaskStatus, number>;
  assignee_counts: Array<{
    assignee_id: string | null;
    assignee_name: string | null;
    count: number;
  }>;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  is_private?: boolean;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  is_private?: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignee_id?: string;
  due_date?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string | null;
  due_date?: string | null;
}

export interface ApiError {
  error: string;
  fields?: Record<string, string>;
}

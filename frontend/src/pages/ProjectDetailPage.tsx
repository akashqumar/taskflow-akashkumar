import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowLeft, Trash2, Info, X, Calendar, FolderOpen, Edit2 } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { projectsApi, tasksApi, usersApi } from '../api/client';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import EditProjectModal from '../components/EditProjectModal';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import type { ProjectWithTasks, Task, TaskStatus, User } from '../types';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo',        label: 'To Do',      color: 'var(--todo)' },
  { status: 'in_progress', label: 'In Progress', color: 'var(--in-progress)' },
  { status: 'done',        label: 'Done',        color: 'var(--done)' },
];

// ── Project info modal ──────────────────────────────────────────────────────
function ProjectInfoModal({
  project,
  members,
  onClose,
}: {
  project: ProjectWithTasks;
  members: User[];
  onClose: () => void;
}) {
  const statusCounts: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
  project.tasks.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1; });
  const owner = members.find((m) => m.id === project.owner_id);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal project-info-modal" role="dialog" aria-modal="true" aria-labelledby="project-info-title">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="project-info-icon"><FolderOpen size={16} /></div>
            <h2 className="modal-title" id="project-info-title">Project Details</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="project-info-body">
          {/* 1. Task Breakdown — shown first */}
          <div className="project-info-field">
            <span className="project-info-label">Task Breakdown</span>
            <div className="project-info-stats">
              <div className="project-info-stat todo">
                <span className="project-info-stat-num">{statusCounts['todo']}</span>
                <span>To Do</span>
              </div>
              <div className="project-info-stat in-progress">
                <span className="project-info-stat-num">{statusCounts['in_progress']}</span>
                <span>In Progress</span>
              </div>
              <div className="project-info-stat done">
                <span className="project-info-stat-num">{statusCounts['done']}</span>
                <span>Done</span>
              </div>
            </div>
          </div>

          {/* 2. Project Name */}
          <div className="project-info-field">
            <span className="project-info-label">Project Name</span>
            <span className="project-info-value project-info-name">{project.name}</span>
          </div>

          {/* 3. Description */}
          {project.description && (
            <div className="project-info-field">
              <span className="project-info-label">Description</span>
              <span className="project-info-value project-info-desc">{project.description}</span>
            </div>
          )}

          {/* 4. Owner + Created side by side */}
          <div className="project-info-row">
            <div className="project-info-field">
              <span className="project-info-label">Owner</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <div className="navbar-avatar" style={{ width: 24, height: 24, fontSize: '0.6rem' }}>
                  {owner?.name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <span className="project-info-value">{owner?.name ?? project.owner_id}</span>
              </div>
            </div>
            <div className="project-info-field">
              <span className="project-info-label">Created</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <Calendar size={13} style={{ color: 'var(--text-3)' }} />
                <span className="project-info-value">
                  {formatDistanceToNow(parseISO(project.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Droppable column ────────────────────────────────────────────────────────
function DroppableColumn({ status, isOver, children }: { status: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`kanban-column-body${isOver ? ' drag-over' : ''}`}>
      {children}
    </div>
  );
}

// ── Draggable task wrapper ──────────────────────────────────────────────────
function DraggableTask({ task, members, onEdit, onDelete, onAdvance }: {
  task: Task; members: User[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onAdvance: (id: string, status: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} members={members} onEdit={onEdit} onDelete={onDelete} onAdvance={onAdvance} />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: project, isLoading, isError } = useQuery<ProjectWithTasks>({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });

  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  });
  const allUsers: User[] = usersData?.users ?? [];

  // ── Real-time stats from local (optimistic) data ──────────────────────────
  const localStatusCounts = useMemo(() => {
    const c: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
    (project?.tasks ?? []).forEach((t) => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [project?.tasks]);

  const totalTasks = project?.tasks.length ?? 0;
  const donePct = totalTasks > 0 ? Math.round(((localStatusCounts['done'] ?? 0) / totalTasks) * 100) : 0;

  // ── SSE: real-time updates from other clients ─────────────────────────────
  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('tf_token');
    if (!token) return;
    const es = new EventSource(`/api/projects/${id}/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = () => { queryClient.invalidateQueries({ queryKey: ['project', id] }); };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id, queryClient]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      tasksApi.update(taskId, { status }),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['project', id] });
      const prev = queryClient.getQueryData<ProjectWithTasks>(['project', id]);
      queryClient.setQueryData<ProjectWithTasks>(['project', id], (old) =>
        old ? { ...old, tasks: old.tasks.map((t) => t.id === taskId ? { ...t, status } : t) } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['project', id], ctx.prev);
      toast('Failed to update status', 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
  });

  // ── OPTIMISTIC task delete ────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(taskId),
    onMutate: async (taskId) => {
      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['project', id] });
      const prev = queryClient.getQueryData<ProjectWithTasks>(['project', id]);
      // Remove task immediately from local cache
      queryClient.setQueryData<ProjectWithTasks>(['project', id], (old) =>
        old ? { ...old, tasks: old.tasks.filter((t) => t.id !== taskId) } : old
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back on failure
      if (ctx?.prev) queryClient.setQueryData(['project', id], ctx.prev);
      toast('Failed to delete task', 'error');
    },
    onSuccess: () => {
      toast('Task deleted', 'success');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
  });

  // ── OPTIMISTIC project delete ─────────────────────────────────────────────
  const deleteProjectMutation = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onMutate: async () => {
      // Optimistically remove from projects list
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const prevProjects = queryClient.getQueryData(['projects', 1]);
      queryClient.setQueriesData({ queryKey: ['projects'] }, (old: any) => {
        if (!old?.projects) return old;
        return { ...old, projects: old.projects.filter((p: any) => p.id !== id) };
      });
      return { prevProjects };
    },
    onSuccess: () => {
      toast('Project deleted', 'success');
      navigate('/projects');
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prevProjects) queryClient.setQueryData(['projects', 1], ctx.prevProjects);
      toast('Failed to delete project', 'error');
    },
  });

  // ── DnD ───────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (ev: DragStartEvent) =>
    setActiveTask((ev.active.data.current?.task as Task) ?? null);

  const handleDragOver = (ev: { over: { id: string } | null }) =>
    setOverColumn(ev.over ? (ev.over.id as TaskStatus) : null);

  const handleDragEnd = (ev: DragEndEvent) => {
    const { over, active } = ev;
    setActiveTask(null);
    setOverColumn(null);
    if (!over) return;
    const dragged = active.data.current?.task as Task;
    const newStatus = over.id as TaskStatus;
    if (dragged && dragged.status !== newStatus)
      statusMutation.mutate({ taskId: dragged.id, status: newStatus });
  };

  // ── Members ───────────────────────────────────────────────────────────────
  const memberMap = new Map<string, User>();
  allUsers.forEach((u) => memberMap.set(u.id, u));
  if (user) memberMap.set(user.id, user);
  const members = Array.from(memberMap.values());

  const filteredTasks = useMemo(() => {
    let tasks = project?.tasks ?? [];
    if (statusFilter) tasks = tasks.filter((t) => t.status === statusFilter);
    if (assigneeFilter) tasks = tasks.filter((t) => t.assignee_id === assigneeFilter);
    return tasks;
  }, [project?.tasks, statusFilter, assigneeFilter]);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="page"><div className="container">
      <div className="spinner-page"><div className="spinner spinner-lg" /></div>
    </div></div>
  );
  if (isError || !project) return (
    <div className="page"><div className="container">
      <p>Project not found. <Link to="/projects">Go back</Link></p>
    </div></div>
  );

  const isOwner = project.owner_id === user?.id;

  // Truncate long name/description in the header
  const MAX_NAME = 52;
  const MAX_DESC = 110;
  const nameDisplay = project.name.length > MAX_NAME ? project.name.slice(0, MAX_NAME) + '\u2026' : project.name;
  const descDisplay = project.description && project.description.length > MAX_DESC
    ? project.description.slice(0, MAX_DESC) + '\u2026'
    : project.description;

  return (
    <div className="page">
      <div className="container">

        {/* ── Header ── */}
        <div className="project-detail-header">
          <div className="project-detail-meta">
            <Link to="/projects" className="btn btn-ghost btn-icon" aria-label="Back to projects" style={{ flexShrink: 0 }}>
              <ArrowLeft size={16} />
            </Link>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h1 className="project-detail-title">{nameDisplay}</h1>
                {/* Info button — opens full detail popup */}
                <button
                  className="btn btn-ghost btn-icon detail-info-btn"
                  onClick={() => setShowProjectInfo(true)}
                  title="View full project details"
                  aria-label="View project details"
                >
                  <Info size={14} />
                </button>
              </div>
              {descDisplay && (
                <p className="project-detail-desc">{descDisplay}</p>
              )}

            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {isOwner && (
              <>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => setShowEditProjectModal(true)}
                  title="Edit project"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => { if (confirm('Delete this project and all tasks?')) deleteProjectMutation.mutate(); }}
                  title="Delete project"
                  disabled={deleteProjectMutation.isPending}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button
              id="add-task-btn"
              className="btn btn-primary"
              onClick={() => { setEditingTask(null); setShowTaskModal(true); }}
            >
              <Plus size={15} /> Add Task
            </button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        {totalTasks > 0 && (
          <div className="stats-bar">
            <div className="stats-bar-counts">
              <span className="stats-count todo">{localStatusCounts['todo']} To Do</span>
              <span className="stats-dot" />
              <span className="stats-count in-progress">{localStatusCounts['in_progress']} In Progress</span>
              <span className="stats-dot" />
              <span className="stats-count done">{localStatusCounts['done']} Done</span>
            </div>
            <div className="stats-progress-track">
              <div className="stats-progress-fill" style={{ width: `${donePct}%` }} />
            </div>
            <span className="stats-pct">{donePct}%</span>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="project-filters">
          <select id="filter-status" className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select id="filter-assignee" className="filter-select" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">All assignees</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {(statusFilter || assigneeFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setStatusFilter(''); setAssigneeFilter(''); }}>Clear filters</button>
          )}
        </div>

        {/* ── Kanban ── */}
        {totalTasks === 0 ? (
          <EmptyState
            icon={<Plus size={32} />}
            title="No tasks yet"
            description="Create your first task to get started"
            action={<button className="btn btn-primary" onClick={() => setShowTaskModal(true)}><Plus size={14} /> Add Task</button>}
          />
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as any} onDragEnd={handleDragEnd}>
            <div className="kanban-board">
              {COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.status);
                return (
                  <div key={col.status} className="kanban-column">
                    <div className="kanban-column-header">
                      <span className="kanban-column-title" style={{ color: col.color }}>{col.label}</span>
                      <span className="kanban-column-count">{colTasks.length}</span>
                    </div>
                    <DroppableColumn status={col.status} isOver={overColumn === col.status}>
                      {colTasks.length === 0 ? (
                        <div className={`kanban-empty${overColumn === col.status ? ' drag-target' : ''}`}>
                          {overColumn === col.status ? '✦ Drop here' : 'Drop tasks here'}
                        </div>
                      ) : (
                        colTasks.map((task) => (
                          <DraggableTask
                            key={task.id}
                            task={task}
                            members={members}
                            onEdit={(t) => { setEditingTask(t); setShowTaskModal(true); }}
                            onDelete={(tid) => { if (confirm('Delete this task?')) deleteMutation.mutate(tid); }}
                            onAdvance={(tid, curStatus) => {
                              const next: Record<string, TaskStatus> = { todo: 'in_progress', in_progress: 'done' };
                              if (next[curStatus]) statusMutation.mutate({ taskId: tid, status: next[curStatus] });
                            }}
                          />
                        ))
                      )}
                    </DroppableColumn>
                  </div>
                );
              })}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeTask && (
                <div style={{ transform: 'rotate(2deg)', opacity: 0.92, pointerEvents: 'none' }}>
                  <TaskCard task={activeTask} members={members} onEdit={() => {}} onDelete={() => {}} onAdvance={() => {}} isDraft />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

      </div>

      {/* ── Modals ── */}
      {showTaskModal && (
        <TaskModal
          projectId={id!}
          task={editingTask}
          members={members}
          onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
        />
      )}

      {showProjectInfo && (
        <ProjectInfoModal
          project={project}
          members={members}
          onClose={() => setShowProjectInfo(false)}
        />
      )}

      {showEditProjectModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditProjectModal(false)}
        />
      )}
    </div>
  );
}

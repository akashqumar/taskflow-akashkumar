import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../api/client';
import { useToast } from './Toast';
import type { Task, User, TaskStatus, TaskPriority, ApiError } from '../types';
import type { AxiosError } from 'axios';

interface TaskModalProps {
  projectId: string;
  task?: Task | null;       // null = create mode, Task = edit mode
  members: User[];
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function TaskModal({ projectId, task, members, onClose }: TaskModalProps) {
  const isEdit = Boolean(task);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
  };

  const createMutation = useMutation({
    mutationFn: () => tasksApi.create(projectId, {
      title,
      description: description || undefined,
      priority,
      assignee_id: assigneeId || undefined,
      due_date: dueDate || undefined,
    }),
    onSuccess: () => { invalidate(); toast('Task created!', 'success'); onClose(); },
    onError: (err: AxiosError<ApiError>) => {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      else toast(data?.error ?? 'Failed to create task', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => tasksApi.update(task!.id, {
      title,
      description: description || undefined,
      status,
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
    }),
    onSuccess: () => { invalidate(); toast('Task updated!', 'success'); onClose(); },
    onError: (err: AxiosError<ApiError>) => {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      else toast(data?.error ?? 'Failed to update task', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.delete(task!.id),
    onSuccess: () => { invalidate(); toast('Task deleted', 'info'); onClose(); },
    onError: () => toast('Failed to delete task', 'error'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!title.trim()) { setErrors({ title: 'is required' }); return; }
    isEdit ? updateMutation.mutate() : createMutation.mutate();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-header">
          <h2 className="modal-title" id="task-modal-title">{isEdit ? 'Edit Task' : 'New Task'}</h2>
          <button id="close-task-modal" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {/* Title */}
          <div className="form-group">
            <label className="form-label" htmlFor="task-title">Title *</label>
            <input
              id="task-title"
              className={`form-input ${errors.title ? 'error' : ''}`}
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="task-description">Description</label>
            <textarea
              id="task-description"
              className="form-textarea"
              placeholder="Add more details…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Status + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {isEdit && (
              <div className="form-group">
                <label className="form-label" htmlFor="task-status">Status</label>
                <select id="task-status" className="form-select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={isEdit ? {} : { gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="task-priority">Priority</label>
              <select id="task-priority" className="form-select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Due date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="task-assignee">Assignee</label>
              <select id="task-assignee" className="form-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="task-due-date">Due Date</label>
              <input
                id="task-due-date"
                type="date"
                className="form-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Actions */}
          {isEdit ? (
            <div className="modal-actions-row">
              <button
                id="delete-task-btn"
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => { if (window.confirm('Delete this task?')) deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={13} />
                Delete
              </button>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button id="save-task-btn" type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button id="create-task-btn" type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create Task'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/client';
import { useToast } from './Toast';
import type { ApiError, ProjectWithTasks } from '../types';
import type { AxiosError } from 'axios';

interface EditProjectModalProps {
  project: ProjectWithTasks | null;
  onClose: () => void;
}

export default function EditProjectModal({ project, onClose }: EditProjectModalProps) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
    }
  }, [project]);

  const mutation = useMutation({
    mutationFn: () => projectsApi.update(project!.id, { name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project!.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast('Project updated!', 'success');
      onClose();
    },
    onError: (err: AxiosError<ApiError>) => {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      else toast(data?.error ?? 'Failed to update project', 'error');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!name.trim()) { setErrors({ name: 'is required' }); return; }
    if (project) mutation.mutate();
  };

  if (!project) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
        <div className="modal-header">
          <h2 className="modal-title" id="edit-project-title">Edit Project</h2>
          <button id="close-edit-project" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="project-name">Project Name *</label>
            <input
              id="project-name"
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder="e.g. Website Redesign"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              className="form-textarea"
              placeholder="What is this project about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <button id="cancel-edit-project" type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button id="submit-edit-project" type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

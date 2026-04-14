import { useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/client';
import { useToast } from './Toast';
import type { ApiError } from '../types';
import type { AxiosError } from 'axios';

interface CreateProjectModalProps {
  onClose: () => void;
}

export default function CreateProjectModal({ onClose }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => projectsApi.create({ name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast('Project created!', 'success');
      onClose();
    },
    onError: (err: AxiosError<ApiError>) => {
      const data = err.response?.data;
      if (data?.fields) setErrors(data.fields);
      else toast(data?.error ?? 'Failed to create project', 'error');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!name.trim()) { setErrors({ name: 'is required' }); return; }
    mutation.mutate();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <div className="modal-header">
          <h2 className="modal-title" id="create-project-title">New Project</h2>
          <button id="close-create-project" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
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
            <button id="cancel-create-project" type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button id="submit-create-project" type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { FolderOpen, Calendar, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Project } from '../types';

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <div
      id={`project-card-${project.id}`}
      className="card card-clickable"
      onClick={() => navigate(`/projects/${project.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${project.id}`)}
      aria-label={`Open project ${project.name}`}
    >
      <div className="project-card-header">
        <div className="project-card-icon">
          <FolderOpen size={18} />
        </div>
        <ChevronRight size={16} style={{ color: 'var(--text-3)', marginTop: 2 }} />
      </div>

      <div className="project-card-name truncate">{project.name}</div>

      {project.description ? (
        <div className="project-card-desc" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {project.description}
        </div>
      ) : (
        <div className="project-card-desc" style={{ fontStyle: 'italic' }}>No description</div>
      )}

      <div className="project-card-footer">
        <div className="project-card-meta">
          <Calendar size={11} />
          {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}

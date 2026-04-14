import { Calendar, AlertCircle, ChevronRight, Trash2 } from 'lucide-react';
import { isAfter, parseISO } from 'date-fns';
import type { Task, User, TaskStatus } from '../types';

const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: null,
};

const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Med', high: 'High' };

interface TaskCardProps {
  task: Task;
  members: User[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onAdvance: (id: string, status: TaskStatus) => void;
  isDraft?: boolean;
}

export default function TaskCard({ task, members, onEdit, onDelete, onAdvance, isDraft }: TaskCardProps) {
  const assignee = members.find((m) => m.id === task.assignee_id);
  const isOverdue = task.due_date
    ? isAfter(new Date(), parseISO(task.due_date)) && task.status !== 'done'
    : false;

  const initials = assignee?.name
    ? assignee.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <div
      id={isDraft ? undefined : `task-card-${task.id}`}
      className={`card task-card${isDraft ? ' task-card-draft' : ''}`}
      onClick={() => !isDraft && onEdit(task)}
      role={isDraft ? undefined : 'button'}
      tabIndex={isDraft ? undefined : 0}
      onKeyDown={(e) => !isDraft && e.key === 'Enter' && onEdit(task)}
      aria-label={isDraft ? undefined : `View task: ${task.title}`}
    >
      {/* Title: max 2 lines, tooltip shows full text */}
      <div className="task-card-title" title={task.title}>
        {task.title}
      </div>

      {/* Description preview — 1 line */}
      {task.description && !isDraft && (
        <div className="task-card-desc">{task.description}</div>
      )}

      {/* Meta row: [badge] ─────────────── [date] [avatar] [actions] */}
      <div className="task-card-meta" style={{ position: 'relative' }}>
        {/* Left: priority badge */}
        <span className={`badge badge-${task.priority}`}>
          {task.priority === 'high' && <AlertCircle size={9} />}
          {PRIORITY_LABEL[task.priority]}
        </span>

        {/* Center: date */}
        {task.due_date && (
          <span className={`task-card-due${isOverdue ? ' overdue' : ''}`} style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <Calendar size={10} />
            {task.due_date}
          </span>
        )}

        {/* Right: avatar */}
        <div className="task-card-right">
          {initials && (
            <div className="task-card-assignee" title={assignee?.name}>
              {initials}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

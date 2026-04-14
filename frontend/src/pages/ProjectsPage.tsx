import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { projectsApi } from '../api/client';
import ProjectCard from '../components/ProjectCard';
import CreateProjectModal from '../components/CreateProjectModal';
import EmptyState from '../components/EmptyState';
import type { ProjectsResponse } from '../types';

const PAGE_LIMIT = 9; // 3-column grid looks best with multiples of 3

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery<ProjectsResponse>({
    queryKey: ['projects', page],
    queryFn: () => projectsApi.list(page, PAGE_LIMIT).then((r) => r.data),
    placeholderData: (prev) => prev, // keep previous data while fetching next page
  });

  const projects = data?.projects ?? [];
  const meta = data?.meta;
  const totalPages = meta?.total_pages ?? 1;

  // Client-side search within the current page
  const filtered = search.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSearch(''); // clear search when changing page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page">
      <div className="container">

        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <span className="gradient-text">Projects</span>
            </h1>
            <p className="text-muted text-sm mt-1">
              {meta ? `${meta.total} project${meta.total !== 1 ? 's' : ''} total` : 'Loading…'}
            </p>
          </div>
          <button
            id="create-project-btn"
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} />
            New Project
          </button>
        </div>

        {/* Search */}
        {(projects.length > 0 || search) && (
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: '1.5rem' }}>
            <Search
              size={15}
              style={{
                position: 'absolute', left: '0.75rem', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none',
              }}
            />
            <input
              id="projects-search"
              className="form-input"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.2rem' }}
            />
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="projects-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card" style={{ height: 160 }}>
                <div className="skeleton" style={{ height: 40, width: 40, borderRadius: 8, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 18, width: '60%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 14, width: '80%' }} />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="form-error-banner">Failed to load projects. Please refresh the page.</div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState
            icon="🗂️"
            title={search ? 'No projects match your search' : 'No projects yet'}
            description={
              search
                ? 'Try a different search term.'
                : 'Create your first project to get started.'
            }
            action={
              !search ? (
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  <Plus size={14} /> Create Project
                </button>
              ) : undefined
            }
          />
        )}

        {/* Grid */}
        {!isLoading && !isError && filtered.length > 0 && (
          <>
            <div className="projects-grid">
              {filtered.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>

            {/* Pagination — only shown when not searching and there are multiple pages */}
            {!search && totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-ghost btn-sm pagination-btn"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                  Prev
                </button>

                <div className="pagination-pages">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      className={`pagination-page${p === page ? ' active' : ''}`}
                      onClick={() => handlePageChange(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <button
                  className="btn btn-ghost btn-sm pagination-btn"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

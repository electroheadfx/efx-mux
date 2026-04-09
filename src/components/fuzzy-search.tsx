// fuzzy-search.tsx -- Ctrl+P fuzzy project search overlay
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { getProjects, switchProject, getGitStatus } from '../state-manager';
import type { ProjectEntry } from '../state-manager';

// ---------------------------------------------------------------------------
// Module-level signals
// ---------------------------------------------------------------------------

const visible = signal(false);
const query = signal('');
const selectedIndex = signal(0);
const fuzzyProjects = signal<ProjectEntry[]>([]);
const gitBranches = signal<Record<string, string>>({});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fuzzy match: case-insensitive substring search */
function fuzzyMatch(projects: ProjectEntry[], q: string): ProjectEntry[] {
  if (!q.trim()) return projects;
  const lower = q.toLowerCase();
  return projects.filter(p => p.name.toLowerCase().includes(lower));
}

function openSearch() {
  visible.value = true;
  query.value = '';
  selectedIndex.value = 0;
  loadProjects();
}

function closeSearch() {
  visible.value = false;
  query.value = '';
  selectedIndex.value = 0;
}

async function loadProjects() {
  try {
    const projects = await getProjects();
    fuzzyProjects.value = projects;
    // Fetch git branches in parallel
    const branches = await Promise.allSettled(
      projects.map(async (p) => {
        try {
          const status = await getGitStatus(p.path);
          return { name: p.name, branch: status.branch };
        } catch {
          return { name: p.name, branch: '' };
        }
      })
    );
    const newBranches: Record<string, string> = {};
    for (const r of branches) {
      if (r.status === 'fulfilled') {
        newBranches[r.value.name] = r.value.branch;
      }
    }
    gitBranches.value = newBranches;
  } catch (err) {
    console.warn('[efxmux] Fuzzy search: failed to load projects:', err);
  }
}

async function selectCurrent() {
  const results = fuzzyMatch(fuzzyProjects.value, query.value);
  if (results.length === 0) return;
  const project = results[selectedIndex.value];
  if (!project) return;
  try {
    await switchProject(project.name);
  } catch (err) {
    console.warn('[efxmux] Fuzzy search: failed to switch project:', err);
  }
  closeSearch();
}

// ---------------------------------------------------------------------------
// Global Ctrl+P handler (module-scope -- always active)
// ---------------------------------------------------------------------------

function handleGlobalKeydown(e: KeyboardEvent) {
  if (!visible.value) return;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      closeSearch();
      break;
    case 'ArrowDown':
      e.preventDefault();
      {
        const results = fuzzyMatch(fuzzyProjects.value, query.value);
        selectedIndex.value = Math.min(selectedIndex.value + 1, results.length - 1);
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      break;
    case 'Enter':
      e.preventDefault();
      selectCurrent();
      break;
  }
}

document.addEventListener('keydown', handleGlobalKeydown);

// Also listen for open-fuzzy-search events from main.js
document.addEventListener('open-fuzzy-search', openSearch);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SearchResult({ project, index }: { project: ProjectEntry; index: number }) {
  const isSelected = selectedIndex.value === index;
  const branch = gitBranches.value[project.name] || '';

  return (
    <div
      class={`flex items-center px-4 py-2 text-sm text-text-bright cursor-pointer min-h-[36px] ${
        isSelected ? 'bg-accent/12' : 'bg-transparent'
      }`}
      data-index={index}
      onClick={() => {
        selectedIndex.value = index;
        selectCurrent();
      }}
      onMouseEnter={() => { selectedIndex.value = index; }}
    >
      <span class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {project.name}
      </span>
      {branch && (
        <span class="text-[11px] text-accent ml-4 shrink-0">
          {branch}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FuzzySearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when visible
  useEffect(() => {
    if (visible.value && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible.value]);

  if (!visible.value) return null;

  const results = fuzzyMatch(fuzzyProjects.value, query.value);

  return (
    <div
      class="fixed inset-0 bg-black/30 z-[100] flex flex-col items-center pt-[20vh] animate-[fadeInSearch_100ms_ease-out]"
      onClick={closeSearch}
    >
      <div
        class="w-[480px] max-h-[60vh] bg-bg-raised border border-border rounded shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[101] overflow-hidden flex flex-col animate-[fadeInSearch_100ms_ease-out]"
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Search input */}
        <div class="flex items-center px-4 py-3 border-b border-border">
          <span class="text-accent mr-2 text-base">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Switch to project..."
            class="flex-1 bg-transparent border-none outline-none text-base text-text-bright caret-accent"
            value={query.value}
            onInput={(e) => {
              query.value = (e.target as HTMLInputElement).value;
              selectedIndex.value = 0;
            }}
          />
        </div>

        {/* Results */}
        <div class="overflow-y-auto max-h-[360px]">
          {results.length === 0 ? (
            <div class="p-4 text-sm text-text text-center">
              No matching projects
            </div>
          ) : (
            results.map((p, i) => (
              <SearchResult project={p} index={i} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

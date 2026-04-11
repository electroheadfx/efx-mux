// gsd-viewer.tsx -- GSD Markdown viewer with checkbox write-back + auto-refresh
// D-01: Checkbox write-back via write_checkbox Rust command
// D-02: marked.js renders markdown with task checkboxes
// D-03: Auto-refresh on md-file-changed Tauri event
// Migrated from Arrow.js to Preact TSX (Phase 6.1)

import { useRef, useEffect } from 'preact/hooks';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { marked } from 'marked';
import { activeProjectName, projects } from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { colors } from '../tokens';

/**
 * Build a map of checkbox index -> line number (0-indexed).
 * Scans markdown text for task list items: `- [ ]`, `- [x]`, `* [ ]`, `* [x]`.
 */
function buildLineMap(text: string): number[] {
  const lines = text.split('\n');
  const lineMap: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*[-*]\s*\[[ xX]\]/.test(lines[i])) {
      lineMap.push(i);
    }
  }
  return lineMap;
}

/**
 * Inject data-line attributes into rendered HTML.
 * Finds <input> checkboxes and wraps their parent <li> with data-line.
 */
function injectLineNumbers(renderedHtml: string, lineMap: number[]): string {
  let checkboxIndex = 0;
  return renderedHtml.replace(
    /<input type="checkbox" class="task-checkbox"([^>]*)>/g,
    (_match: string, attrs: string) => {
      const line = lineMap[checkboxIndex] !== undefined ? lineMap[checkboxIndex] : -1;
      checkboxIndex++;
      return `<input type="checkbox" class="task-checkbox" data-line="${line}"${attrs}>`;
    }
  );
}

// Configure marked with custom checkbox renderer (D-02)
marked.use({
  renderer: {
    checkbox({ checked }: { checked: boolean }) {
      return `<input type="checkbox" class="task-checkbox"${checked ? ' checked' : ''}>`;
    }
  }
});

/**
 * GSD Viewer component.
 * Renders markdown with interactive checkboxes that write back to the .md file.
 * Auto-refreshes when the watched .md file changes externally.
 */
export function GSDViewer() {
  const contentRef = useRef<HTMLDivElement>(null);
  const currentPathRef = useRef<string | null>(null);

  /**
   * Get the active project from signals.
   */
  function getActiveProject(): ProjectEntry | undefined {
    return projects.value.find(p => p.name === activeProjectName.value);
  }

  useEffect(() => {
    /**
     * Load and render the GSD markdown file for a project.
     */
    async function loadGSD(project: ProjectEntry) {
      if (!project || !project.path) return;
      const gsdFile = project.gsd_file || 'PLAN.md';
      const path = project.path + '/' + gsdFile;
      currentPathRef.current = path;

      try {
        const content = await invoke<string>('read_file_content', { path });
        const lineMap = buildLineMap(content);
        const rendered = marked.parse(content) as string;
        const withLines = injectLineNumbers(rendered, lineMap);
        if (contentRef.current) {
          contentRef.current.innerHTML = withLines;
        }
      } catch (err) {
        console.warn('[efxmux] Failed to load GSD file:', err);
        if (contentRef.current) {
          contentRef.current.innerHTML = `<div class="p-4 text-text text-[13px]">No GSD file found (${gsdFile})</div>`;
        }
      }
    }

    // Listen for md-file-changed Tauri event (D-03: auto-refresh)
    let unlistenFn: (() => void) | null = null;
    listen('md-file-changed', () => {
      const project = getActiveProject();
      if (project && currentPathRef.current) {
        loadGSD(project);
      }
    }).then(fn => { unlistenFn = fn; });

    // Listen for project-changed DOM event (re-render when project switches)
    function handleProjectChanged() {
      setTimeout(() => {
        const project = getActiveProject();
        if (project) loadGSD(project);
      }, 50);
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Initial load when component mounts
    const project = getActiveProject();
    if (project) loadGSD(project);

    return () => {
      if (unlistenFn) unlistenFn();
      document.removeEventListener('project-changed', handleProjectChanged);
    };
  }, []);

  /**
   * Handle checkbox click events (D-01: write-back).
   * Delegates from container to avoid per-checkbox listeners.
   */
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('task-checkbox')) return;
    const input = target as HTMLInputElement;
    const line = parseInt(input.dataset.line || '', 10);
    if (isNaN(line) || line < 0) return;
    const checked = input.checked;
    if (!currentPathRef.current) return;
    invoke('write_checkbox', { path: currentPathRef.current, line, checked }).catch((err: unknown) => {
      console.error('[efxmux] write_checkbox failed:', err);
      // Revert checkbox visual state on error
      input.checked = !checked;
    });
  }

  return (
    <div
      class="h-full overflow-y-auto bg-bg-terminal p-1 flex flex-col"
      onClick={handleClick}
    >
      <div
        ref={contentRef}
        class="file-viewer-markdown flex-1 m-0 overflow-auto text-[14px] leading-relaxed"
        style={{ fontFamily: 'Geist, system-ui, sans-serif', color: colors.textMuted, padding: '6px' }}
      >
        <div class="text-text text-[13px]">Loading GSD...</div>
      </div>
    </div>
  );
}

// gsd-pane.tsx -- Phase 19 GSD 5-sub-tab container (replaces gsd-viewer.tsx per D-23/D-24)
// Responsibilities:
//   - Render the 5-pill TabBar (Milestones, Phases, Progress, History, State) bound to gsdSubTab.
//   - Read .planning/ROADMAP.md, .planning/MILESTONES.md, .planning/STATE.md for the active project.
//   - Parse each file via services/gsd-parser and route the parsed data to the active sub-tab.
//   - Listen to md-file-changed with path filtering (Pitfall 1); invalidate cache and re-parse.
//   - Persist sub-tab selection to AppState.panels['gsd-sub-tab'] (D-03).
//   - Reset scroll to top on sub-tab switch (D-22).
//   - Support "View raw {file}" fallback via marked.parse (D-16).
//   - Dispatch open-file-in-tab CustomEvent for the State tab's resume-file link.
//
// This is a CONTAINER: owns the file + event lifecycle. All presentational children
// under src/components/gsd/ are pure prop-driven (see Plan 03 SUMMARY).

import { useEffect, useRef, useState } from 'preact/hooks';
import { listen } from '@tauri-apps/api/event';
import { marked } from 'marked';
import {
  activeProjectName,
  projects,
  gsdSubTab,
  getCurrentState,
  saveAppState,
} from '../state-manager';
import type { ProjectEntry } from '../state-manager';
import { TabBar } from './tab-bar';
import { colors, fonts, fontSizes, spacing } from '../tokens';
import { readFile } from '../services/file-service';
import {
  parseMilestones,
  parsePhases,
  parseProgress,
  parseHistory,
  parseState,
  invalidateCacheEntry,
  type MilestonesData,
  type PhasesData,
  type ProgressData,
  type HistoryData,
  type StateData,
} from '../services/gsd-parser';
import { MilestonesTab } from './gsd/milestones-tab';
import { PhasesTab } from './gsd/phases-tab';
import { ProgressTab } from './gsd/progress-tab';
import { HistoryTab } from './gsd/history-tab';
import { StateTab } from './gsd/state-tab';

const GSD_SUB_TABS = ['Milestones', 'Phases', 'Progress', 'History', 'State'];

interface RawFiles {
  roadmap: string | null;
  milestones: string | null;
  state: string | null;
}

function getActiveProject(): ProjectEntry | undefined {
  return projects.value.find(p => p.name === activeProjectName.value);
}

function planningPaths(project: ProjectEntry) {
  const base = project.path + '/.planning';
  return {
    roadmap: base + '/ROADMAP.md',
    milestones: base + '/MILESTONES.md',
    state: base + '/STATE.md',
  };
}

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

export function GSDPane() {
  const [raw, setRaw] = useState<RawFiles>({ roadmap: null, milestones: null, state: null });
  const [milestonesData, setMilestonesData] = useState<MilestonesData | null>(null);
  const [phasesData, setPhasesData] = useState<PhasesData | null>(null);
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [stateData, setStateData] = useState<StateData | null>(null);
  // rawView: when user clicks "View raw {file}", render marked.parse(file) + a back button.
  const [rawView, setRawView] = useState<{ tab: string; html: string; filename: string } | null>(
    null
  );
  const contentScrollRef = useRef<HTMLDivElement>(null);

  async function loadRoadmap(project: ProjectEntry) {
    const paths = planningPaths(project);
    const content = await safeRead(paths.roadmap);
    setRaw(prev => ({ ...prev, roadmap: content }));
    if (content === null) {
      setMilestonesData(null);
      setPhasesData(null);
      setProgressData(null);
      return;
    }
    setMilestonesData(parseMilestones(content));
    setPhasesData(parsePhases(content));
    setProgressData(parseProgress(content));
  }

  async function loadMilestones(project: ProjectEntry) {
    const paths = planningPaths(project);
    const content = await safeRead(paths.milestones);
    setRaw(prev => ({ ...prev, milestones: content }));
    if (content === null) {
      setHistoryData(null);
      return;
    }
    setHistoryData(parseHistory(content));
  }

  async function loadState(project: ProjectEntry) {
    const paths = planningPaths(project);
    const content = await safeRead(paths.state);
    setRaw(prev => ({ ...prev, state: content }));
    if (content === null) {
      setStateData(null);
      return;
    }
    setStateData(parseState(content));
  }

  async function loadAll(project: ProjectEntry) {
    await Promise.all([loadRoadmap(project), loadMilestones(project), loadState(project)]);
  }

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    // Path-filtered md-file-changed listener (Pitfall 1: only respond to the 3 planning files).
    listen<string>('md-file-changed', event => {
      const changedPath = event.payload ?? '';
      const project = getActiveProject();
      if (!project) return;
      if (changedPath.endsWith('/ROADMAP.md')) {
        invalidateCacheEntry(changedPath);
        loadRoadmap(project);
      } else if (changedPath.endsWith('/MILESTONES.md')) {
        invalidateCacheEntry(changedPath);
        loadMilestones(project);
      } else if (changedPath.endsWith('/STATE.md')) {
        invalidateCacheEntry(changedPath);
        loadState(project);
      }
      // Any other path is ignored — no re-parse, no cache churn.
    })
      .then(fn => {
        unlistenFn = fn;
      })
      .catch(err => console.warn('[efxmux] GSDPane listen failed:', err));

    function handleProjectChanged() {
      setTimeout(() => {
        const project = getActiveProject();
        if (project) loadAll(project);
        setRawView(null);
      }, 50);
    }
    document.addEventListener('project-changed', handleProjectChanged);

    // Initial load
    const project = getActiveProject();
    if (project) loadAll(project);

    return () => {
      if (unlistenFn) unlistenFn();
      document.removeEventListener('project-changed', handleProjectChanged);
    };
  }, []);

  function handleSubTabSwitch(tab: string) {
    gsdSubTab.value = tab;
    setRawView(null);
    // D-22: reset scroll to top on sub-tab switch.
    if (contentScrollRef.current) contentScrollRef.current.scrollTop = 0;
    // D-03: persist via AppState.
    const state = getCurrentState();
    if (state) {
      state.panels = state.panels ?? {};
      state.panels['gsd-sub-tab'] = tab;
      saveAppState(state).catch(err =>
        console.warn('[efxmux] persist gsd-sub-tab failed:', err)
      );
    }
  }

  function showRawView(tab: string, rawContent: string | null, filename: string) {
    if (!rawContent) return;
    try {
      const html = marked.parse(rawContent, { async: false }) as string;
      setRawView({ tab, html, filename });
    } catch (err) {
      console.warn('[efxmux] marked.parse failed:', err);
    }
  }

  function handleResumeFile(path: string) {
    const project = getActiveProject();
    let absolutePath = path;
    if (project && !path.startsWith('/')) {
      absolutePath = project.path + '/' + path;
    }
    // T-19-14 Path Traversal guard: reject ".." segments before dispatching.
    if (absolutePath.includes('/..')) {
      console.warn('[efxmux] resume-file path rejected (traversal):', absolutePath);
      return;
    }
    document.dispatchEvent(
      new CustomEvent('open-file-in-tab', { detail: { path: absolutePath } })
    );
  }

  const active = gsdSubTab.value;
  const fileRoadmapMissing = raw.roadmap === null;
  const fileMilestonesMissing = raw.milestones === null;
  const fileStateMissing = raw.state === null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: colors.bgBase,
      }}
    >
      <TabBar tabs={GSD_SUB_TABS} activeTab={gsdSubTab} onSwitch={handleSubTabSwitch} />
      <div
        ref={contentScrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: spacing['4xl'],
        }}
      >
        {rawView && rawView.tab === active ? (
          <div>
            <button
              onClick={() => setRawView(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                fontFamily: fonts.sans,
                fontSize: fontSizes.base,
                color: colors.textMuted,
                marginBottom: spacing['4xl'],
              }}
            >
              ← Back to structured view
            </button>
            <div
              dangerouslySetInnerHTML={{ __html: rawView.html }}
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSizes.lg,
                color: colors.textSecondary,
              }}
            />
          </div>
        ) : (
          <>
            {active === 'Milestones' && (
              <MilestonesTab
                data={milestonesData}
                fileMissing={fileRoadmapMissing}
                onViewRaw={() => showRawView('Milestones', raw.roadmap, 'ROADMAP.md')}
              />
            )}
            {active === 'Phases' && (
              <PhasesTab
                data={phasesData}
                fileMissing={fileRoadmapMissing}
                onViewRaw={() => showRawView('Phases', raw.roadmap, 'ROADMAP.md')}
              />
            )}
            {active === 'Progress' && (
              <ProgressTab
                data={progressData}
                fileMissing={fileRoadmapMissing}
                onViewRaw={() => showRawView('Progress', raw.roadmap, 'ROADMAP.md')}
              />
            )}
            {active === 'History' && (
              <HistoryTab
                data={historyData}
                fileMissing={fileMilestonesMissing}
                onViewRaw={() => showRawView('History', raw.milestones, 'MILESTONES.md')}
              />
            )}
            {active === 'State' && (
              <StateTab
                data={stateData}
                fileMissing={fileStateMissing}
                onOpenResumeFile={handleResumeFile}
                onViewRaw={() => showRawView('State', raw.state, 'STATE.md')}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

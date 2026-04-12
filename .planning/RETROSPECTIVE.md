# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.1.0 -- MVP

**Shipped:** 2026-04-11
**Phases:** 11 | **Plans:** 63 | **Timeline:** 6 days

### What Was Built
- Native macOS terminal multiplexer with PTY/tmux pipeline, multi-project workspace, and right panel views (GSD viewer, diff, file tree)
- Server pane with agent detection (Claude Code / OpenCode) and dev server lifecycle management
- Complete keyboard system, first-run wizard, crash recovery, session persistence
- Pixel-perfect navy-blue UI matching Pencil design mockups with dual token system

### What Worked
- **Rapid iteration with GSD workflow**: 11 phases and 63 plans executed in 6 days with consistent quality
- **Phase insertion (6.1)**: Arrow.js was cleanly replaced with Preact mid-milestone without disrupting subsequent phases
- **UAT gap closure pattern**: Multiple phases had follow-up plans (04-03, 06-03..06-07, 07-03..07-09, 08-04..08-08) that caught real bugs before moving on
- **Two-pass UI design**: Phase 9 established design vocabulary, Phase 10 applied Pencil mockups -- cleaner than trying to pixel-match from scratch
- **YOLO mode + auto-advance**: Minimal friction between phases allowed sustained velocity

### What Was Inefficient
- **Requirements traceability not maintained**: All 42 requirements were implemented but the traceability table stayed at "Pending" -- manual checkbox tracking didn't scale
- **Arrow.js false start**: Phases 1-6 built on Arrow.js, then Phase 6.1 replaced it entirely. ~3 days of JS work was rewritten in TSX
- **Phase 9 visual work partially discarded**: Phase 10 overwrote Phase 9's GitHub-dark palette with navy-blue. Two UI phases could have been one with clearer design spec upfront
- **No milestone audit**: Skipped formal audit before completion -- acceptable for solo v0.1.0 but should be standard for team milestones

### Patterns Established
- Dual token system: `tokens.ts` (inline styles) + `@theme` CSS vars (Tailwind utilities)
- Signal-based state management with `@preact/signals`
- Rust PTY backend with Channel streaming and flow control
- Per-project tmux session isolation
- BufReader::lines() for server output (prevents ANSI splitting)

### Key Lessons
1. **Lock the UI framework before building UI**: Arrow.js → Preact migration was necessary but costly. Validate the framework with a spike before committing phases to it
2. **Design spec before implementation**: Having Pencil mockups for Phase 10 was dramatically faster than the freehand Phase 9 approach
3. **UAT gap closure is not rework -- it's the process**: Phases 6-8 each had 3-6 gap closure plans. This is normal and should be planned for
4. **Requirements traceability needs automation**: Manual checkbox tracking in REQUIREMENTS.md doesn't work at this velocity

### Cost Observations
- Model mix: ~80% opus, ~20% sonnet (quality profile)
- Sessions: ~15-20 across 6 days
- Notable: YOLO mode + auto-advance kept context switches minimal; most phases completed in 1-2 sessions

---

## Milestone: v0.2.0 -- Testing & Consolidation

**Shipped:** 2026-04-12
**Phases:** 4 | **Plans:** 8 | **Timeline:** 1 day

### What Was Built
- Vitest test infrastructure: jsdom environment, global mocks for Tauri IPC + xterm.js, v8 coverage at 60% thresholds
- 89 unit tests for 5 TypeScript modules (ansi-html, tokens, state-manager, theme-manager, server-bridge)
- 30 component render tests for 4 Preact components (sidebar, server-pane, gsd-viewer, file-tree)
- 19 Rust tests for state serde round-trips, git_status, file_ops (including T-13-03/T-13-04/T-13-05 security threat mitigations)
- Consolidation: dead code removal, any-type elimination, dependency audit confirming all deps active

### What Worked
- **Single-day milestone**: 4 phases + 8 plans completed in one day (2026-04-12) -- fast even by v0.1.0 standards
- **Test infrastructure first**: Phase 11 (Vitest setup) was prerequisite for 12 and 13; running it first meant later phases had regression protection immediately
- **Auto-fix deviation pattern**: 7 Rule-1 bugs auto-fixed during Phase 12 execution -- tests caught real issues that plan assumed incorrectly
- **Class-based xterm.js mock**: vi.fn() not new-able in Vitest 4.x dynamic import; class-based mock solved constructor compatibility cleanly

### What Was Inefficient
- **8 plans for 1 day is tight**: Phase 14 had only 2 plans but involved cross-phase coordination (dead code from Phases 1-10, type issues from Phase 6.1 migration). More buffer time would help
- **No milestone audit**: v0.2.0 skipped audit like v0.1.0. Noticed no MILESTONE-AUDIT.md existed when complete-milestone workflow checked. Minor for solo dev, but pattern worth breaking

### Patterns Established
- vi.mock hoisting with module-level shared refs (listenHandler) for event listener tests
- jsdom spy on style.setProperty/removeProperty instead of replacing documentElement (readonly in jsdom)
- Sync inner functions (`*_impl()`) for Rust testability of async Tauri commands
- Signal reset in beforeEach to prevent test pollution

### Key Lessons
1. **Test infrastructure is a prerequisite, not a phase**: Running Phase 11 first let 12 and 13 build on validated mocks; worth every minute of upfront investment
2. **Vitest 4.x has constructor gotcha**: `vi.fn().mockImplementation()` is not usable with `new` via dynamic import; class-based mocks are the fix
3. **Sync inner functions enable unit testing**: Tauri commands are async; extract a `fn foo_impl() -> T` wrapper that calls `foo().await` for testability

### Cost Observations
- Model mix: ~60% haiku (fast execution), ~30% sonnet (review), ~10% opus (debug)
- Sessions: 3 (Phase 11), 2 (Phase 12), 2 (Phase 13+14 combined)
- Notable: Phase 14 (consolidation) ran in parallel with Phase 13 (tests) -- wave-based execution kept context fresh

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.1.0 | 6 days | 11 | Initial MVP -- established GSD workflow patterns |
| v0.2.0 | 1 day | 4 | Testing infrastructure + consolidation -- 119 tests added |

### Top Lessons (Verified Across Milestones)

1. Lock framework choices with a spike before building on them
2. Design mockups (Pencil) produce better UI than freehand implementation
3. Plan for UAT gap closure plans as part of every phase estimate

---
phase: quick
plan: 260414-kil
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/terminal-tabs.tsx
  - src/components/main-panel.tsx
  - src/components/tab-bar.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Terminal tabs are taller and easier to click (min 40px height)"
    - "Close buttons on terminal tabs are large enough to hit reliably"
    - "File viewer preview bar has generous vertical padding"
    - "Right panel TabBar buttons have more breathing room"
  artifacts:
    - path: "src/components/terminal-tabs.tsx"
      provides: "TerminalTabBar with taller bar and bigger close button"
    - path: "src/components/main-panel.tsx"
      provides: "File viewer preview bar with more padding"
    - path: "src/components/tab-bar.tsx"
      provides: "TabBar with more generous button padding"
  key_links:
    - from: "terminal-tabs.tsx TerminalTabBar"
      to: "h-[40px] container, px-3 py-2.5 tabs, close button as <button> 20x20px"
      via: "Tailwind class changes"
    - from: "main-panel.tsx file viewer header"
      to: "py-2.5 bar padding, px-3 py-1.5 close button"
      via: "class string changes"
---

<objective>
Improve clickability and visual comfort of the TUI tab bars and file preview bar.

Three UI elements are too cramped: the TerminalTabBar (tabs too short, close button a tiny × span), the file viewer preview bar header (pinched vertical padding), and the right panel TabBar (buttons slightly tight). All three need generously-sized hit targets.

Purpose: Reduce mis-click frustration and make the UI feel less cramped without changing the overall layout proportions.
Output: Updated terminal-tabs.tsx, main-panel.tsx, tab-bar.tsx with improved sizing.
</objective>

<execution_context>
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/workflows/execute-plan.md
@/Users/lmarques/Dev/efx-mux/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/lmarques/Dev/efx-mux/.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enlarge TerminalTabBar height, tab padding, and close button</name>
  <files>src/components/terminal-tabs.tsx</files>
  <action>
In the TerminalTabBar component (line ~698):

1. Container div: change `h-[34px]` → `h-[40px]` to give more vertical room.

2. Tab buttons (both active and inactive): change `px-3 py-2` → `px-3 py-2.5` for more vertical padding.

3. Close button: replace the `<span>` element (text-[10px], ml-1) with a `<button>` element that has an explicit hit target. Use:
   - `class="ml-1.5 flex items-center justify-center rounded transition-colors duration-150"`
   - `style={{ width: 18, height: 18, fontSize: 13, lineHeight: 1, color: colors.textDim, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}`
   - Keep existing onClick (stopPropagation + closeTab), onMouseEnter/onMouseLeave color hover handlers, and title="Close tab"
   - Keep the `\u00D7` character as inner text

This turns the × from a tiny 10px glyph into an 18x18px button with a comfortable click target. The tab height increase (34→40px) gives the row enough room to visually breathe.

Do NOT change the new-tab (+) button — it already has explicit w-6 h-6 sizing.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npm run type-check 2>&1 | tail -5</automated>
  </verify>
  <done>TerminalTabBar container is h-[40px], tabs use py-2.5, close button is an 18x18 &lt;button&gt; element with hover colors. Type-check passes.</done>
</task>

<task type="auto">
  <name>Task 2: Increase file viewer preview bar padding and right panel TabBar padding</name>
  <files>src/components/main-panel.tsx, src/components/tab-bar.tsx</files>
  <action>
**main-panel.tsx — file viewer preview bar header (line ~245):**

Change the header bar div padding: `px-3 py-1.5` → `px-3 py-2.5`
Change the Close button: `px-2.5 py-1` → `px-3 py-1.5`

This makes the READ-ONLY badge / filename row and the Close button feel comfortable rather than squeezed, consistent with the taller terminal tab bar.

**tab-bar.tsx — right panel TabBar buttons (line ~24):**

Change button padding from `padding: '7px 14px'` → `padding: '9px 16px'`

Also change the container row from `py-1.5` → `py-2` to give the row itself a little more room:
`class="flex gap-1 px-2 py-2 border-b shrink-0 items-center"`

These changes apply to the Git / Files / Settings tabs in the right panel.
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && npm run type-check 2>&1 | tail -5</automated>
  </verify>
  <done>File viewer header bar has py-2.5, Close button has py-1.5. TabBar container has py-2, buttons use padding 9px 16px. Type-check passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| None | Pure styling change — no data flow, no user input processed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kil-01 | Tampering | Close button element type change | accept | Changing span→button is functionally equivalent; onClick already calls stopPropagation |
</threat_model>

<verification>
After both tasks:
1. `npm run type-check` passes with no new errors
2. Visual check: terminal tab bar noticeably taller, close × comfortable to click, file preview bar header less pinched, right panel tabs have more padding
</verification>

<success_criteria>
- TerminalTabBar height 40px (was 34px)
- Close button is an 18x18px &lt;button&gt; element (was a `text-[10px]` span)
- File viewer preview bar vertical padding py-2.5 (was py-1.5)
- Right panel TabBar button padding 9px 16px (was 7px 14px)
- TypeScript compilation clean
</success_criteria>

<output>
After completion, create `.planning/quick/260414-kil-enhance-tui-tab-and-preview-bar-ux-bigge/260414-kil-SUMMARY.md` using the summary template.
</output>

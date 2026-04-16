---
phase: quick
plan: 260416-jjb
type: execute
wave: 1
depends_on: []
files_modified: [src/components/unified-tab-bar.tsx]
autonomous: true
requirements: [quick-260416-jjb]
must_haves:
  truths:
    - "All editor tabs display a pin icon (thumbtack) regardless of pin state"
    - "Unpinned editor tabs show a grayed-out pin icon"
    - "Pinned editor tabs show a blue accent pin icon"
    - "Clicking the pin icon toggles the tab pin state"
    - "Right-click context menu no longer toggles pin state"
    - "Dirty indicator (yellow dot) still visible on unpinned dirty tabs"
  artifacts:
    - path: "src/components/unified-tab-bar.tsx"
      provides: "Updated renderTab with always-visible clickable pin icon for editor tabs"
  key_links:
    - from: "Pin icon onClick"
      to: "togglePinEditorTab()"
      via: "click handler on Pin icon element"
---

<objective>
Add a clickable pin icon to all editor tabs in the unified tab bar.

Purpose: Replace the current behavior where unpinned tabs show no pin icon (or only italic text) with an always-visible pin icon that serves as both a visual indicator and a toggle control. Pinned tabs get a blue icon, unpinned tabs get a grayed-out icon. This replaces the right-click toggle with a direct click target.

Output: Updated unified-tab-bar.tsx with clickable pin icons on all editor tabs.
</objective>

<execution_context>
@.claude/get-shit-done/workflows/execute-plan.md
@.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/unified-tab-bar.tsx
@src/tokens.ts

<interfaces>
From src/components/unified-tab-bar.tsx:
```typescript
// Pin icon from lucide-preact (already imported at line 11)
import { Terminal, Bot, FileDiff, Pin } from 'lucide-preact';

// Toggle function (already exists at line 247)
export function togglePinEditorTab(tabId: string): void;

// EditorTabData (line 31-38)
interface EditorTabData extends BaseTab {
  type: 'editor';
  filePath: string;
  fileName: string;
  content: string;
  dirty: boolean;
  pinned: boolean;
}
```

From src/tokens.ts:
```typescript
export const colors = {
  accent: '#258AD1',    // Blue -- use for pinned icon
  textDim: '#556A85',   // Gray -- use for unpinned icon
  statusYellow: '#D29922', // Yellow dot for dirty state
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add clickable pin icon to all editor tabs and remove right-click toggle</name>
  <files>src/components/unified-tab-bar.tsx</files>
  <action>
Modify the `renderTab` function (starts at line 782) in the editor tab branch (lines 809-826):

**1. Change the editor indicator logic (lines 809-826):**

Currently the indicator for editor tabs is:
- Pinned: `<Pin size={12} style={{ color: colors.accent }} />`
- Unpinned + dirty: yellow dot
- Unpinned + clean: nothing

Replace with: ALL editor tabs always get a clickable Pin icon. The indicator variable for editor tabs should always be a Pin icon wrapped in a clickable span:

```tsx
} else if (tab.type === 'editor') {
  label = tab.fileName;
  tabTitle = tab.filePath;
  indicator = (
    <span
      class="flex items-center justify-center"
      style={{
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        togglePinEditorTab(tab.id);
      }}
      title={tab.pinned ? 'Unpin tab' : 'Pin tab'}
    >
      <Pin
        size={12}
        style={{
          color: tab.pinned ? colors.accent : colors.textDim,
          transition: 'color 0.15s ease',
        }}
      />
    </span>
  );
```

**2. Handle dirty indicator separately:**

After the pin icon indicator, the dirty state for unpinned tabs needs a separate visual cue. Add a dirty dot AFTER the label span (not as the indicator). Inside the `renderTab` return JSX, between the label `<span>` and the close button `<span>`, add a conditional dirty dot for editor tabs:

```tsx
{tab.type === 'editor' && !tab.pinned && tab.dirty && (
  <span
    style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      backgroundColor: colors.statusYellow,
      flexShrink: 0,
    }}
  />
)}
```

**3. Remove the right-click context menu toggle (lines 866-870):**

Remove the `onContextMenu` handler from the tab div entirely. The lines:
```tsx
onContextMenu={(e: MouseEvent) => {
  if (tab.type === 'editor') {
    e.preventDefault();
    togglePinEditorTab(tab.id);
  }
}}
```
Delete these lines completely.

**4. Prevent pin icon click from starting a drag:**

In the `onTabMouseDown` function (line 548), the check for close button clicks already exists at line 553. Add the same guard for the pin icon. Update the early-return check to also skip if the click target is inside the pin icon wrapper. Change line 553 from:
```tsx
if ((e.target as HTMLElement).closest('[title="Close tab"]')) return;
```
to:
```tsx
if ((e.target as HTMLElement).closest('[title="Close tab"]') ||
    (e.target as HTMLElement).closest('[title="Pin tab"]') ||
    (e.target as HTMLElement).closest('[title="Unpin tab"]')) return;
```

**What NOT to change:**
- Keep the double-click to pin behavior (line 862-865) -- it complements the icon click
- Keep the italic font style for unpinned editor tab names (line 881)
- Keep all terminal and git-changes tab indicator logic unchanged
  </action>
  <verify>
    <automated>cd /Users/lmarques/Dev/efx-mux && pnpm exec tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
- All editor tabs show a Pin icon (pinned = blue #258AD1, unpinned = gray #556A85)
- Clicking the pin icon toggles pin state via togglePinEditorTab()
- Right-click context menu toggle is removed
- Dirty yellow dot appears between label and close button for unpinned dirty tabs
- Pin icon clicks do not trigger tab drag
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `pnpm exec tsc --noEmit` -- no type errors
2. Visual check: open a file (single click) -- tab shows grayed-out pin icon + italic name
3. Visual check: click the pin icon -- icon turns blue, name becomes non-italic
4. Visual check: click the blue pin icon again -- icon turns gray, name becomes italic
5. Visual check: edit an unpinned file -- yellow dirty dot appears between name and close button
6. Verify right-click on editor tab no longer toggles pin state
7. Verify double-click on unpinned tab still pins it
</verification>

<success_criteria>
All editor tabs display a clickable pin icon that toggles pin state. Pinned = blue, unpinned = gray. Right-click toggle removed. Dirty indicator preserved.
</success_criteria>

<output>
After completion, create `.planning/quick/260416-jjb-add-clickable-pin-icon-on-all-editor-tab/260416-jjb-SUMMARY.md`
</output>

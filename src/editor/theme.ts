// editor/theme.ts -- CodeMirror 6 custom theme + syntax highlighting
// Built from tokens.ts (Phase 10) per D-07

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { colors, fonts } from '../tokens';

// ── Structural Theme ──────────────────────────────────────────────────────────

export const efxmuxTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: colors.bgBase,
      color: colors.textPrimary,
      fontFamily: fonts.mono,
      fontSize: '13px',
    },
    '.cm-content': {
      caretColor: colors.accent,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: colors.accent,
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: colors.accentMuted,
    },
    '.cm-activeLine': {
      backgroundColor: `${colors.bgElevated}80`,
    },
    '.cm-gutters': {
      backgroundColor: colors.bgBase,
      color: colors.textDim,
      borderRight: `1px solid ${colors.bgBorder}`,
    },
    '.cm-activeLineGutter': {
      backgroundColor: colors.bgElevated,
      color: colors.textSecondary,
    },
    '.cm-foldPlaceholder': {
      backgroundColor: colors.bgSurface,
      border: 'none',
      color: colors.textMuted,
    },
    '.cm-searchMatch': {
      backgroundColor: `${colors.statusYellow}30`,
      outline: `1px solid ${colors.statusYellow}50`,
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: `${colors.statusYellow}50`,
    },
    '.cm-minimap': {
      width: '60px !important',
      minWidth: '60px !important',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    },
    '.cm-minimap *': {
      userSelect: 'none',
      WebkitUserSelect: 'none',
    },
    '.cm-minimap .cm-minimap-inner': {
      width: '60px !important',
      opacity: '0.6',
    },
    '.cm-minimap .cm-minimap-overlay': {
      background: `${colors.accent} !important`,
      opacity: '0.35 !important',
      transition: 'background 0.15s ease, opacity 0.15s ease',
    },
    '.cm-minimap .cm-minimap-overlay-container:hover .cm-minimap-overlay': {
      background: '#D29922 !important',
      opacity: '0.5 !important',
    },
  },
  { dark: true },
);

// ── Syntax Highlight Style ───────────────────────────────────────────────────

export const efxmuxHighlightStyle = HighlightStyle.define([
  // JavaScript / TypeScript
  { tag: t.keyword, color: '#C792EA' },
  { tag: t.string, color: '#C3E88D' },
  { tag: t.comment, color: colors.textDim },
  { tag: t.number, color: '#F78C6C' },
  { tag: t.function(t.variableName), color: '#82AAFF' },
  { tag: t.typeName, color: '#FFCB6B' },
  { tag: t.operator, color: '#89DDFF' },
  { tag: t.bool, color: '#FF5370' },
  { tag: t.propertyName, color: colors.textSecondary },
  { tag: t.definition(t.variableName), color: '#82AAFF' },
  // Markdown
  { tag: t.heading, color: '#C792EA', fontWeight: 'bold' },
  { tag: t.strong, color: '#FFCB6B', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#C3E88D', fontStyle: 'italic' },
  { tag: t.link, color: '#82AAFF', textDecoration: 'underline' },
  { tag: t.url, color: '#89DDFF' },
  { tag: t.monospace, color: '#F78C6C' },
  { tag: t.quote, color: colors.textDim },
  { tag: t.list, color: '#89DDFF' },
]);

// ── Export combined syntax highlighting extension ─────────────────────────────

export const efxmuxSyntaxHighlighting = syntaxHighlighting(efxmuxHighlightStyle);

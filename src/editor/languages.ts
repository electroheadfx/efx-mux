// editor/languages.ts -- File extension to CM6 language extension mapping
// Built per D-08

import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import type { Extension } from '@codemirror/state';

// ── Language Map ───────────────────────────────────────────────────────────────

const languageMap: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  rs: () => rust(),
  css: () => css(),
  html: () => html(),
  htm: () => html(),
  json: () => json(),
  md: () => markdown(),
  markdown: () => markdown(),
  mdx: () => markdown(),
  yaml: () => yaml(),
  yml: () => yaml(),
  toml: () => StreamLanguage.define(toml),
  sh: () => StreamLanguage.define(shell),
  bash: () => StreamLanguage.define(shell),
  zsh: () => StreamLanguage.define(shell),
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the CM6 language extension for a given filename, or null if unsupported.
 */
export function getLanguageExtension(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  const factory = languageMap[ext];
  return factory ? factory() : null;
}

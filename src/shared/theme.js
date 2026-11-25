// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file Theme choice shared by the Settings page and the toolbar.
 * @module shared/theme
 *
 * The saved choice (`optionsTheme`) is 'auto' (follow the browser theme), 'light' or 'dark'. Anything else, or nothing
 * saved, counts as 'auto'. The Settings button cycles auto → light → dark → auto.
 */

export const THEMES = ['auto', 'light', 'dark'];

/** @param {unknown} value Anything read from storage. @returns {'auto'|'light'|'dark'} */
export function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

/** The choice a click on the Settings theme button moves to. */
export function nextTheme(current) {
  return THEMES[(THEMES.indexOf(normalizeTheme(current)) + 1) % THEMES.length];
}

/**
 * The theme to draw: the explicit choice, or the browser's when it is 'auto'.
 * @param {unknown} choice Saved choice.
 * @param {boolean} deviceIsLight Whether the browser prefers a light scheme.
 * @returns {'light'|'dark'}
 */
export function resolveTheme(choice, deviceIsLight) {
  const t = normalizeTheme(choice);
  if (t === 'auto') return deviceIsLight ? 'light' : 'dark';
  return t;
}

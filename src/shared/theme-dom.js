/**
 * @file Applies the saved theme to a page and keeps it up to date (Settings page, popup and toolbar).
 * @module shared/theme-dom
 *
 * Sets `data-asp-theme="light"|"dark"` on <html>. The stylesheets key on that attribute instead of the
 * browser's `prefers-color-scheme`, so a fixed choice wins over the browser theme and Auto still follows it,
 * live: when the browser theme switches, or the choice is changed in Settings (the `optionsTheme` setting).
 */

import { normalizeTheme, resolveTheme } from './theme.js';

/**
 * @param {unknown} initialChoice Saved choice ('auto', 'light' or 'dark'; anything else is 'auto').
 * @param {(theme: 'light'|'dark', choice: 'auto'|'light'|'dark') => void} [onApply] Called after every change.
 * @returns {{set: (choice: unknown) => void, stop: () => void}}
 */
export function syncTheme(initialChoice, onApply) {
  let choice = normalizeTheme(initialChoice);
  const mq = window.matchMedia('(prefers-color-scheme: light)');

  const apply = () => {
    const theme = resolveTheme(choice, mq.matches);
    document.documentElement.setAttribute('data-asp-theme', theme);
    onApply?.(theme, choice);
  };
  const onDevice = () => { if (choice === 'auto') apply(); };
  const onStorage = (changes, area) => {
    if (area !== 'sync' || !changes.optionsTheme) return;
    choice = normalizeTheme(changes.optionsTheme.newValue);
    apply();
  };

  mq.addEventListener('change', onDevice);
  try { chrome.storage.onChanged.addListener(onStorage); } catch { /* extension context gone */ }
  apply();

  return {
    set(next) { choice = normalizeTheme(next); apply(); },
    stop() {
      mq.removeEventListener('change', onDevice);
      try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* extension context gone */ }
    },
  };
}

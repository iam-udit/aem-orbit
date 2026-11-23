/**
 * @file Admin control policy: which controls a team's members may use.
 * @module shared/control-policy
 *
 * An administrator delivers `controlPolicy` through Chrome enterprise policy
 * (`chrome.storage.managed`, see schema.json). Users cannot edit it, so it is the one place
 * a limit can be trusted. The service worker enforces it on every action; the toolbar, popup
 * and options page only mirror it so a blocked control is not offered in the first place.
 *
 * Shape (all optional):
 *   {
 *     disabledControls: ['delete', 'sync'],                 // off everywhere
 *     byEnvironment: { prod: { disabledControls: ['publish'] } } // off on one environment
 *   }
 *
 * Nothing is blocked unless it is listed. Unknown control ids are ignored.
 */

/**
 * Every control an administrator can switch off.
 * `actions` are the service-worker message actions that control guards.
 */
export const CONTROLS = {
  publish:         { label: 'Publish',                 actions: ['PUBLISH_PAGE'] },
  unpublish:       { label: 'Unpublish',               actions: ['UNPUBLISH_PAGE'] },
  publishPreview:  { label: 'Publish to Preview',      actions: ['PUBLISH_PREVIEW'] },
  treePublish:     { label: 'Tree publish / unpublish', actions: ['PREVIEW_TREE_ACTIVATE', 'TREE_ACTIVATE', 'PREVIEW_TREE_DEACTIVATE', 'TREE_DEACTIVATE'] },
  bulkPublish:     { label: 'Bulk publish / unpublish', actions: ['PREVIEW_BULK_REPLICATE', 'BULK_REPLICATE'] },
  delete:          { label: 'Delete page',             actions: ['DELETE_PAGE'] },
  sync:            { label: 'Sync content',            actions: ['GET_SYNC_PLAN', 'SYNC_CONTENT_PAGE', 'UNDO_SYNC'] },
  saveVersion:     { label: 'Save version',            actions: ['CREATE_VERSION'] },
  restoreVersion:  { label: 'Restore version',         actions: ['RESTORE_VERSION'] },
  lock:            { label: 'Lock / unlock page',      actions: ['LOCK_PAGE', 'UNLOCK_PAGE'] },
  findReplace:     { label: 'Find & Replace',          actions: ['FIND_ACROSS_PAGES', 'REPLACE_ACROSS_PAGES'] },
  flushDispatcher: { label: 'Dispatcher flush',        actions: ['FLUSH_DISPATCHER'] },
  // Not tied to one action: turning it off forces Developer Mode off (see getConfig).
  developerMode:   { label: 'Developer Mode',          actions: [] },
};

export const CONTROL_IDS = Object.keys(CONTROLS);

const ACTION_TO_CONTROL = Object.fromEntries(
  Object.entries(CONTROLS).flatMap(([id, c]) => c.actions.map((a) => [a, id])),
);

/** @returns {string|null} The control that guards a service-worker action, or null when it is not guarded. */
export function controlForAction(action) {
  return Object.hasOwn(ACTION_TO_CONTROL, action) ? ACTION_TO_CONTROL[action] : null;
}

/** Known, de-duplicated control ids from whatever the policy contained. */
function knownIds(list, { perEnvironment = false } = {}) {
  if (!Array.isArray(list)) return [];
  // Developer Mode is one global setting, so it can only be switched off for everyone.
  return [...new Set(list.filter((id) => typeof id === 'string' && Object.hasOwn(CONTROLS, id) && !(perEnvironment && id === 'developerMode')))];
}

/**
 * Turn whatever the managed storage held into a safe, plain-data policy.
 * @param {unknown} raw
 * @returns {{disabledControls: string[], byEnvironment: Record<string, {disabledControls: string[]}>}}
 */
export function normalizePolicy(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const perEnv = p.byEnvironment && typeof p.byEnvironment === 'object' ? Object.entries(p.byEnvironment) : [];
  const byEnvironment = Object.fromEntries(
    perEnv
      .map(([env, rule]) => [env, { disabledControls: knownIds(rule?.disabledControls, { perEnvironment: true }) }])
      .filter(([, rule]) => rule.disabledControls.length),
  );
  return { disabledControls: knownIds(p.disabledControls), byEnvironment };
}

/**
 * May this control be used on this environment?
 * @param {ReturnType<typeof normalizePolicy>|null|undefined} policy
 * @param {string} control  A key of CONTROLS.
 * @param {string} [env]    Environment key; without one only the global list applies.
 * @returns {boolean}
 */
export function isControlAllowed(policy, control, env) {
  if (!policy) return true;
  if (policy.disabledControls?.includes(control)) return false;
  const byEnv = policy.byEnvironment;
  const rule = env && byEnv && Object.hasOwn(byEnv, env) ? byEnv[env] : null;
  return !rule?.disabledControls?.includes(control);
}

/** Text for a refused action. Generic on purpose: it names the control, not the policy source. */
export function controlBlockedMessage(control, env) {
  const label = CONTROLS[control]?.label || control;
  return `${label} is turned off by your administrator${env ? ` for ${env}` : ''}.`;
}

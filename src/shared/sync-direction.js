// Copyright 2026 Udit Nayak · SPDX-License-Identifier: Apache-2.0
/**
 * @file Which way content may be copied between environments.
 * @module shared/sync-direction
 *
 * "Higher" means later in the environment order from Settings (default: local, dev, stage, prod).
 * By default content may only flow DOWN (from a higher environment to a lower one, e.g. prod → stage).
 * Copying UP (e.g. dev → prod) is opt-in through the "Allow syncing to higher environments" setting.
 *
 * Pure, so the toolbar menu and the service-worker check use the same rule.
 */

/**
 * @param {string[]} order       environment keys, lowest first
 * @param {string}   sourceEnv   where the content is read from
 * @param {string}   targetEnv   where the content is written to
 * @param {boolean}  allowUpward the opt-in setting
 * @returns {boolean}
 */
export function isSyncAllowed(order, sourceEnv, targetEnv, allowUpward) {
  if (!sourceEnv || !targetEnv || sourceEnv === targetEnv) return false;
  if (allowUpward === true) return true;
  const list = Array.isArray(order) ? order : [];
  const s = list.indexOf(sourceEnv);
  const t = list.indexOf(targetEnv);
  // An environment we cannot rank is refused while the restriction is on.
  return s >= 0 && t >= 0 && s > t;
}

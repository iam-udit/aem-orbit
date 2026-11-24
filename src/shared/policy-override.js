/**
 * @file Build-time stand-in for the administrator control policy.
 * @module shared/policy-override
 *
 * Always `null` in source and in the release build. `npm run build:policy-test` swaps this module
 * for one that holds a fixed policy, so the feature can be tried in a browser without installing
 * an OS-level Chrome policy. It is a build-time constant: nothing at runtime (storage, messages,
 * page content) can set it.
 */
export const POLICY_OVERRIDE = null;

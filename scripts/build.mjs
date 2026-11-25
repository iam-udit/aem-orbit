/**
 * Build the extension into dist/extension/ (load that folder unpacked).
 *
 *   node scripts/build.mjs                one-off Chromium build (dist/extension/)
 *   node scripts/build.mjs --firefox      Firefox MV3 build (dist/firefox/)
 *   node scripts/build.mjs --watch        rebuild on change (with source maps)
 *   node scripts/build.mjs --policy-test  build dist/policy-test/ with an admin control policy
 *                                         baked in, to try the feature without an OS-level Chrome
 *                                         policy. The policy is JSON in ORBIT_POLICY_TEST.
 *
 * Toolbar, popup and options are bundled to classic IIFE scripts (content
 * scripts and the popup cannot load ES modules directly); the service worker
 * stays an ES module. Output keeps the src/ layout so manifest paths are unchanged.
 */
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizePolicy } from '../src/shared/control-policy.js';

const root       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch      = process.argv.includes('--watch');
const policyTest = process.argv.includes('--policy-test');
const firefox    = process.argv.includes('--firefox');
const outDir     = process.env.ORBIT_BUILD_OUT
  ? path.resolve(process.env.ORBIT_BUILD_OUT)
  : path.join(root, 'dist', firefox ? 'firefox' : (policyTest ? 'policy-test' : 'extension'));

/**
 * Policy for the test build, from ORBIT_POLICY_TEST. Refuses anything that would silently
 * produce a build with no policy, because that would look like a passing test.
 * @returns {ReturnType<typeof normalizePolicy>|null}
 */
function readTestPolicy() {
  if (!policyTest) return null;
  const raw = process.env.ORBIT_POLICY_TEST;
  if (!raw) throw new Error('Set ORBIT_POLICY_TEST to the policy JSON, e.g. ORBIT_POLICY_TEST=\'{"disabledControls":["delete"]}\'');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('ORBIT_POLICY_TEST is not valid JSON.'); }
  const policy = normalizePolicy(parsed);
  if (!policy.disabledControls.length && !Object.keys(policy.byEnvironment).length) {
    throw new Error('ORBIT_POLICY_TEST blocks nothing. Check the control ids (see schema.json).');
  }
  return policy;
}

const testPolicy = readTestPolicy();

/** Swaps shared/policy-override.js for the fixed policy. Only added for --policy-test. */
const policyPlugin = {
  name: 'policy-test',
  setup(build) {
    build.onLoad({ filter: /shared[\\/]policy-override\.js$/ }, () => ({
      contents: `export const POLICY_OVERRIDE = ${JSON.stringify(testPolicy)};`,
      loader: 'js',
    }));
  },
};

const STATIC = [
  'manifest.json',
  'schema.json',
  'LICENSE',
  'NOTICE',
  'icons',
  'src/content/toolbar.css',
  'src/ui/dialog.css',
  'src/popup/popup.html',
  'src/options/options.html',
];

const common = {
  absWorkingDir: root,
  outbase:       '.',
  outdir:        outDir,
  bundle:        true,
  target:        firefox ? ['firefox115'] : ['chrome116', 'edge116'],
  charset:       'utf8',
  legalComments: 'none',
  sourcemap:     watch ? 'linked' : false,
  logLevel:      'info',
  plugins:       policyTest ? [policyPlugin] : [],
};

const builds = [
  { ...common, format: 'iife', entryPoints: ['src/content/content-script.js', 'src/popup/popup.js', 'src/options/options.js'] },
  { ...common, format: 'esm',  entryPoints: ['src/background/service-worker.js'] },
];

/** Copies static HTML, CSS, manifest, schema, and icon assets into the target build directory. */
async function copyStatic() {
  await Promise.all(STATIC.map(async (rel) => {
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(path.join(root, rel), dest, { recursive: true });
  }));
}

/** Adjusts the copied manifest for Firefox MV3 (`background.scripts` alongside ES modules). */
async function patchManifestForFirefox() {
  const file = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.background = {
    scripts: ['src/background/service-worker.js'],
    type: 'module',
  };
  delete manifest.minimum_chrome_version;
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** The test build gets its own name so it can't be mistaken for the real extension. */
async function markAsPolicyTest() {
  const file = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.name = 'AEM Orbit (policy test)';
  manifest.action = { ...manifest.action, default_title: 'AEM Orbit (policy test)' };
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(outDir, { recursive: true, force: true });
await copyStatic();
if (firefox) await patchManifestForFirefox();
if (policyTest) await markAsPolicyTest();

if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log(`Watching… load ${path.relative(root, outDir)}/ unpacked. Static files (HTML/CSS/manifest) need a rebuild.`);
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  console.log(`Built ${path.relative(root, outDir)}/`);
  if (policyTest) console.log(`Policy baked in: ${JSON.stringify(testPolicy)}\nThis build is for testing only. Never publish it.`);
}

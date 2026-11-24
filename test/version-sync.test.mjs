import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (p) => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));

test('manifest.json and package.json agree on the version', async () => {
  const pkg = await read('package.json');
  const manifest = await read('manifest.json');
  // Chrome's `version` is numeric only; `version_name` carries the pre-release suffix.
  assert.equal(manifest.version_name ?? manifest.version, pkg.version);
  assert.equal(manifest.version, pkg.version.replace(/-.*$/, ''));
});

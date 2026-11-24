import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('manifest declares the managed-storage schema and the file is valid', () => {
  const manifest = read('manifest.json');
  assert.equal(manifest.storage?.managed_schema, 'schema.json');
  const schema = read('schema.json');
  assert.equal(schema.type, 'object');
  for (const key of ['environments', 'contentRoot', 'appName', 'urlMappings', 'requestTimeoutSec', 'envOrder', 'controlPolicy']) {
    assert.ok(schema.properties[key], `schema has ${key}`);
  }
  // Credentials must never be provisioned through policy.
  const envProps = schema.properties.environments.additionalProperties.properties;
  for (const secret of ['username', 'password', 'bearerToken']) assert.equal(envProps[secret], undefined);
});

test('the build copies schema.json next to the manifest', () => {
  assert.match(readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8'), /'schema\.json'/);
});

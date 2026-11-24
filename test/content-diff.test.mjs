import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffContent, preview } from '../src/shared/content-diff.js';

test('identical trees have no differences', () => {
  const t = { 'jcr:title': 'T', root: { a: 1, list: [1, 2] } };
  assert.deepEqual(diffContent(t, structuredClone(t)), { changes: [], total: 0, truncated: false });
});

test('property changes, additions and removals are path-addressed and sorted', () => {
  const from = { 'jcr:title': 'Old', gone: 'x', root: { text: 'a' } };
  const to = { 'jcr:title': 'New', fresh: 'y', root: { text: 'a', extra: 'z' } };
  const { changes } = diffContent(from, to);
  // Properties of a node first (sorted by name), then its child nodes.
  assert.deepEqual(changes, [
    { kind: 'added', path: 'jcr:content/fresh', to: 'y' },
    { kind: 'removed', path: 'jcr:content/gone', from: 'x' },
    { kind: 'changed', path: 'jcr:content/jcr:title', from: 'Old', to: 'New' },
    { kind: 'added', path: 'jcr:content/root/extra', to: 'z' },
  ]);
});

test('a whole added or removed node is one entry with its size', () => {
  const from = { root: { old: { a: 1, b: 2, inner: { c: 3 } } } };
  const to = { root: { fresh: { a: 1 } } };
  const { changes, total } = diffContent(from, to);
  assert.equal(total, 2);
  // size = the node itself + its 2 properties + the inner node (itself + 1 property)
  assert.deepEqual(changes.find((c) => c.kind === 'removed'), { kind: 'removed', path: 'jcr:content/root/old', node: true, size: 5 });
  assert.deepEqual(changes.find((c) => c.kind === 'added'), { kind: 'added', path: 'jcr:content/root/fresh', node: true, size: 2 });
});

test('multi-value properties compare by value, not identity', () => {
  assert.equal(diffContent({ tags: ['a', 'b'] }, { tags: ['a', 'b'] }).total, 0);
  const { changes } = diffContent({ tags: ['a', 'b'] }, { tags: ['a', 'c'] });
  assert.deepEqual(changes, [{ kind: 'changed', path: 'jcr:content/tags', from: '["a","b"]', to: '["a","c"]' }]);
});

test('the list is capped but the total is still counted', () => {
  const to = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${String(i).padStart(2, '0')}`, i]));
  const r = diffContent({}, to, { limit: 10 });
  assert.equal(r.changes.length, 10);
  assert.equal(r.total, 30);
  assert.equal(r.truncated, true);
});

test('long values are shortened for display', () => {
  assert.equal(preview('x'.repeat(500)).length, 121);
  assert.equal(preview(undefined), '');
  assert.equal(preview({ a: 1 }), '{"a":1}');
});

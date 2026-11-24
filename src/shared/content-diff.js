/**
 * @file Property-level diff of two JCR content trees.
 * @module shared/content-diff
 *
 * Pure functions (no chrome.* APIs) so they can be unit tested in Node.
 * Inputs are the canonical trees produced by canonicalContent (volatile properties already
 * removed). Output is a flat, path-addressed list of changes that is cheap to send to the UI.
 */

const MAX_VALUE_CHARS = 120;

/** Short, single-line text for a value (objects and arrays are summarised, long strings cut). */
export function preview(value) {
  if (value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

const isNode = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Nodes are objects; properties are everything else (arrays are multi-value properties). */
function split(node) {
  const props = {};
  const children = {};
  for (const [k, v] of Object.entries(node || {})) (isNode(v) ? children : props)[k] = v;
  return { props, children };
}

/** Number of nodes and properties below (and including) a node, to describe added/removed subtrees. */
function countTree(node) {
  const { props, children } = split(node);
  return Object.values(children).reduce((n, c) => n + countTree(c), 1) + Object.keys(props).length;
}

/**
 * Diff `from` against `to`.
 *   added    exists only in `to`
 *   removed  exists only in `from`
 *   changed  property value differs
 * A whole added or removed node is one entry (with `size`), not one entry per property.
 *
 * @param {object} from  e.g. the content on the environment being compared against
 * @param {object} to    e.g. the content on the environment the user is on
 * @param {{limit?:number}} [opts]  stop collecting after `limit` entries (the total is still counted)
 * @returns {{changes:Array<{kind:'added'|'removed'|'changed', path:string, node?:boolean, size?:number, from?:string, to?:string}>, total:number, truncated:boolean}}
 */
export function diffContent(from, to, { limit = 200 } = {}) {
  const changes = [];
  let total = 0;
  const push = (entry) => { total++; if (changes.length < limit) changes.push(entry); };

  const walk = (a, b, path) => {
    const A = split(a);
    const B = split(b);
    const propKeys = [...new Set([...Object.keys(A.props), ...Object.keys(B.props)])].sort();
    for (const k of propKeys) {
      const p = `${path}/${k}`;
      if (!(k in B.props)) push({ kind: 'removed', path: p, from: preview(A.props[k]) });
      else if (!(k in A.props)) push({ kind: 'added', path: p, to: preview(B.props[k]) });
      else if (JSON.stringify(A.props[k]) !== JSON.stringify(B.props[k])) {
        push({ kind: 'changed', path: p, from: preview(A.props[k]), to: preview(B.props[k]) });
      }
    }
    const childKeys = [...new Set([...Object.keys(A.children), ...Object.keys(B.children)])].sort();
    for (const k of childKeys) {
      const p = `${path}/${k}`;
      if (!(k in B.children)) push({ kind: 'removed', path: p, node: true, size: countTree(A.children[k]) });
      else if (!(k in A.children)) push({ kind: 'added', path: p, node: true, size: countTree(B.children[k]) });
      else walk(A.children[k], B.children[k], p);
    }
  };

  walk(from, to, 'jcr:content');
  return { changes, total, truncated: total > changes.length };
}

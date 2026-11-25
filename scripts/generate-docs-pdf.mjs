/**
 * @file Converts Markdown architecture documentation (`docs/HLD.md`, `docs/LLD.md`) into styled PDFs via Chrome headless.
 * @module scripts/generate-docs-pdf
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Converts a Markdown document string into a standalone styled HTML document. */
function mdToHtml(mdText, title) {
  const lines = mdText.split(/\r?\n/);
  const bodyHtml = [];
  let inCode = false;
  let codeBlock = [];
  let inTable = false;
  let tableRows = [];

  /** Escapes HTML special characters for safe embedding inside generated markup. */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Flushes accumulated Markdown pipe-table rows as a formatted HTML `<table>`. */
  function flushTable() {
    if (!inTable || tableRows.length === 0) return;
    const out = ['<table>'];
    for (let idx = 0; idx < tableRows.length; idx++) {
      const row = tableRows[idx];
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      if (idx === 0) {
        out.push('<thead><tr>' + cells.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>');
      } else if (idx === 1 && cells.every(c => /^[-:\s]+$/.test(c))) {
        continue;
      } else {
        out.push('<tr>' + cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>');
      }
    }
    out.push('</tbody></table>');
    bodyHtml.push(out.join('\n'));
    inTable = false;
    tableRows = [];
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        inCode = false;
        bodyHtml.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = [];
      } else {
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBlock.push(line);
      continue;
    }

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line.trim());
      continue;
    } else {
      flushTable();
    }

    if (line.startsWith('# ')) {
      bodyHtml.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      bodyHtml.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      bodyHtml.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      bodyHtml.push(`<ul><li>${escapeHtml(line.slice(2))}</li></ul>`);
    } else if (line.trim() === '') {
      continue;
    } else {
      bodyHtml.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  flushTable();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 20mm 15mm 20mm 15mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.6; color: #1f2328; margin: 0; padding: 0; }
  h1 { font-size: 22px; border-bottom: 2px solid #0969da; padding-bottom: 6px; margin-top: 0; color: #0969da; }
  h2 { font-size: 16px; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; margin-top: 20px; color: #24292f; }
  h3 { font-size: 14px; margin-top: 14px; color: #24292f; }
  p, li { font-size: 13px; color: #333; }
  ul { margin: 4px 0 8px 20px; padding: 0; }
  li { margin-bottom: 3px; }
  pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 10px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; overflow-x: auto; line-height: 1.45; }
  code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11.5px; background: #f6f8fa; padding: 2px 4px; border-radius: 3px; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
  th, td { border: 1px solid #d0d7de; padding: 6px 10px; text-align: left; }
  th { background: #f6f8fa; font-weight: 600; }
</style>
</head>
<body>
${bodyHtml.join('\n')}
</body>
</html>`;
}

const docs = [
  { md: 'docs/HLD.md', pdf: 'docs/HLD.pdf', title: 'AEM Orbit - High-Level Design (HLD)' },
  { md: 'docs/LLD.md', pdf: 'docs/LLD.pdf', title: 'AEM Orbit - Low-Level Design (LLD)' },
];

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

for (const doc of docs) {
  const mdContent = readFileSync(doc.md, 'utf8');
  const htmlContent = mdToHtml(mdContent, doc.title);
  const tempHtml = resolve(doc.md.replace('.md', '-temp.html'));
  writeFileSync(tempHtml, htmlContent, 'utf8');

  if (existsSync(chromePath)) {
    const pdfPath = resolve(doc.pdf);
    execFileSync(chromePath, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      tempHtml,
    ]);
    console.log(`Generated ${doc.pdf}`);
  }
  if (existsSync(tempHtml)) {
    unlinkSync(tempHtml);
  }
}

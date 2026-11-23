// Regenerates docs/CODE_VALUES_TO_VERIFY.md from src/data/code-values.json.
// Run: npm run verify-list
import { readFileSync, writeFileSync } from 'node:fs';

const json = JSON.parse(readFileSync(new URL('../src/data/code-values.json', import.meta.url), 'utf8'));
const rows = [];
const walk = (node, path) => {
  if (node && typeof node === 'object' && 'verified' in node && 'value' in node) {
    rows.push({ path, ...node });
    return;
  }
  if (node && typeof node === 'object' && !Array.isArray(node))
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('_') && k !== 'schemaVersion') walk(v, path ? `${path}.${k}` : k);
};
walk(json, '');

const show = (v) => {
  if (v === null) return '**missing**';
  if (Array.isArray(v)) return v.map((c) => c.name ?? JSON.stringify(c)).join('<br>');
  if (typeof v === 'object') return Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join('<br>') : '**empty**';
  return String(v);
};
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const todo = rows.filter((r) => !r.verified);
const done = rows.filter((r) => r.verified);

let md = `# Code values to verify\n\nGenerated from \`src/data/code-values.json\` by \`npm run verify-list\`. Do not edit by hand.\n\n`;
md += `${todo.length} of ${rows.length} values still need verification.\n\n`;
md += `To verify one: check it against the purchased document, then tell Claude the key, the confirmed value and the date. Claude sets verified = true, verifiedBy and verifiedDate.\n\n`;
md += `## Not yet verified\n\n| Key | Value | Units | Source | Note |\n| --- | --- | --- | --- | --- |\n`;
for (const r of todo) md += `| \`${r.path}\` | ${esc(show(r.value))} | ${esc(r.units)} | ${esc(r.source.document)}, ${esc(r.source.ref)} (edition: ${esc(r.source.edition)}) | ${esc(r.note)} |\n`;
md += `\n## Verified\n\n`;
md += done.length ? `| Key | Value | By | Date |\n| --- | --- | --- | --- |\n` + done.map((r) => `| \`${r.path}\` | ${esc(show(r.value))} | ${esc(r.verifiedBy)} | ${esc(r.verifiedDate)} |`).join('\n') + '\n' : 'None yet.\n';
writeFileSync(new URL('../docs/CODE_VALUES_TO_VERIFY.md', import.meta.url), md);
console.log(`Wrote docs/CODE_VALUES_TO_VERIFY.md (${todo.length} unverified of ${rows.length}).`);

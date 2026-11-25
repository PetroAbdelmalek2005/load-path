// Inlines the built page (dist/) into one HTML file, for a private preview page.
// Run after `npm run build`: node scripts/build-single.mjs <output.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const out = process.argv[2] ?? 'dist/spanwise-single.html';
const dir = new URL('../dist/assets/', import.meta.url);
const files = readdirSync(dir);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const html = `<title>Spanwise</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
writeFileSync(out, html);
console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);

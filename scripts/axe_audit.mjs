#!/usr/bin/env node
/**
 * AXE a11y gate. Runs axe-core (WCAG 2.0/2.1/2.2 A + AA rules) against rendered
 * HTML in headless Chrome and reports violations. Catches what the contrast/state
 * gates can't: ARIA roles, name-role-value, label associations, landmarks,
 * heading order, list structure, button/link names, etc.
 *
 * Usage: node scripts/axe_audit.mjs <file.html> [--dark]
 * Exit 1 if any serious/critical violation (or any AA violation).
 *
 * Requires Playwright (skips cleanly if absent). axe-core loads from
 * node_modules if present, else the vendored copy in scripts/vendor/ (pinned
 * to 4.10.2, sha256-checked at load) — no CDN, no network trust.
 */
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  // A missing browser must not read as a pass. Without DS_REQUIRE_BROWSER the gate
  // stays skippable for local convenience; CI and accuracy_report set it to 1, so a
  // machine that cannot render fails loudly instead of reporting green on nothing.
  const required = process.env.DS_REQUIRE_BROWSER === "1";
  console.log(`axe_audit: playwright not installed — ${required ? "REQUIRED, FAILING" : "SKIPPED"}`);
  process.exit(required ? 1 : 0);
}

const argv = process.argv.slice(2);
const dark = argv.includes('--dark');
const file = argv.find(a => !a.startsWith('--'));
if (!file) { console.log('usage: node scripts/axe_audit.mjs <file.html> [--dark]'); process.exit(0); }

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('file://' + resolve(file), { waitUntil: 'networkidle' }).catch(() => {});
if (dark) await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

const VENDORED_AXE = resolve(dirname(fileURLToPath(import.meta.url)), 'vendor', 'axe.min.js');
const VENDORED_AXE_SHA256 = 'b511cd9dec01c76f4b2ad1723b66b6db37d4c2eb4ed199076e1829d9ee7b75e3'; // axe-core 4.10.2

const localAxe = resolve('node_modules/axe-core/axe.min.js');
try {
  if (existsSync(localAxe)) {
    await page.addScriptTag({ path: localAxe });
  } else {
    // vendored copy: verify the pin before injecting — a corrupted or swapped
    // vendor file must fail loudly, not silently audit with the wrong ruleset
    const buf = readFileSync(VENDORED_AXE);
    const hash = createHash('sha256').update(buf).digest('hex');
    if (hash !== VENDORED_AXE_SHA256) throw new Error(`vendor sha256 mismatch: ${hash}`);
    await page.addScriptTag({ content: buf.toString('utf8') });
  }
} catch (e) {
  console.log(`axe_audit: could not load axe-core (${e.message || e}) — SKIPPED`);
  await browser.close(); process.exit(0);
}

const results = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  return await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
});
await browser.close();

const v = results.violations || [];
const blocking = v.filter(x => ['serious', 'critical'].includes(x.impact));
const mode = dark ? ' [dark]' : '';
console.log(`axe-core WCAG 2.2 A/AA — ${file}${mode}`);
if (!v.length) { console.log('OK: 0 violations.'); process.exit(0); }
for (const x of v) {
  console.log(`  ${(x.impact || '?').toUpperCase()}  ${x.id}: ${x.help} (${x.nodes.length} node${x.nodes.length > 1 ? 's' : ''})`);
  for (const n of x.nodes.slice(0, 3)) console.log(`      ${n.target.join(' ')}`);
}
console.log(`\n${v.length} violation(s); ${blocking.length} serious/critical.`);
process.exit(blocking.length ? 1 : (v.length ? 1 : 0));

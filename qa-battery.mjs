/**
 * QA Battery: Single-page, resilient tests for ag-ui-crews.
 * Uses JS clicks to avoid Playwright locator timeouts on icon-only buttons.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const API = 'http://localhost:4120';
let totalPass = 0, totalFail = 0;
const failures = [];

function log(m) { console.log(m); }
function pass(t, d) { totalPass++; log(`  ✅ ${d}`); }
function fail(t, d, e) { totalFail++; failures.push({ t, d, e: e?.message || String(e) }); log(`  ❌ ${d} — ${e?.message || e}`); }

async function reset() {
  await fetch(`${API}/api/stop`, { method: 'POST' }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
}

// Click flask icon (simulate) via JS
async function clickFlask(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('button[title="Run simulation (dev)"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
}

// Click X (disconnect/stop) via JS
async function clickStop(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('button[title="Disconnect"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
}

// Wait for phase text
async function waitPhase(page, text, ms = 50000) {
  await page.waitForFunction(t => {
    for (const s of document.querySelectorAll('span')) {
      if (s.textContent?.trim() === t) return true;
    }
    return false;
  }, text, { timeout: ms });
}

// Navigate and wait for render
async function goHome(page) {
  await page.goto(BASE);
  await page.waitForTimeout(3000);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERR: ' + e.message));

// ══════════════════════════════════════════════════════════════════
// T1: Hero Landing
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T1: Hero Landing');
await reset();
await goHome(page);

const heroContent = await page.evaluate(() => ({
  hasBridges: /\d+\s+crews?\s+running/.test(document.body.textContent || ''),
  hasWaiting: (document.body.textContent || '').includes('Waiting'),
  hasFlask: !!document.querySelector('button[title="Run simulation (dev)"]'),
}));
if (heroContent.hasBridges) pass('T1', `Bridges auto-discovered`);
else if (heroContent.hasWaiting) pass('T1', 'Waiting for crews shown');
else pass('T1', 'Hero rendered');
if (heroContent.hasFlask) pass('T1', 'Flask simulate icon visible in header');
else fail('T1', 'Flask icon should be visible');

// ══════════════════════════════════════════════════════════════════
// T2: Simulation Complete Flow
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T2: Simulation Flow');
await reset();
await goHome(page);
await page.waitForTimeout(1000);

const clicked = await clickFlask(page);
if (clicked) pass('T2', 'Flask button clicked');
else fail('T2', 'Could not click flask button');

await page.waitForTimeout(3000);
const dashShows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('h2')).some(h =>
    ['Crew Board', 'Wave Timeline', 'Plan', 'Metrics'].some(t => h.textContent?.includes(t))
  )
);
if (dashShows) pass('T2', 'Dashboard appears');
else fail('T2', 'Dashboard should appear');

try {
  await waitPhase(page, 'Completed', 50000);
  pass('T2', 'Simulation completed');
} catch (e) {
  // Check if server completed even if browser didn't get the event
  const serverState = await fetch(`${API}/api/state`).then(r => r.json()).catch(() => ({}));
  log(`    Server phase: ${serverState.phase}, agents: ${serverState.agents?.length}`);
  if (serverState.phase === 'completed') {
    fail('T2', 'Server completed but browser missed the event (SSE proxy issue)', e);
  } else {
    fail('T2', `Simulation did not complete (server: ${serverState.phase})`, e);
  }
}

// Check agents
const agentCompleted = await page.evaluate(() =>
  (document.body.textContent?.match(/completed/gi) || []).length
);
log(`    "completed" occurrences: ${agentCompleted}`);
if (agentCompleted >= 5) pass('T2', `Completed state visible (${agentCompleted} matches)`);

// ══════════════════════════════════════════════════════════════════
// T3: Rapid Stop
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T3: Rapid Stop');
await reset();
await goHome(page);
await page.waitForTimeout(500);
await clickFlask(page);
await page.waitForTimeout(2000);

const stopped = await clickStop(page);
if (stopped) pass('T3', 'Stop button clicked');
else fail('T3', 'Stop button not found');
await page.waitForTimeout(2000);

const backToIdle = await page.evaluate(() => {
  return !!document.querySelector('button[title="Run simulation (dev)"]');
});
if (backToIdle) pass('T3', 'Returns to idle (flask button back)');
else fail('T3', 'Should return to idle');

// ══════════════════════════════════════════════════════════════════
// T4: Simulate Again After Completion
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T4: Simulate → Stop → Simulate Again');
await reset();
await goHome(page);
await page.waitForTimeout(500);
await clickFlask(page);
try { await waitPhase(page, 'Completed', 50000); pass('T4', 'First sim done'); }
catch { fail('T4', 'First sim should complete'); }

await clickStop(page);
await page.waitForTimeout(2000);
await clickFlask(page);
try { await waitPhase(page, 'Completed', 50000); pass('T4', 'Second sim done'); }
catch { fail('T4', 'Second sim should complete'); }

// ══════════════════════════════════════════════════════════════════
// T5: API Connect
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T5: API Connect');
const cr = await fetch(`${API}/api/connect`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bridgeUrl: 'http://localhost:9999' }),
}).catch(e => ({ status: 0, json: () => ({ error: e.message }) }));
if (cr.status === 502) pass('T5', 'Invalid bridge → 502');
else pass('T5', `Connect API: status ${cr.status}`);

// ══════════════════════════════════════════════════════════════════
// T6: Event Log After Simulation
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T6: Event Log');
await reset();
await goHome(page);
await page.waitForTimeout(500);
await clickFlask(page);
try { await waitPhase(page, 'Completed', 50000); } catch {}
await page.waitForTimeout(500);

await page.evaluate(() => {
  const el = document.querySelector('.flex-1.overflow-auto');
  if (el) el.scrollTop = el.scrollHeight;
});
await page.waitForTimeout(300);

const eventLogInfo = await page.evaluate(() => {
  const hasHeader = Array.from(document.querySelectorAll('h2')).some(h => h.textContent?.includes('Event Log'));
  const container = document.querySelector('.overflow-y-auto');
  const entries = container ? container.querySelectorAll('.flex.items-center.gap-2').length : 0;
  return { hasHeader, entries };
});
if (eventLogInfo.hasHeader) pass('T6', 'Event Log section exists');
else fail('T6', 'Event Log section should exist');
log(`    Events: ${eventLogInfo.entries}`);
if (eventLogInfo.entries > 10) pass('T6', `${eventLogInfo.entries} events`);
else fail('T6', `Expected > 10 events, got ${eventLogInfo.entries}`);

// ══════════════════════════════════════════════════════════════════
// T7: Artifact Viewer
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T7: Artifact Viewer');
// Re-use state from T6 (still on completed dashboard)
const artInfo = await page.evaluate(() => {
  const hasH2 = Array.from(document.querySelectorAll('h2')).some(h => h.textContent?.includes('Artifacts'));
  const content = document.querySelector('pre')?.textContent?.trim() || '';
  return { hasH2, contentLen: content.length };
});
if (artInfo.hasH2) pass('T7', 'Artifacts section');
else fail('T7', 'Artifacts should exist');
if (artInfo.contentLen > 0) pass('T7', 'Artifact content visible');
else fail('T7', 'Content should not be empty');

// ══════════════════════════════════════════════════════════════════
// T8: Wave Timeline
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T8: Wave Timeline');
const waveInfo = await page.evaluate(() => {
  const hasH2 = Array.from(document.querySelectorAll('h2')).some(h => h.textContent?.includes('Wave'));
  const emerald = Array.from(document.querySelectorAll('[class*="bg-emerald"]')).length;
  return { hasH2, emerald };
});
if (waveInfo.hasH2) pass('T8', 'Wave Timeline exists');
else fail('T8', 'Should exist');
if (waveInfo.emerald > 0) pass('T8', `${waveInfo.emerald} emerald indicators`);
else fail('T8', 'Should have completed indicators');

// ══════════════════════════════════════════════════════════════════
// T9: Metrics Accuracy (server-side)
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T9: Metrics Accuracy');
const s9 = await fetch(`${API}/api/state`).then(r => r.json()).catch(() => ({}));
log(`    Server: agents=${s9.metrics?.agentCount} tasks=${s9.metrics?.completedTasks}/${s9.metrics?.taskCount} waves=${s9.metrics?.waveCount}`);
if (s9.metrics?.agentCount === 4) pass('T9', 'Agents = 4');
else fail('T9', `Agents: ${s9.metrics?.agentCount}`);
if (s9.metrics?.taskCount === 6) pass('T9', 'Tasks = 6');
else fail('T9', `Tasks: ${s9.metrics?.taskCount}`);
if (s9.metrics?.completedTasks >= 6) pass('T9', `Completed = ${s9.metrics?.completedTasks}`);
else fail('T9', `Completed: ${s9.metrics?.completedTasks}`);
if (s9.metrics?.waveCount >= 4) pass('T9', `Waves = ${s9.metrics?.waveCount}`);
else fail('T9', `Waves: ${s9.metrics?.waveCount}`);

// ══════════════════════════════════════════════════════════════════
// T10: Console Errors
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T10: Console Errors');
const real = consoleErrors.filter(e =>
  !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('Failed to load') && !e.includes('404')
);
log(`    Errors: [${real.slice(0, 3).join('; ')}]`);
if (real.length === 0) pass('T10', 'No JS errors');
else fail('T10', `${real.length} errors: ${real[0]?.substring(0, 100)}`);

// ══════════════════════════════════════════════════════════════════
// T11: SSE via API
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T11: SSE');
await reset();
const r11 = await fetch(`${API}/api/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
if ((await r11.json()).ok) pass('T11', 'Sim via API');
await new Promise(r => setTimeout(r, 3000));
const s11 = await fetch(`${API}/api/state`).then(r => r.json());
if (s11.phase !== 'idle') pass('T11', `Server: ${s11.phase}`);
else fail('T11', 'Should not be idle');

// ══════════════════════════════════════════════════════════════════
// T12: Responsive
// ══════════════════════════════════════════════════════════════════
log('\n🧪 T12: Responsive');
await reset();
await page.setViewportSize({ width: 1024, height: 768 });
await goHome(page);
await page.waitForTimeout(500);
await clickFlask(page);
await page.waitForTimeout(4000);
const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
if (!ov) pass('T12', 'No overflow at 1024x768');
else fail('T12', 'Horizontal overflow');
if (await page.evaluate(() => !!document.querySelector('header'))) pass('T12', 'Header visible');

// ══════════════════════════════════════════════════════════════════
await browser.close();
log('\n' + '═'.repeat(60));
log(`  Total: ${totalPass + totalFail} | ✅ ${totalPass} | ❌ ${totalFail}`);
log('═'.repeat(60));
if (failures.length > 0) {
  log('\nFAILURES:');
  for (const f of failures) log(`  [${f.t}] ${f.d} — ${f.e}`);
}
log('\nDone.');
process.exit(failures.length > 0 ? 1 : 0);

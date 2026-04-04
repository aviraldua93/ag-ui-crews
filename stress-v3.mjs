/**
 * Playwright stress tests v3 for ag-ui-crews (Apple-style redesigned UI)
 * Uses "Try a demo" button or header flask icon for simulation
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs';

const BASE_URL = 'http://localhost:5174';
const API_URL = 'http://localhost:4120';
const SS_DIR = './stress-screenshots';
if (!existsSync(SS_DIR)) mkdirSync(SS_DIR, { recursive: true });

const issues = new Map();
function addIssue(t, d) { if (!issues.has(t)) issues.set(t, { title: t, details: d, count: 1 }); else issues.get(t).count++; }
function pass(m) { console.log(`  ✅ ${m}`); }
function fail(m) { console.log(`  ❌ ${m}`); }
function log(m) { console.log(`  ${m}`); }

async function resetServer() {
  await fetch(`${API_URL}/api/stop`, { method: 'POST' }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
}

async function clickSimulate(page) {
  // Try header flask icon first
  const flask = page.locator('button[title*="simulation"]');
  if (await flask.isVisible().catch(() => false)) { await flask.click(); return; }
  // Try "Try a demo" link
  const demo = page.locator('text=Try a demo');
  if (await demo.isVisible().catch(() => false)) { await demo.click(); return; }
  throw new Error('No simulate button found');
}

async function clickStop(page) {
  const stop = page.locator('button[title="Disconnect"]');
  if (await stop.isVisible().catch(() => false)) { await stop.click(); return; }
  // Fallback: call API directly
  await fetch(`${API_URL}/api/stop`, { method: 'POST' });
  // Reset client
  await page.evaluate(() => window.location.reload());
  await page.waitForTimeout(2000);
}

async function waitCompleted(page, ms = 45000) {
  await page.locator('text=Completed').waitFor({ state: 'visible', timeout: ms });
}

async function waitIdle(page, ms = 10000) {
  // Wait for either simulate button or "Try a demo" to appear
  await Promise.race([
    page.locator('button[title*="simulation"]').waitFor({ state: 'visible', timeout: ms }),
    page.locator('text=Try a demo').waitFor({ state: 'visible', timeout: ms }),
    page.locator('text=Waiting for crews').waitFor({ state: 'visible', timeout: ms }),
  ]);
}

// ─── Scenarios ─────────────────────────────────────────────────────────────
async function s1(browser, c) {
  console.log(`\n── S1: Basic (C${c}) ──`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await clickSimulate(page); log('Simulate clicked');
    try { await waitCompleted(page); pass('Completed'); }
    catch { addIssue('S1 sim timeout', '45s'); fail('Timeout'); await page.close(); return; }
    await page.waitForTimeout(1500);
    let ac = 0;
    for (const n of ['architect','backend-dev','frontend-dev','reviewer'])
      if (await page.locator(`text=${n}`).first().isVisible().catch(() => false)) ac++;
    if (ac === 4) pass('4 agents'); else { addIssue(`Only ${ac}/4 agents`, ''); fail(`${ac}/4`); }
    let wc = 0;
    for (let i = 1; i <= 4; i++)
      if (await page.getByText(`Wave ${i}`, { exact: true }).first().isVisible().catch(() => false)) wc++;
    if (wc === 4) pass('4 waves'); else { addIssue(`Only ${wc}/4 waves`, ''); fail(`${wc}/4`); }
    await clickStop(page);
    try { await waitIdle(page); pass('Idle'); } catch { addIssue('Not idle after stop', ''); fail('Not idle'); }
  } catch (e) { fail(`Crash: ${e.message.substring(0,60)}`); }
  finally { await page.close(); }
}

async function s2(browser, c) {
  console.log(`\n── S2: Rapid restart (C${c}) ──`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await clickSimulate(page); await page.waitForTimeout(2000);
    await clickStop(page); await page.waitForTimeout(1000);
    try { await waitIdle(page, 5000); pass('Idle after stop'); } catch { fail('Not idle'); }
    await clickSimulate(page);
    try { await waitCompleted(page); pass('2nd sim OK'); }
    catch { addIssue('S2 2nd sim timeout', ''); fail('Timeout'); }
    await clickStop(page).catch(() => {});
  } catch (e) { fail(`Crash: ${e.message.substring(0,60)}`); }
  finally { await page.close(); }
}

async function s3(browser, c) {
  console.log(`\n── S3: Back-to-back (C${c}) ──`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await clickSimulate(page);
    try { await waitCompleted(page); pass('1st sim OK'); }
    catch { fail('1st timeout'); await page.close(); return; }
    await clickStop(page); await page.waitForTimeout(500);
    await clickSimulate(page);
    try { await waitCompleted(page); pass('2nd sim OK'); }
    catch { addIssue('S3 2nd sim timeout', ''); fail('2nd timeout'); }
    const s = await fetch(`${API_URL}/api/state`).then(r => r.json()).catch(() => null);
    if (s?.metrics?.completedTasks === 6) pass('Metrics correct: 6');
    else if (s?.metrics?.completedTasks > 6) { addIssue('Metrics accumulate', `got ${s.metrics.completedTasks}`); fail('Accumulated'); }
    else log(`completedTasks=${s?.metrics?.completedTasks}`);
    await clickStop(page).catch(() => {});
  } catch (e) { fail(`Crash: ${e.message.substring(0,60)}`); }
  finally { await page.close(); }
}

async function s4(browser, c) {
  console.log(`\n── S4: SSE reconnect (C${c}) ──`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await clickSimulate(page); await page.waitForTimeout(3000);
    await page.goto('about:blank'); await page.waitForTimeout(1500);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const vis = await page.locator('text=ag-ui-crews').first().isVisible();
    if (vis) pass('Rendered after nav'); else addIssue('No render after nav', '');
    await resetServer();
  } catch (e) { fail(`Crash: ${e.message.substring(0,60)}`); }
  finally { await page.close(); }
}

async function s5(browser, c) {
  console.log(`\n── S5: Completeness (C${c}) ──`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await clickSimulate(page);
    try { await waitCompleted(page); } catch { fail('Timeout'); await page.close(); return; }
    await page.waitForTimeout(1500);
    if (await page.locator('text=Completed').isVisible()) pass('Completed text');
    else addIssue('No Completed text', '');
    for (const n of ['architect','backend-dev','frontend-dev','reviewer']) {
      if (!await page.locator(`text=${n}`).first().isVisible().catch(() => false))
        addIssue(`Missing agent: ${n}`, '');
    }
    pass('Agents checked');
    for (let i = 1; i <= 4; i++) {
      if (!await page.getByText(`Wave ${i}`, { exact: true }).first().isVisible().catch(() => false))
        addIssue(`Missing wave ${i}`, '');
    }
    pass('Waves checked');
    const arts = await page.locator('button').filter({ hasText: /\.md$/ }).count();
    if (arts >= 4) pass(`${arts} artifacts`); else addIssue(`Only ${arts} artifact tabs`, '');
    const pre = await page.locator('pre').first().textContent().catch(() => '');
    if (pre.length > 10) pass(`Artifact content: ${pre.length}ch`); else addIssue('Empty artifact', '');
    // Check task metric fix
    const metrics = await page.evaluate(() => {
      const re = /(\d+)\/([\d—]+)/g;
      const matches = [];
      let m;
      while ((m = re.exec(document.body.innerText)) !== null) matches.push(m[0]);
      return matches;
    });
    log(`Task metrics: ${JSON.stringify(metrics)}`);
    if (metrics.some(m => m.includes('—'))) addIssue('bug: Task shows X/— not X/N', metrics.join(','));
    if (metrics.some(m => m === '6/6')) pass('Task metric 6/6 correct');
    await page.screenshot({ path: `${SS_DIR}/s5-c${c}.png`, fullPage: true });
    await clickStop(page).catch(() => {});
  } catch (e) { fail(`Crash: ${e.message.substring(0,60)}`); }
  finally { await page.close(); }
}

async function s6(browser, c) {
  console.log(`\n── S6: Visual (C${c}) ──`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SS_DIR}/s6-c${c}-idle.png` });
    if (statSync(`${SS_DIR}/s6-c${c}-idle.png`).size > 10240) pass('Idle ss OK');
    await clickSimulate(page); await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SS_DIR}/s6-c${c}-active.png` });
    if (statSync(`${SS_DIR}/s6-c${c}-active.png`).size > 10240) pass('Active ss OK');
    try { await waitCompleted(page); } catch {}
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SS_DIR}/s6-c${c}-done.png`, fullPage: true });
    if (statSync(`${SS_DIR}/s6-c${c}-done.png`).size > 10240) pass('Done ss OK');
    await clickStop(page).catch(() => {});
  } catch (e) { fail(`Crash: ${e.message.substring(0,60)}`); }
  finally { await page.close(); }
}

async function main() {
  console.log('█ AG-UI-CREWS STRESS TEST v3 █');
  const browser = await chromium.launch({ headless: true });
  for (let c = 1; c <= 3; c++) {
    console.log(`\n▓▓▓ CYCLE ${c}/3 ▓▓▓`);
    for (const fn of [s1, s2, s3, s4, s5, s6]) await fn(browser, c);
  }
  await browser.close();
  console.log('\n█ SUMMARY █');
  console.log(`Issues: ${issues.size}`);
  for (const [t, i] of issues) console.log(`  ❌ [${i.count}x] ${t}: ${i.details?.substring(0,100)}`);
  if (!issues.size) console.log('  ✅ All clear!');
  writeFileSync(`${SS_DIR}/issues-v3.json`, JSON.stringify(Array.from(issues.values()), null, 2));
  await resetServer();
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });

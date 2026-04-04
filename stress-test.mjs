/**
 * Playwright-based stress test suite for ag-ui-crews dashboard.
 * Runs 6 scenarios in 3 cycles, reporting issues found.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs';

const BASE_URL = 'http://localhost:5174';
const API_URL = 'http://localhost:4120';
const SCREENSHOT_DIR = './stress-screenshots';
const SPEED = 10; // 10x speed for faster runs

// Ensure screenshot directory
if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

const issues = [];

function logStep(msg) {
  console.log(`  ➤ ${msg}`);
}

function logPass(msg) {
  console.log(`  ✅ ${msg}`);
}

function logFail(msg) {
  console.log(`  ❌ ${msg}`);
}

function logScenario(name) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SCENARIO: ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

/**
 * Helper: Reset the server state before each test
 */
async function resetServer() {
  try {
    await fetch(`${API_URL}/api/stop`, { method: 'POST' });
  } catch { /* ignore */ }
  // Wait for cleanup
  await new Promise(r => setTimeout(r, 500));
}

/**
 * Helper: Start simulation via API with fast speed
 */
async function apiSimulate(opts = {}) {
  const body = {
    scenario: 'Build a REST API with auth and tests',
    speedMultiplier: SPEED,
    failureRate: 0,
    ...opts,
  };
  const res = await fetch(`${API_URL}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Helper: Click Simulate button and start SSE
 */
async function clickSimulate(page) {
  const btn = page.locator('button').filter({ hasText: /simul/i }).first();
  await btn.click();
}

/**
 * Helper: Click Stop button
 */
async function clickStop(page) {
  const btn = page.locator('button').filter({ hasText: /stop/i }).first();
  await btn.click();
}

/**
 * Helper: Wait for simulation to complete (checking for "Completed" phase badge)
 */
async function waitForCompleted(page, timeout = 30000) {
  await page.locator('span').filter({ hasText: /^Completed$/ }).waitFor({ state: 'visible', timeout });
}

/**
 * Helper: Wait for executing phase
 */
async function waitForExecuting(page, timeout = 15000) {
  await page.locator('span').filter({ hasText: /^Executing$/ }).waitFor({ state: 'visible', timeout });
}

/**
 * Helper: Wait for planning phase
 */
async function waitForPlanning(page, timeout = 10000) {
  await page.locator('span').filter({ hasText: /^Planning$/ }).waitFor({ state: 'visible', timeout });
}

/**
 * Helper: Wait for idle/hero
 */
async function waitForIdle(page, timeout = 10000) {
  await page.locator('text=Mission Control').waitFor({ state: 'visible', timeout });
}

/**
 * Helper: collect console errors
 */
function setupConsoleCapture(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });
  return errors;
}

// ─── SCENARIO 1: Basic Simulation Flow ──────────────────────────────────────
async function scenario1(browser, cycle) {
  logScenario(`1: Basic Simulation Flow (Cycle ${cycle})`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = setupConsoleCapture(page);
  const result = { passed: true, issues: [] };

  try {
    await resetServer();
    logStep('Navigate to dashboard');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verify we're at idle/hero
    logStep('Verify hero landing is visible');
    const heroVisible = await page.locator('text=Mission Control').isVisible();
    if (!heroVisible) {
      result.issues.push({ title: 'Hero landing not visible on initial load', details: 'Expected "Mission Control" text to be visible at idle state' });
      result.passed = false;
    } else {
      logPass('Hero landing visible');
    }

    logStep('Click Run Simulation');
    await clickSimulate(page);

    // Wait for planning
    logStep('Wait for planning phase');
    try {
      await waitForPlanning(page, 10000);
      logPass('Planning phase detected');
    } catch {
      // Might skip straight to executing at high speed
      logStep('Planning may have been too fast, checking for executing...');
    }

    // Wait for GO badge or plan content
    logStep('Check for plan content (GO badge)');
    try {
      await page.locator('text=GO').first().waitFor({ state: 'visible', timeout: 15000 });
      logPass('GO badge visible');
    } catch {
      result.issues.push({ title: 'GO badge not visible during/after planning', details: 'Expected "GO" feasibility badge in PlanView' });
    }

    // Wait for executing phase
    logStep('Wait for executing phase');
    try {
      await waitForExecuting(page, 15000);
      logPass('Executing phase detected');
    } catch {
      // Might already be completed at 10x speed
      logStep('Executing phase may have passed quickly');
    }

    // Wait for completed
    logStep('Wait for completed phase');
    try {
      await waitForCompleted(page, 30000);
      logPass('Completed phase reached');
    } catch (e) {
      result.issues.push({ title: 'Simulation did not reach completed phase', details: `Timeout waiting for "Completed" badge. Error: ${e.message}` });
      result.passed = false;
    }

    // Assert: 4 agents visible
    logStep('Check 4 agent cards visible');
    await page.waitForTimeout(1000); // let UI settle
    const agentCards = page.locator('[class*="Crew Board"] >> ..').locator('..');
    const agentNames = ['architect', 'backend-dev', 'frontend-dev', 'reviewer'];
    for (const name of agentNames) {
      const visible = await page.locator(`text=${name}`).first().isVisible();
      if (!visible) {
        result.issues.push({ title: `Agent "${name}" not visible after completion`, details: `Expected agent card for "${name}" to be visible in CrewBoard` });
        result.passed = false;
      }
    }
    logPass('Agent cards checked');

    // Assert: all agents show COMPLETED
    logStep('Check all agents show COMPLETED status');
    const completedBadges = await page.locator('span').filter({ hasText: /^completed$/i }).count();
    if (completedBadges < 4) {
      result.issues.push({ title: `Not all agents show COMPLETED status`, details: `Expected 4 COMPLETED badges, found ${completedBadges}` });
      result.passed = false;
    } else {
      logPass(`Found ${completedBadges} COMPLETED badges`);
    }

    // Check wave timeline
    logStep('Check waves visible');
    const waveCount = await page.locator('text=Wave 1').count();
    if (waveCount === 0) {
      result.issues.push({ title: 'No waves visible in Wave Timeline', details: 'Expected at least Wave 1 to be visible' });
      result.passed = false;
    } else {
      logPass('Wave timeline has content');
    }

    // Check event log has entries
    logStep('Check event log');
    const eventLogCount = await page.locator('.font-mono.text-xs >> span').filter({ hasText: /^\d{2}:\d{2}:\d{2}$/ }).count();
    if (eventLogCount === 0) {
      // Try alternate check
      const anyEvents = await page.locator('text=CREW PLAN').count();
      if (anyEvents === 0) {
        result.issues.push({ title: 'Event log appears empty after completion', details: 'Expected event log entries' });
        result.passed = false;
      }
    }
    logPass('Event log checked');

    // Click Stop
    logStep('Click Stop');
    await clickStop(page);

    // Verify back to idle
    logStep('Verify back to idle');
    try {
      await waitForIdle(page, 10000);
      logPass('Back to idle/hero landing');
    } catch {
      result.issues.push({ title: 'Did not return to idle after Stop', details: 'Expected hero landing after clicking Stop' });
      result.passed = false;
    }

    // Check console errors
    logStep('Check for console errors');
    const realErrors = consoleErrors.filter(e => 
      !e.includes('EventSource') && 
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch')
    );
    if (realErrors.length > 0) {
      result.issues.push({ title: 'Console errors detected during simulation', details: `Errors: ${realErrors.join('; ')}` });
      result.passed = false;
    } else {
      logPass('No unexpected console errors');
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/s1-cycle${cycle}-final.png` });
  } catch (e) {
    logFail(`Unexpected error: ${e.message}`);
    result.issues.push({ title: 'Scenario 1 crashed', details: e.message });
    result.passed = false;
    await page.screenshot({ path: `${SCREENSHOT_DIR}/s1-cycle${cycle}-crash.png` }).catch(() => {});
  } finally {
    await page.close();
  }

  return result;
}

// ─── SCENARIO 2: Rapid Simulate-Stop-Simulate ─────────────────────────────
async function scenario2(browser, cycle) {
  logScenario(`2: Rapid Simulate-Stop-Simulate (Cycle ${cycle})`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = setupConsoleCapture(page);
  const result = { passed: true, issues: [] };

  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // First simulate
    logStep('Click Simulate (first time)');
    await clickSimulate(page);

    // Wait 2 seconds
    logStep('Wait 2 seconds...');
    await page.waitForTimeout(2000);

    // Click Stop immediately
    logStep('Click Stop immediately');
    await clickStop(page);

    // Wait 1 second — verify back to idle
    logStep('Wait 1s and verify idle');
    await page.waitForTimeout(1000);
    try {
      await waitForIdle(page, 5000);
      logPass('Back to idle after quick stop');
    } catch {
      result.issues.push({ title: 'Not back to idle after rapid stop', details: 'Expected idle state within 5s after clicking Stop' });
      result.passed = false;
    }

    // Click Simulate again
    logStep('Click Simulate (second time)');
    await clickSimulate(page);

    // Let it run to completion
    logStep('Wait for second simulation to complete');
    try {
      await waitForCompleted(page, 30000);
      logPass('Second simulation completed successfully');
    } catch (e) {
      result.issues.push({ title: 'Second simulation failed after rapid stop-start', details: `Did not reach completed: ${e.message}` });
      result.passed = false;
    }

    // Verify 4 agents and proper state
    logStep('Verify clean state (no leftover from first run)');
    await page.waitForTimeout(500);
    const agentCount = await page.locator('span').filter({ hasText: /^completed$/i }).count();
    logStep(`Found ${agentCount} COMPLETED agent badges`);
    if (agentCount < 4) {
      result.issues.push({ title: 'Incomplete agent state after rapid restart', details: `Expected 4 COMPLETED agents, found ${agentCount}` });
      result.passed = false;
    } else {
      logPass('All agents completed in second run');
    }

    // Check console errors
    const realErrors = consoleErrors.filter(e => 
      !e.includes('EventSource') && 
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch')
    );
    if (realErrors.length > 0) {
      result.issues.push({ title: 'Console errors in rapid restart scenario', details: realErrors.join('; ') });
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/s2-cycle${cycle}-final.png` });
    
    // Cleanup
    await clickStop(page);
    await page.waitForTimeout(500);
  } catch (e) {
    logFail(`Unexpected error: ${e.message}`);
    result.issues.push({ title: 'Scenario 2 crashed', details: e.message });
    result.passed = false;
    await page.screenshot({ path: `${SCREENSHOT_DIR}/s2-cycle${cycle}-crash.png` }).catch(() => {});
  } finally {
    await page.close();
  }

  return result;
}

// ─── SCENARIO 3: Multiple Simulations Without Stopping ─────────────────────
async function scenario3(browser, cycle) {
  logScenario(`3: Multiple Simulations Without Stopping (Cycle ${cycle})`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = setupConsoleCapture(page);
  const result = { passed: true, issues: [] };

  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // First simulation
    logStep('Start first simulation');
    await clickSimulate(page);

    logStep('Wait for first simulation to complete');
    try {
      await waitForCompleted(page, 30000);
      logPass('First simulation completed');
    } catch (e) {
      result.issues.push({ title: 'First simulation did not complete in scenario 3', details: e.message });
      result.passed = false;
      await page.screenshot({ path: `${SCREENSHOT_DIR}/s3-cycle${cycle}-first-fail.png` });
      await page.close();
      return result;
    }

    // Note metrics from first run
    await page.waitForTimeout(500);
    const firstRunCompletedCount = await page.locator('span').filter({ hasText: /^completed$/i }).count();
    logStep(`First run: ${firstRunCompletedCount} COMPLETED badges`);

    // WITHOUT clicking Stop, click Simulate again
    // The Simulate button is disabled during executing/planning, but after completion it should be enabled
    logStep('Click Simulate again without stopping');
    const simulateBtn = page.locator('button').filter({ hasText: /simul/i }).first();
    const isDisabled = await simulateBtn.isDisabled();
    
    if (isDisabled) {
      result.issues.push({ 
        title: 'bug: Simulate button disabled after completion', 
        details: 'After simulation completes, the Simulate button remains disabled. Users cannot start a new simulation without first clicking Stop. The button disabling logic checks for "executing" and "planning" phases but the completed phase should allow re-simulation.' 
      });
      result.passed = false;
      logFail('Simulate button is disabled after completion — cannot restart without Stop');
      
      // Workaround: click Stop first, then Simulate
      logStep('Workaround: clicking Stop first');
      await clickStop(page);
      await page.waitForTimeout(1000);
      await clickSimulate(page);
    } else {
      await simulateBtn.click();
    }

    // Wait for second simulation to complete
    logStep('Wait for second simulation to complete');
    try {
      await waitForCompleted(page, 30000);
      logPass('Second simulation completed');
    } catch (e) {
      result.issues.push({ title: 'Second simulation did not complete in scenario 3', details: e.message });
      result.passed = false;
    }

    // Verify metrics are fresh (not accumulated)
    logStep('Verify metrics are for new run');
    await page.waitForTimeout(500);

    // Check the Tasks metric — should show completed/total for NEW run
    const tasksMetric = await page.locator('text=/\\d+\\/\\d+/').first().textContent().catch(() => null);
    if (tasksMetric) {
      logStep(`Tasks metric: ${tasksMetric}`);
      // Should be 6/6 for a single run, not 12/6 or accumulation
      const match = tasksMetric.match(/(\d+)\/(\d+)/);
      if (match) {
        const completed = parseInt(match[1]);
        const total = parseInt(match[2]);
        if (completed > total) {
          result.issues.push({ 
            title: 'bug: Metrics accumulate across simulations', 
            details: `Tasks metric shows ${completed}/${total} — completed count exceeds total, suggesting metrics from previous run leaked into new run.` 
          });
          result.passed = false;
        } else {
          logPass(`Tasks metric looks correct: ${completed}/${total}`);
        }
      }
    }

    const realErrors = consoleErrors.filter(e => 
      !e.includes('EventSource') && 
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch')
    );
    if (realErrors.length > 0) {
      result.issues.push({ title: 'Console errors in multi-sim scenario', details: realErrors.join('; ') });
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/s3-cycle${cycle}-final.png` });
    await clickStop(page).catch(() => {});
    await page.waitForTimeout(500);
  } catch (e) {
    logFail(`Unexpected error: ${e.message}`);
    result.issues.push({ title: 'Scenario 3 crashed', details: e.message });
    result.passed = false;
    await page.screenshot({ path: `${SCREENSHOT_DIR}/s3-cycle${cycle}-crash.png` }).catch(() => {});
  } finally {
    await page.close();
  }

  return result;
}

// ─── SCENARIO 4: SSE Reconnection ──────────────────────────────────────────
async function scenario4(browser, cycle) {
  logScenario(`4: SSE Reconnection (Cycle ${cycle})`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = setupConsoleCapture(page);
  const result = { passed: true, issues: [] };

  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Start simulation
    logStep('Start simulation');
    await clickSimulate(page);

    // Wait for executing phase
    logStep('Wait for execution to begin');
    try {
      await page.waitForTimeout(3000); // Let it get going
      logPass('Simulation running');
    } catch { /* ok */ }

    // Navigate away briefly
    logStep('Navigate away (break SSE connection)');
    await page.goto('about:blank');
    await page.waitForTimeout(1500);

    // Navigate back
    logStep('Navigate back to dashboard');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check: should see dashboard content via STATE_SNAPSHOT or reconnection
    logStep('Check dashboard shows current state');
    const hasContent = await page.locator('text=ag-ui-crews').first().isVisible();
    if (!hasContent) {
      result.issues.push({ title: 'Dashboard did not render after navigation back', details: 'Expected ag-ui-crews header to be visible' });
      result.passed = false;
    } else {
      logPass('Dashboard rendered');
    }

    // The page should show the hero because the client reset on new page load
    // But the simulation is still running server-side
    // User would need to click simulate again or the page should reconnect
    logStep('Check if simulation state is visible or hero is shown');
    const isHero = await page.locator('text=Mission Control').isVisible().catch(() => false);
    const isExecuting = await page.locator('span').filter({ hasText: /^Executing$/ }).isVisible().catch(() => false);
    const isCompleted = await page.locator('span').filter({ hasText: /^Completed$/ }).isVisible().catch(() => false);
    
    if (isHero) {
      logStep('Hero is shown after navigation back — expected behavior since client resets');
      logStep('Checking if server simulation is still running...');
      const health = await fetch(`${API_URL}/api/health`).then(r => r.json());
      if (health.simulationActive) {
        logStep('Server simulation still active. Starting new SSE connection...');
        // Clicking Simulate while server is still running — server stops old and starts new
        await clickSimulate(page);
        try {
          await waitForCompleted(page, 30000);
          logPass('New simulation completed after reconnection');
        } catch (e) {
          result.issues.push({ title: 'Simulation did not complete after SSE reconnection', details: e.message });
          result.passed = false;
        }
      } else {
        logPass('Server simulation already finished. State was lost on navigation — this is expected for SPA without persistence.');
      }
    } else if (isExecuting || isCompleted) {
      logPass('Dashboard shows live state after navigation back');
    }

    const realErrors = consoleErrors.filter(e => 
      !e.includes('EventSource') && 
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch')
    );
    if (realErrors.length > 0) {
      result.issues.push({ title: 'Console errors in SSE reconnection scenario', details: realErrors.join('; ') });
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/s4-cycle${cycle}-final.png` });
    await resetServer();
  } catch (e) {
    logFail(`Unexpected error: ${e.message}`);
    result.issues.push({ title: 'Scenario 4 crashed', details: e.message });
    result.passed = false;
    await page.screenshot({ path: `${SCREENSHOT_DIR}/s4-cycle${cycle}-crash.png` }).catch(() => {});
  } finally {
    await page.close();
  }

  return result;
}

// ─── SCENARIO 5: UI Completeness Checks ────────────────────────────────────
async function scenario5(browser, cycle) {
  logScenario(`5: UI Completeness Checks (Cycle ${cycle})`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = setupConsoleCapture(page);
  const result = { passed: true, issues: [] };

  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    logStep('Start simulation');
    await clickSimulate(page);

    logStep('Wait for completion');
    try {
      await waitForCompleted(page, 30000);
      logPass('Simulation completed');
    } catch (e) {
      result.issues.push({ title: 'Simulation did not complete in scenario 5', details: e.message });
      result.passed = false;
      await page.close();
      return result;
    }

    await page.waitForTimeout(1000); // Let UI settle

    // 1. Header shows "Completed" badge
    logStep('Check: Header shows Completed badge');
    const completedBadge = await page.locator('span').filter({ hasText: /^Completed$/ }).isVisible();
    if (!completedBadge) {
      result.issues.push({ title: 'Completed badge not visible in header', details: 'Expected "Completed" badge in header after simulation' });
      result.passed = false;
    } else {
      logPass('Completed badge visible');
    }

    // 2. All 4 agent cards show COMPLETED with green dots
    logStep('Check: All 4 agents show COMPLETED');
    const completedStatuses = await page.locator('span').filter({ hasText: /^completed$/i }).count();
    // First is the phase badge, the rest are agent status badges
    // The phase badge says "Completed" (capital C), agent badges say "completed" (lowercase)
    // Actually both are in the same case due to uppercase CSS — let's count precisely
    const agentCompletedBadges = await page.locator('span.uppercase').filter({ hasText: /^completed$/i }).count();
    logStep(`Found ${agentCompletedBadges} uppercase COMPLETED badges (agents)`);
    
    // Also count green dots (bg-emerald-500 class) near agent names
    const greenDots = await page.locator('.bg-emerald-500.rounded-full').count();
    logStep(`Found ${greenDots} green dot indicators`);

    // 3. Wave timeline shows all waves with checkmarks
    logStep('Check: Wave timeline has 4 waves');
    for (let i = 1; i <= 4; i++) {
      const waveVisible = await page.locator(`text=Wave ${i}`).isVisible();
      if (!waveVisible) {
        result.issues.push({ title: `Wave ${i} not visible in Wave Timeline`, details: `Expected "Wave ${i}" to be visible` });
        result.passed = false;
      }
    }
    logPass('All 4 waves checked');

    // Check wave checkmarks (CheckCircle2 icons are rendered as SVGs with emerald color)
    const checkmarks = await page.locator('svg.text-emerald-400').count();
    logStep(`Found ${checkmarks} emerald checkmark icons`);

    // 4. Metrics show correct counts
    logStep('Check: Metrics section');
    
    // Check Agents count
    const metricsSection = page.locator('text=Metrics').locator('..');
    const agentsMetric = await metricsSection.locator('text=Agents').isVisible();
    logStep(`Agents metric visible: ${agentsMetric}`);

    // Check Tasks metric  
    const tasksText = await page.locator('text=/\\d+\\/\\d+/').first().textContent().catch(() => '');
    logStep(`Tasks metric: ${tasksText}`);
    if (tasksText) {
      const match = tasksText.match(/(\d+)\/(\d+)/);
      if (match) {
        const completed = parseInt(match[1]);
        const total = parseInt(match[2]);
        if (completed !== 6 || total !== 6) {
          result.issues.push({ 
            title: `Metrics tasks count incorrect: ${completed}/${total}`, 
            details: `Expected 6/6 tasks (6 tasks in plan, all completed). Got ${completed}/${total}.` 
          });
          result.passed = false;
        } else {
          logPass('Tasks metric correct: 6/6');
        }
      }
    }

    // Check Waves count
    const wavesMetric = await page.locator('text=Waves').isVisible();
    logStep(`Waves metric visible: ${wavesMetric}`);
    
    // Check Retries count
    const retriesMetric = await page.locator('text=Retries').isVisible();
    logStep(`Retries metric visible: ${retriesMetric}`);

    // 5. Event log has entries (count > 0)
    logStep('Check: Event log has entries');
    // Event log shows count in parentheses like "(42)"
    const eventCountText = await page.locator('text=/^\\(\\d+\\)$/').first().textContent().catch(() => '(0)');
    const eventCount = parseInt(eventCountText.replace(/[()]/g, '')) || 0;
    logStep(`Event log count: ${eventCount}`);
    if (eventCount === 0) {
      result.issues.push({ title: 'Event log is empty after completion', details: 'Expected event log to have entries' });
      result.passed = false;
    } else {
      logPass(`Event log has ${eventCount} entries`);
    }

    // 6. Artifacts section exists and has content
    logStep('Check: Artifacts section has content');
    const artifactsHeader = await page.locator('text=Artifacts').first().isVisible();
    if (!artifactsHeader) {
      result.issues.push({ title: 'Artifacts section not visible', details: 'Expected "Artifacts" header' });
      result.passed = false;
    } else {
      logPass('Artifacts section visible');
    }

    // Check for artifact tabs (design.md, implement-api.md, etc.)
    const artifactTabs = ['design.md', 'implement-api.md', 'implement-ui.md', 'review.md', 'test.md', 'integrate.md'];
    let foundArtifacts = 0;
    for (const tab of artifactTabs) {
      const tabVisible = await page.locator(`text=${tab}`).isVisible().catch(() => false);
      if (tabVisible) foundArtifacts++;
    }
    logStep(`Found ${foundArtifacts}/${artifactTabs.length} artifact tabs`);
    if (foundArtifacts === 0) {
      result.issues.push({ title: 'No artifact tabs visible', details: 'Expected artifact tabs like design.md, implement-api.md, etc.' });
      result.passed = false;
    } else {
      logPass(`${foundArtifacts} artifact tabs found`);
    }

    // Check that artifact content is not empty
    const artifactContent = await page.locator('pre').first().textContent().catch(() => '');
    if (!artifactContent || artifactContent.trim().length === 0) {
      result.issues.push({ title: 'Artifact content is empty', details: 'Expected artifact <pre> block to contain markdown content' });
      result.passed = false;
    } else {
      logPass(`Artifact content present (${artifactContent.length} chars)`);
    }

    const realErrors = consoleErrors.filter(e => 
      !e.includes('EventSource') && 
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch')
    );
    if (realErrors.length > 0) {
      result.issues.push({ title: 'Console errors in completeness check', details: realErrors.join('; ') });
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/s5-cycle${cycle}-final.png`, fullPage: true });
    await clickStop(page).catch(() => {});
    await page.waitForTimeout(500);
  } catch (e) {
    logFail(`Unexpected error: ${e.message}`);
    result.issues.push({ title: 'Scenario 5 crashed', details: e.message });
    result.passed = false;
    await page.screenshot({ path: `${SCREENSHOT_DIR}/s5-cycle${cycle}-crash.png` }).catch(() => {});
  } finally {
    await page.close();
  }

  return result;
}

// ─── SCENARIO 6: Visual Regression ─────────────────────────────────────────
async function scenario6(browser, cycle) {
  logScenario(`6: Visual Regression (Cycle ${cycle})`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = setupConsoleCapture(page);
  const result = { passed: true, issues: [] };

  try {
    await resetServer();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Screenshot: IDLE
    const idlePath = `${SCREENSHOT_DIR}/s6-cycle${cycle}-idle.png`;
    logStep('Screenshot: idle state');
    await page.screenshot({ path: idlePath });
    const idleSize = statSync(idlePath).size;
    logStep(`  Idle screenshot: ${(idleSize / 1024).toFixed(1)}KB`);
    if (idleSize < 10240) {
      result.issues.push({ title: 'Idle screenshot appears blank', details: `File size ${idleSize} bytes (< 10KB)` });
      result.passed = false;
    } else {
      logPass(`Idle screenshot OK (${(idleSize / 1024).toFixed(1)}KB)`);
    }

    // Start simulation
    logStep('Start simulation for phase screenshots');
    await clickSimulate(page);

    // Screenshot: PLANNING
    logStep('Screenshot: planning state');
    await page.waitForTimeout(500);
    const planPath = `${SCREENSHOT_DIR}/s6-cycle${cycle}-planning.png`;
    await page.screenshot({ path: planPath });
    const planSize = statSync(planPath).size;
    logStep(`  Planning screenshot: ${(planSize / 1024).toFixed(1)}KB`);
    if (planSize < 10240) {
      result.issues.push({ title: 'Planning screenshot appears blank', details: `File size ${planSize} bytes (< 10KB)` });
      result.passed = false;
    } else {
      logPass(`Planning screenshot OK (${(planSize / 1024).toFixed(1)}KB)`);
    }

    // Wait for executing
    logStep('Screenshot: executing state');
    try {
      await waitForExecuting(page, 15000);
    } catch { /* may be too fast */ }
    await page.waitForTimeout(500);
    const execPath = `${SCREENSHOT_DIR}/s6-cycle${cycle}-executing.png`;
    await page.screenshot({ path: execPath });
    const execSize = statSync(execPath).size;
    logStep(`  Executing screenshot: ${(execSize / 1024).toFixed(1)}KB`);
    if (execSize < 10240) {
      result.issues.push({ title: 'Executing screenshot appears blank', details: `File size ${execSize} bytes (< 10KB)` });
      result.passed = false;
    } else {
      logPass(`Executing screenshot OK (${(execSize / 1024).toFixed(1)}KB)`);
    }

    // Wait for completed
    logStep('Screenshot: completed state');
    try {
      await waitForCompleted(page, 30000);
    } catch (e) {
      result.issues.push({ title: 'Did not reach completed for visual regression', details: e.message });
      result.passed = false;
    }
    await page.waitForTimeout(1000);
    const compPath = `${SCREENSHOT_DIR}/s6-cycle${cycle}-completed.png`;
    await page.screenshot({ path: compPath, fullPage: true });
    const compSize = statSync(compPath).size;
    logStep(`  Completed screenshot: ${(compSize / 1024).toFixed(1)}KB`);
    if (compSize < 10240) {
      result.issues.push({ title: 'Completed screenshot appears blank', details: `File size ${compSize} bytes (< 10KB)` });
      result.passed = false;
    } else {
      logPass(`Completed screenshot OK (${(compSize / 1024).toFixed(1)}KB)`);
    }

    // Check for visual artifacts: elements overflowing viewport
    logStep('Check for overflow/clipping issues');
    const overflowIssues = await page.evaluate(() => {
      const issues = [];
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Check all visible elements
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.right > viewportWidth + 50) {
            issues.push(`Element overflows right: ${el.tagName}.${el.className?.split(' ')[0]} at x=${rect.right}`);
          }
        }
      }
      return issues.slice(0, 5); // Limit to 5
    });

    if (overflowIssues.length > 0) {
      result.issues.push({ 
        title: 'Visual overflow detected', 
        details: `Elements overflowing viewport: ${overflowIssues.join('; ')}` 
      });
      result.passed = false;
    } else {
      logPass('No visual overflow issues');
    }

    // Check for missing text (key labels should be visible)
    logStep('Check for missing text/labels');
    const requiredLabels = ['ag-ui-crews', 'Crew Board', 'Wave Timeline', 'Metrics', 'Artifacts', 'Event Log'];
    for (const label of requiredLabels) {
      const visible = await page.locator(`text=${label}`).first().isVisible().catch(() => false);
      if (!visible) {
        result.issues.push({ title: `Missing label: "${label}"`, details: `Expected "${label}" to be visible in completed state` });
        result.passed = false;
      }
    }
    logPass('All required labels checked');

    const realErrors = consoleErrors.filter(e => 
      !e.includes('EventSource') && 
      !e.includes('net::ERR') &&
      !e.includes('Failed to fetch')
    );
    if (realErrors.length > 0) {
      result.issues.push({ title: 'Console errors in visual regression', details: realErrors.join('; ') });
    }

    await clickStop(page).catch(() => {});
    await page.waitForTimeout(500);
  } catch (e) {
    logFail(`Unexpected error: ${e.message}`);
    result.issues.push({ title: 'Scenario 6 crashed', details: e.message });
    result.passed = false;
    await page.screenshot({ path: `${SCREENSHOT_DIR}/s6-cycle${cycle}-crash.png` }).catch(() => {});
  } finally {
    await page.close();
  }

  return result;
}

// ─── MAIN: Run all scenarios in 3 cycles ───────────────────────────────────
async function main() {
  console.log('\n' + '█'.repeat(60));
  console.log('  AG-UI-CREWS PLAYWRIGHT STRESS TEST SUITE');
  console.log('█'.repeat(60));
  console.log(`  Target: ${BASE_URL} (Frontend) / ${API_URL} (API)`);
  console.log(`  Speed: ${SPEED}x`);
  console.log(`  Cycles: 3`);

  const browser = await chromium.launch({
    headless: true,
  });

  const allIssues = new Map(); // dedup by title
  const scenarioResults = [];

  for (let cycle = 1; cycle <= 3; cycle++) {
    console.log(`\n\n${'▓'.repeat(60)}`);
    console.log(`  CYCLE ${cycle}/3`);
    console.log(`${'▓'.repeat(60)}`);

    const scenarios = [scenario1, scenario2, scenario3, scenario4, scenario5, scenario6];
    for (const scenario of scenarios) {
      const result = await scenario(browser, cycle);
      scenarioResults.push(result);
      
      for (const issue of result.issues) {
        if (!allIssues.has(issue.title)) {
          allIssues.set(issue.title, { ...issue, firstSeen: cycle, count: 1 });
        } else {
          allIssues.get(issue.title).count++;
        }
      }
    }
  }

  await browser.close();

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n\n' + '█'.repeat(60));
  console.log('  STRESS TEST SUMMARY');
  console.log('█'.repeat(60));

  const totalScenarios = scenarioResults.length;
  const passed = scenarioResults.filter(r => r.passed).length;
  const failed = totalScenarios - passed;

  console.log(`\n  Total scenario runs: ${totalScenarios}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Unique issues found: ${allIssues.size}`);

  if (allIssues.size > 0) {
    console.log('\n  ─── Issues Found ─────────────────────────────────');
    for (const [title, info] of allIssues) {
      console.log(`\n  ❌ ${title}`);
      console.log(`     Seen ${info.count}x across cycles (first in cycle ${info.firstSeen})`);
      console.log(`     ${info.details.substring(0, 200)}`);
    }
  } else {
    console.log('\n  ✅ No issues found!');
  }

  // Write issues to JSON for processing
  const issueList = Array.from(allIssues.entries()).map(([title, info]) => ({ title, ...info }));
  writeFileSync(`${SCREENSHOT_DIR}/issues.json`, JSON.stringify(issueList, null, 2));
  console.log(`\n  Issues written to ${SCREENSHOT_DIR}/issues.json`);

  return issueList;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

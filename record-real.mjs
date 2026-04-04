import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: './real-demo', size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

console.log('🎬 Recording REAL agent demo...');

// Navigate to the already-connected dashboard
await page.goto(BASE);
await page.waitForTimeout(3000);

// Take screenshots every 15 seconds for 5 minutes (agents take time)
for (let i = 1; i <= 20; i++) {
  await page.screenshot({ path: `real-demo/frame-${String(i).padStart(2,'0')}.png` });
  
  // Check the state via API
  try {
    const resp = await page.evaluate(async () => {
      const r = await fetch('http://localhost:4120/api/state');
      return r.json();
    });
    console.log(`📸 Frame ${i}/20 — Phase: ${resp.phase}, Agents: ${resp.agents?.length ?? 0}, Tasks: ${resp.metrics?.completedTasks ?? 0}/${resp.metrics?.taskCount ?? 0}, Events: ${resp.eventLog?.length ?? 0}`);
    
    // If completed or error, take final screenshot and stop
    if (resp.phase === 'completed' || resp.phase === 'error') {
      console.log(`✅ Reached terminal phase: ${resp.phase}`);
      await page.screenshot({ path: 'real-demo/final.png' });
      break;
    }
  } catch (e) {
    console.log(`📸 Frame ${i}/20 — (could not fetch state)`);
  }
  
  // Scroll down to show event log every other frame
  if (i % 3 === 0) {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `real-demo/frame-${String(i).padStart(2,'0')}-bottom.png` });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
  }
  
  await page.waitForTimeout(15000);
}

console.log('🎬 Recording complete');
await context.close();
await browser.close();

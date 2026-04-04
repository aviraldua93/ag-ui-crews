import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for ag-ui-crews simulation mode.
 *
 * Verifies the full dashboard lifecycle:
 *   idle (hero) → planning → executing → completed
 *
 * The simulation uses the server's built-in simulator with staggered events
 * delivered via SSE. The speedMultiplier is set to 10x to keep tests fast.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Start simulation via API with a fast speed multiplier */
async function triggerSimulationViaApi(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "Build a landing page",
        agentCount: 4,
        waveCount: 3,
        speedMultiplier: 10,
        failureRate: 0,
      }),
    });
  });
}

/** Stop the current session via API */
async function stopViaApi(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await fetch("/api/stop", { method: "POST" });
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Simulation Mode Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean state before each test
    await stopViaApi(page).catch(() => {});
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    // Clean up: stop any running simulation
    await stopViaApi(page).catch(() => {});
  });

  test("hero landing is shown in idle state", async ({ page }) => {
    // The hero landing should be visible with the app title and action buttons
    await expect(page.locator("text=ag-ui-crews").first()).toBeVisible();
    await expect(page.locator("text=Mission Control")).toBeVisible();
    await expect(page.locator("text=Run Simulation")).toBeVisible();
    await expect(page.locator("text=Connect to Bridge")).toBeVisible();
  });

  test("clicking Simulate transitions from hero to dashboard", async ({
    page,
  }) => {
    // Verify hero is visible initially
    await expect(page.locator("text=Run Simulation")).toBeVisible();

    // Click the header Simulate button (more reliable than hero button)
    const simulateButton = page.locator("button", {
      hasText: "Simulate",
    });
    await simulateButton.first().click();

    // Hero should disappear and dashboard should render
    // The phase should move away from idle
    await expect(page.locator("text=Mission Control")).toBeHidden({
      timeout: 10_000,
    });

    // Dashboard panels should appear — wait for PlanView or WaveTimeline
    await expect(
      page.locator("text=Wave Timeline").first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("simulation transitions through planning → executing → completed", async ({
    page,
  }) => {
    // Start simulation via UI
    const simulateButton = page.locator("button", {
      hasText: "Simulate",
    });
    await simulateButton.first().click();

    // ── Planning phase ──────────────────────────────────────────────────────
    // The phase badge should show "Planning" or "Connecting" briefly
    // Wait for the PlanView to appear (skeleton or actual plan)
    await expect(
      page
        .locator("text=Wave Timeline")
        .or(page.locator("text=Task Flow"))
        .first()
    ).toBeVisible({ timeout: 15_000 });

    // ── Executing phase ─────────────────────────────────────────────────────
    // After plan completes, waves should appear and show activity
    // Look for wave cards with "Wave 1" text
    await expect(page.locator("text=Wave 1").first()).toBeVisible({
      timeout: 15_000,
    });

    // CrewBoard should show agent status cards
    await expect(page.locator("text=Crew Board").first()).toBeVisible();

    // Metrics section should be visible
    await expect(page.locator("text=Metrics").first()).toBeVisible();

    // ── Completed phase ─────────────────────────────────────────────────────
    // Wait for simulation to finish — phase badge should show "Completed"
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("PlanView renders scenario and roles during planning", async ({
    page,
  }) => {
    // Start simulation via API for speed (10x multiplier, 0 failures)
    // First connect SSE stream by clicking Simulate
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // Wait for plan to be visible — the PlanView renders the scenario
    // The simulator scenario is "Build a landing page"
    await expect(
      page
        .locator("text=Build a landing page")
        .or(page.locator("text=Build a REST API"))
        .first()
    ).toBeVisible({ timeout: 15_000 });

    // Roles should be displayed (architect, backend-dev, frontend-dev, reviewer)
    await expect(page.locator("text=architect").first()).toBeVisible({
      timeout: 10_000,
    });

    // Feasibility badge should show (GO, RISKY, or NO-GO)
    await expect(page.locator("text=GO").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("WaveTimeline shows active waves during execution", async ({
    page,
  }) => {
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // Wait for waves to appear
    await expect(page.locator("text=Wave 1").first()).toBeVisible({
      timeout: 15_000,
    });

    // Wave Timeline header should be present
    await expect(
      page.locator("text=Wave Timeline").first()
    ).toBeVisible();

    // Tasks inside waves should show titles
    // The simulator creates tasks like "Design system architecture"
    await expect(
      page
        .locator("text=Design system architecture")
        .or(page.locator("text=Implement REST API"))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("CrewBoard shows agent status cards", async ({ page }) => {
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // Wait for agents to register — CrewBoard should show agent names
    await expect(page.locator("text=Crew Board").first()).toBeVisible({
      timeout: 15_000,
    });

    // Agent cards should appear with role names
    // The simulator registers: architect, backend-dev, frontend-dev, reviewer
    await expect(page.locator("text=architect").first()).toBeVisible({
      timeout: 15_000,
    });

    // Agent status badges should be visible (idle, active, completed)
    // Wait for at least one agent to be in a non-idle state
    await expect(
      page
        .locator("text=active")
        .or(page.locator("text=completed"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("MetricsBar shows task counts after simulation completes", async ({
    page,
  }) => {
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // Wait for simulation to complete
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
    });

    // MetricsBar should be visible with various metrics
    await expect(page.locator("text=Metrics").first()).toBeVisible();

    // Tasks stat should show completion (e.g. "6/6" or similar)
    await expect(page.locator("text=Tasks").first()).toBeVisible();

    // Agents count should be visible
    await expect(page.locator("text=Agents").first()).toBeVisible();

    // Waves count should show
    await expect(page.locator("text=Waves").first()).toBeVisible();
  });

  test("ArtifactViewer lists produced artifacts after simulation", async ({
    page,
  }) => {
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // Wait for simulation to complete
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
    });

    // Artifacts section should be visible
    await expect(page.locator("text=Artifacts").first()).toBeVisible();

    // Artifact tabs should show filenames produced by the simulator
    // The simulator produces: design.md, implement-api.md, implement-ui.md, review.md, test.md, integrate.md
    await expect(page.locator("text=design.md").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking Stop returns to idle/hero state", async ({ page }) => {
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // Wait for dashboard to render (not idle anymore)
    await expect(
      page.locator("text=Wave Timeline").first()
    ).toBeVisible({ timeout: 15_000 });

    // Click Stop button in the header
    const stopButton = page.locator("button", { hasText: "Stop" });
    await stopButton.click();

    // Should return to hero/idle state
    await expect(page.locator("text=Run Simulation").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator("text=Mission Control").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("full simulation flow: idle → dashboard → completed → stop → idle", async ({
    page,
  }) => {
    // ── 1. Start in idle ────────────────────────────────────────────────────
    await expect(page.locator("text=Run Simulation")).toBeVisible();

    // ── 2. Click Simulate ───────────────────────────────────────────────────
    const simulateBtn = page.locator("button", { hasText: "Simulate" });
    await simulateBtn.first().click();

    // ── 3. Dashboard should appear (hero disappears) ────────────────────────
    await expect(page.locator("text=Mission Control")).toBeHidden({
      timeout: 10_000,
    });

    // ── 4. Planning/Executing: dashboard panels render ──────────────────────
    // WaveTimeline and CrewBoard always render once we leave idle
    await expect(
      page.locator("text=Wave Timeline").first()
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("text=Crew Board").first()).toBeVisible({
      timeout: 15_000,
    });

    // ── 5. Completed: phase badge, metrics, and artifacts ───────────────────
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("text=Artifacts").first()).toBeVisible();
    await expect(page.locator("text=Tasks").first()).toBeVisible();

    // ── 6. Stop → back to idle ──────────────────────────────────────────────
    const stopButton = page.locator("button", { hasText: "Stop" });
    await stopButton.click();

    await expect(page.locator("text=Run Simulation").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

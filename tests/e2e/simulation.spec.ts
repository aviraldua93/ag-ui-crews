import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for ag-ui-crews simulation mode.
 *
 * Verifies the full dashboard lifecycle:
 *   idle (hero) → planning → executing → completed
 *
 * The simulation uses the server's built-in simulator with staggered events
 * delivered via SSE. A fetch override injects speedMultiplier=10 to keep tests fast.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Inject a fetch override so the "Try a demo" click uses a 10× speed simulation.
 * Must be called BEFORE clicking the button.
 */
async function injectFastSimConfig(page: Page): Promise<void> {
  await page.evaluate(() => {
    const orig = window.fetch.bind(window);
    window.fetch = async (input: any, init?: any) => {
      if (typeof input === "string" && input.includes("/api/simulate")) {
        return orig(input, {
          ...init,
          body: JSON.stringify({
            scenario: "Build a landing page",
            agentCount: 4,
            waveCount: 3,
            speedMultiplier: 10,
            failureRate: 0,
          }),
        });
      }
      return orig(input, init);
    };
  });
}

/** Click "Try a demo" (with fast-sim override) and wait for the dashboard to render */
async function startFastSim(page: Page): Promise<void> {
  await injectFastSimConfig(page);
  const btn = page.locator("button", { hasText: /try a demo/i });
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Simulation Mode Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so page.evaluate has a proper context
    await page.goto("/");
    // Ensure clean state before each test
    await page.evaluate(async () => {
      localStorage.removeItem("ag-ui-crews:bridgeUrl");
      await fetch("/api/stop", { method: "POST" }).catch(() => {});
    });
    await page.waitForTimeout(300);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    // Clean up: stop any running simulation
    await page.evaluate(async () => {
      localStorage.removeItem("ag-ui-crews:bridgeUrl");
      await fetch("/api/stop", { method: "POST" }).catch(() => {});
    }).catch(() => {});
  });

  test("hero landing is shown in idle state", async ({ page }) => {
    // The hero landing should be visible with the app title and "Try a demo" button
    await expect(page.locator("text=ag-ui-crews").first()).toBeVisible();
    await expect(
      page.locator("button", { hasText: /try a demo/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Try a demo transitions from hero to dashboard", async ({
    page,
  }) => {
    await startFastSim(page);

    // Dashboard panels should appear — wait for Timeline section
    await expect(
      page.locator("text=Timeline").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("simulation transitions through planning → executing → completed", async ({
    page,
  }) => {
    await startFastSim(page);

    // ── Planning/Executing phase ────────────────────────────────────────────
    await expect(
      page.locator("text=Timeline").first(),
    ).toBeVisible({ timeout: 15_000 });

    // After plan completes, waves should appear
    await expect(page.locator("text=Wave 1").first()).toBeVisible({
      timeout: 15_000,
    });

    // Agents section should show agent status cards
    await expect(page.locator("text=Agents").first()).toBeVisible();

    // Task metrics should be visible (e.g. "0/6 Tasks")
    await expect(page.locator("text=Tasks").first()).toBeVisible();

    // ── Completed phase ─────────────────────────────────────────────────────
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("PlanView renders scenario and roles during planning", async ({
    page,
  }) => {
    await startFastSim(page);

    // Wait for plan to be visible — the PlanView renders the scenario
    await expect(
      page
        .locator("text=Build a landing page")
        .or(page.locator("text=Build a REST API"))
        .first(),
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
    await startFastSim(page);

    // Wait for waves to appear
    await expect(page.locator("text=Wave 1").first()).toBeVisible({
      timeout: 15_000,
    });

    // Timeline header should be present
    await expect(
      page.locator("text=Timeline").first(),
    ).toBeVisible();

    // Tasks inside waves should show titles
    await expect(
      page
        .locator("text=Design system architecture")
        .or(page.locator("text=Implement REST API"))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("CrewBoard shows agent status cards", async ({ page }) => {
    await startFastSim(page);

    // Wait for agents to register — Agents section should show names
    await expect(page.locator("text=Agents").first()).toBeVisible({
      timeout: 15_000,
    });

    // Agent cards should appear with role names
    await expect(page.locator("text=architect").first()).toBeVisible({
      timeout: 15_000,
    });

    // Agent status badges should be visible
    await expect(
      page
        .locator("text=active")
        .or(page.locator("text=completed"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("MetricsBar shows task counts after simulation completes", async ({
    page,
  }) => {
    await startFastSim(page);

    // Wait for simulation to complete
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });

    // MetricsBar pills should show task, agent, and wave counts
    await expect(page.locator("text=Tasks").first()).toBeVisible();
    await expect(page.locator("text=Agents").first()).toBeVisible();
    await expect(page.locator("text=Waves").first()).toBeVisible();
  });

  test("ArtifactViewer lists produced artifacts after simulation", async ({
    page,
  }) => {
    await startFastSim(page);

    // Wait for simulation to complete
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });

    // Artifacts section should be visible
    await expect(page.locator("text=Artifacts").first()).toBeVisible();

    // Artifact tabs should show filenames
    await expect(page.locator("text=design.md").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking Disconnect returns to idle/hero state", async ({ page }) => {
    await startFastSim(page);

    // Wait for dashboard to render
    await expect(
      page.locator("text=Timeline").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Click the Disconnect button (X icon) in the header
    const disconnectBtn = page.locator('button[title="Disconnect"]');
    await expect(disconnectBtn).toBeVisible();
    await disconnectBtn.click();

    // Should return to hero/idle state
    await expect(
      page.locator("button", { hasText: /try a demo/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("full simulation flow: idle → dashboard → completed → stop → idle", async ({
    page,
  }) => {
    // ── 1. Start in idle ────────────────────────────────────────────────────
    await expect(
      page.locator("button", { hasText: /try a demo/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ── 2. Click Try a demo ─────────────────────────────────────────────────
    await startFastSim(page);

    // ── 3. Dashboard panels render ──────────────────────────────────────────
    await expect(
      page.locator("text=Timeline").first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("text=Agents").first()).toBeVisible({
      timeout: 15_000,
    });

    // ── 4. Completed: phase badge, metrics, and artifacts ───────────────────
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("text=Artifacts").first()).toBeVisible();
    await expect(page.locator("text=Tasks").first()).toBeVisible();

    // ── 5. Disconnect → back to idle ────────────────────────────────────────
    const disconnectBtn = page.locator('button[title="Disconnect"]');
    await disconnectBtn.click();

    await expect(
      page.locator("button", { hasText: /try a demo/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

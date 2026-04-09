import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for the Event Log filter bar.
 *
 * Verifies that the search input and category filter chips work correctly
 * during a live simulation — filtering visible event log entries in real time.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Inject a fetch override so the "Try a demo" click uses a 10× speed simulation.
 * Must be called BEFORE clicking the button.
 */
async function injectFastSimConfig(page: Page): Promise<void> {
  await page.evaluate(() => {
    const orig = window.fetch.bind(window);
    (window as any).__origFetch = orig;
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

/** Click "Try a demo" and wait for the dashboard + filter bar to render */
async function startFastSimulation(page: Page): Promise<void> {
  await injectFastSimConfig(page);

  const demoBtn = page.locator("button", { hasText: /try a demo/i });
  await expect(demoBtn).toBeVisible({ timeout: 10_000 });
  await demoBtn.click();

  // Wait for the search input to appear (confirms dashboard + filter bar rendered)
  await expect(page.getByTestId("event-search-input")).toBeVisible({
    timeout: 15_000,
  });
}

/** Read the event count from the Console badge */
async function getEventCount(page: Page): Promise<number> {
  const text = await page.getByTestId("event-log-count").textContent();
  return parseInt(text ?? "0", 10);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Event Log Filter Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.removeItem("ag-ui-crews:bridgeUrl");
      await fetch("/api/stop", { method: "POST" }).catch(() => {});
    });
    await page.waitForTimeout(500);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(async () => {
      localStorage.removeItem("ag-ui-crews:bridgeUrl");
      await fetch("/api/stop", { method: "POST" }).catch(() => {});
    }).catch(() => {});
  });

  test("search input is visible during simulation", async ({ page }) => {
    await startFastSimulation(page);

    const searchInput = page.getByTestId("event-search-input");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", /search events/i);
  });

  test("typing a search query reduces visible event count", async ({
    page,
  }) => {
    await startFastSimulation(page);

    // Wait for simulation to complete so event set is stable
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    // Record baseline count
    const baseCount = await getEventCount(page);
    expect(baseCount).toBeGreaterThan(0);

    // Type a search query that matches only some events
    const searchInput = page.getByTestId("event-search-input");
    await searchInput.fill("Wave");
    await page.waitForTimeout(300); // debounce

    const searchCount = await getEventCount(page);
    expect(searchCount).toBeLessThan(baseCount);
    expect(searchCount).toBeGreaterThan(0);
  });

  test("clicking a category chip filters events to that category", async ({
    page,
  }) => {
    await startFastSimulation(page);

    // Wait for simulation to complete
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    // Record baseline count
    const baseCount = await getEventCount(page);
    expect(baseCount).toBeGreaterThan(0);

    // Click the TASK filter chip
    const taskChip = page.getByTestId("event-filter-chip-TASK");
    await expect(taskChip).toBeVisible();
    await taskChip.click();
    await expect(taskChip).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(100);

    const chipCount = await getEventCount(page);
    expect(chipCount).toBeLessThan(baseCount);
    expect(chipCount).toBeGreaterThan(0);
  });

  test("clearing filters restores all events", async ({ page }) => {
    await startFastSimulation(page);

    // Wait for simulation to complete
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    // Record baseline count
    const baseCount = await getEventCount(page);
    expect(baseCount).toBeGreaterThan(0);

    // Apply a category filter
    const taskChip = page.getByTestId("event-filter-chip-TASK");
    await taskChip.click();
    await page.waitForTimeout(100);

    // Verify count decreased
    const filteredCount = await getEventCount(page);
    expect(filteredCount).toBeLessThan(baseCount);

    // Click the "Clear" button
    const clearBtn = page.getByTestId("event-filter-clear");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(100);

    // Count should be restored
    const restoredCount = await getEventCount(page);
    expect(restoredCount).toBeGreaterThanOrEqual(baseCount);
  });
});

import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for the Event Log filter bar.
 *
 * Verifies that the search input and category filter chips work correctly
 * during a live simulation — filtering visible event log entries in real time.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Start simulation and wait until the Console with filter bar is visible */
async function startSimulationAndWaitForEvents(page: Page): Promise<void> {
  // The redesigned HeroLanding shows "Try a demo" for simulation
  const demoBtn = page.locator("button", { hasText: /try a demo/i });
  await expect(demoBtn).toBeVisible({ timeout: 15_000 });
  await demoBtn.click();

  // Wait for the search input to appear (means filter bar rendered)
  await expect(page.getByTestId("event-search-input")).toBeVisible({
    timeout: 15_000,
  });

  // Wait for some events to accumulate
  await page.waitForTimeout(2000);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Event Log Filter Bar", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so page.evaluate works
    await page.goto("/");
    // Clear stored bridge URL to prevent auto-reconnect & stop any session
    await page.evaluate(async () => {
      localStorage.removeItem("ag-ui-crews:bridgeUrl");
      await fetch("/api/stop", { method: "POST" }).catch(() => {});
    });
    // Reload to get back to clean idle state
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
    await startSimulationAndWaitForEvents(page);

    const searchInput = page.getByTestId("event-search-input");
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute("placeholder", /search events/i);
  });

  test("typing a search query reduces visible event count", async ({ page }) => {
    await startSimulationAndWaitForEvents(page);

    // Wait for the simulation to complete so we have a stable event set
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 45_000,
    });

    // Count initial events shown in the Console header badge
    const consoleBadge = page.locator("h2:has-text('Console') + span");
    const initialCountText = await consoleBadge.textContent();
    const initialCount = parseInt(initialCountText ?? "0", 10);
    expect(initialCount).toBeGreaterThan(0);

    // Type a very specific query that matches fewer events
    const searchInput = page.getByTestId("event-search-input");
    await searchInput.fill("architect");

    // Wait for debounce (150ms) + render
    await page.waitForTimeout(300);

    // The filtered count should be less than the initial count
    const filteredCountText = await consoleBadge.textContent();
    const filteredCount = parseInt(filteredCountText ?? "0", 10);
    expect(filteredCount).toBeLessThan(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test("clicking a category chip filters events to that category", async ({
    page,
  }) => {
    await startSimulationAndWaitForEvents(page);

    // Wait for simulation to complete for stable results
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 45_000,
    });

    // Get initial count
    const consoleBadge = page.locator("h2:has-text('Console') + span");
    const initialCountText = await consoleBadge.textContent();
    const initialCount = parseInt(initialCountText ?? "0", 10);
    expect(initialCount).toBeGreaterThan(0);

    // Click the TASK filter chip
    const taskChip = page.getByTestId("event-filter-chip-TASK");
    await expect(taskChip).toBeVisible();
    await taskChip.click();

    // The chip should now be active (aria-checked=true)
    await expect(taskChip).toHaveAttribute("aria-checked", "true");

    // Wait a moment for re-render
    await page.waitForTimeout(100);

    // Filtered count should be less than initial (only TASK events shown)
    const filteredCountText = await consoleBadge.textContent();
    const filteredCount = parseInt(filteredCountText ?? "0", 10);
    expect(filteredCount).toBeLessThan(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test("clearing filters restores all events", async ({ page }) => {
    await startSimulationAndWaitForEvents(page);

    // Wait for simulation to complete
    await expect(page.locator("text=Complete").first()).toBeVisible({
      timeout: 45_000,
    });

    // Let final SSE events settle before recording count
    await page.waitForTimeout(500);

    // Record original count
    const consoleBadge = page.locator("h2:has-text('Console') + span");
    const originalCountText = await consoleBadge.textContent();
    const originalCount = parseInt(originalCountText ?? "0", 10);
    expect(originalCount).toBeGreaterThan(0);

    // Apply a category filter
    const taskChip = page.getByTestId("event-filter-chip-TASK");
    await taskChip.click();
    await page.waitForTimeout(100);

    // Verify count decreased
    const filteredCountText = await consoleBadge.textContent();
    const filteredCount = parseInt(filteredCountText ?? "0", 10);
    expect(filteredCount).toBeLessThan(originalCount);

    // Click the "Clear" button to remove all filters
    const clearBtn = page.getByTestId("event-filter-clear");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await page.waitForTimeout(100);

    // Count should be restored to original (>= handles any final events in pipeline)
    const restoredCountText = await consoleBadge.textContent();
    const restoredCount = parseInt(restoredCountText ?? "0", 10);
    expect(restoredCount).toBeGreaterThanOrEqual(originalCount);
  });
});

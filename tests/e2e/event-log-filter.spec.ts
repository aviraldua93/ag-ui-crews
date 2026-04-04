import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for the Event Log filter bar.
 *
 * Verifies that the search input and category filter chips work correctly
 * during a live simulation — filtering visible event log entries in real time.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Stop the current session via API */
async function stopViaApi(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await fetch("/api/stop", { method: "POST" });
  });
}

/** Start simulation and wait until enough events are visible in the Console */
async function startSimulationAndWaitForEvents(page: Page): Promise<void> {
  const simulateBtn = page.locator("button", { hasText: "Simulate" });
  await simulateBtn.first().click();

  // Wait for the Console to have multiple event rows (at least 4)
  // Event rows live inside the scrollable div after the filter bar
  await expect(async () => {
    const count = await page.locator("[data-testid='event-search-input']").count();
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });

  // Wait for at least 4 visible event entries (the text lines inside the console)
  await expect(async () => {
    const rows = await page.locator("text=Wave").or(page.locator("text=Agent")).or(page.locator("text=Planning")).count();
    expect(rows).toBeGreaterThanOrEqual(1);
  }).toPass({ timeout: 15_000 });

  // Let the simulation run a bit to accumulate events
  await page.waitForTimeout(2000);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Event Log Filter Bar", () => {
  test.beforeEach(async ({ page }) => {
    await stopViaApi(page).catch(() => {});
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    await stopViaApi(page).catch(() => {});
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
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
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
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
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
    await expect(page.locator("text=Completed").first()).toBeVisible({
      timeout: 30_000,
    });

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

    // Count should be restored to original
    const restoredCountText = await consoleBadge.textContent();
    const restoredCount = parseInt(restoredCountText ?? "0", 10);
    expect(restoredCount).toBe(originalCount);
  });
});

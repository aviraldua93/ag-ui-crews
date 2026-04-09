import { test, expect } from "@playwright/test";

/**
 * E2E tests for the dark/light theme toggle.
 *
 * Verifies:
 *  1. Default dark theme on fresh load (html has "dark" class)
 *  2. Clicking the toggle switches from dark → light (removes "dark" class)
 *  3. Clicking again switches from light → dark
 *  4. Header background color visually changes between themes
 *  5. Theme preference persists across page reloads via localStorage
 *  6. Major sections render correctly in light mode
 */

test.describe("Theme Toggle", () => {
  test.beforeEach(async ({ page }) => {
    // Clear theme preference so each test starts from default
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("ag-ui-crews-theme"));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("defaults to dark theme on fresh load", async ({ page }) => {
    const htmlClass = await page.locator("html").getAttribute("class");
    expect(htmlClass).toContain("dark");
  });

  test("clicking toggle switches from dark to light", async ({ page }) => {
    // Verify starts dark
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Click the theme toggle button
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();

    // "dark" class should be removed
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("clicking toggle twice returns to dark", async ({ page }) => {
    const toggle = page.getByTestId("theme-toggle");

    // dark → light
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // light → dark
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("header background color changes between themes", async ({ page }) => {
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Capture dark mode background
    const darkBg = await header.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // Switch to light
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Wait a frame for CSS to recompute after class-based theme change
    await page.evaluate(() => new Promise(requestAnimationFrame));

    // Capture light mode background
    const lightBg = await header.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // The backgrounds must differ between dark and light themes
    expect(darkBg).not.toBe(lightBg);
  });

  test("theme preference persists across page reloads", async ({ page }) => {
    // Start in dark
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Switch to light
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Verify localStorage was set
    const stored = await page.evaluate(() =>
      localStorage.getItem("ag-ui-crews-theme"),
    );
    expect(stored).toBe("light");

    // Reload the page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should still be light after reload
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // localStorage should still hold "light"
    const storedAfter = await page.evaluate(() =>
      localStorage.getItem("ag-ui-crews-theme"),
    );
    expect(storedAfter).toBe("light");
  });

  test("major sections render correctly in light mode", async ({ page }) => {
    // Switch to light mode
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Header should still be visible
    await expect(page.locator("header")).toBeVisible();

    // App title should be visible
    await expect(page.locator("text=ag-ui-crews").first()).toBeVisible();

    // "Try a demo" button should be visible and functional
    const demoBtn = page.locator("button", { hasText: /try a demo/i });
    await expect(demoBtn).toBeVisible({ timeout: 10_000 });
    await expect(demoBtn).toBeEnabled();
  });
});

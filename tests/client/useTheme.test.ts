/**
 * @vitest-environment jsdom
 *
 * Unit tests for the useTheme hook and ThemeProvider.
 *
 * Tests cover:
 *  1. Default dark theme when localStorage is empty
 *  2. Toggle from dark → light
 *  3. Toggle from light → dark (round-trip)
 *  4. localStorage persistence on toggle
 *  5. localStorage read on mount (pre-set to "light")
 *  6. useTheme throws when used outside ThemeProvider
 *  7. setTheme() explicitly sets the theme
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@client/hooks/useTheme";

const STORAGE_KEY = "ag-ui-crews-theme";

// ─── Wrapper ────────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ThemeProvider, null, children);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("useTheme hook", () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear any stored theme and reset classList
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    // Spy on localStorage methods so we can assert calls
    getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  // ── 1. Default dark theme ─────────────────────────────────────────────────
  it("defaults to dark theme when localStorage is empty", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // ── 2. Toggle dark → light ────────────────────────────────────────────────
  it("toggles from dark to light", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // ── 3. Toggle light → dark (round-trip) ───────────────────────────────────
  it("toggles back from light to dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    // dark → light
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // light → dark
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // ── 4. localStorage persistence on toggle ─────────────────────────────────
  it("persists theme to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, "light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, "dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  // ── 5. localStorage read on mount ─────────────────────────────────────────
  it("reads theme from localStorage on mount", () => {
    // Pre-set localStorage to "light" before rendering
    localStorage.setItem(STORAGE_KEY, "light");
    // Reset spy call count after our manual setItem
    setItemSpy.mockClear();
    getItemSpy.mockClear();

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("light");
    expect(getItemSpy).toHaveBeenCalledWith(STORAGE_KEY);
    // "dark" should not be in classList for light theme
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // ── 6. useTheme throws outside ThemeProvider ──────────────────────────────
  it("throws when used outside ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useTheme());
    }).toThrow("useTheme must be used within a ThemeProvider");

    spy.mockRestore();
  });

  // ── 7. setTheme sets explicitly ───────────────────────────────────────────
  it("setTheme explicitly changes the theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });
});

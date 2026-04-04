/**
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

// ─── DOM mocks ──────────────────────────────────────────────────────────────────

// We run in a jsdom-like vitest environment override for this file.
// However since the global vitest config uses "node", we manually mock the
// DOM surface used by useTheme (classList + localStorage).

let classListSet: Set<string>;
let localStorageStore: Record<string, string>;

function createMockClassList(): DOMTokenList {
  return {
    add: vi.fn((cls: string) => classListSet.add(cls)),
    remove: vi.fn((cls: string) => classListSet.delete(cls)),
    contains: (cls: string) => classListSet.has(cls),
    toggle: vi.fn(),
    replace: vi.fn(),
    item: vi.fn(),
    entries: vi.fn(),
    forEach: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    supports: vi.fn(),
    length: 0,
    value: "",
    toString: () => [...classListSet].join(" "),
    [Symbol.iterator]: function* () {
      yield* classListSet;
    },
  } as unknown as DOMTokenList;
}

function setupDomMocks() {
  classListSet = new Set<string>(["dark"]); // default page starts with "dark"

  // Mock document.documentElement
  const mockClassList = createMockClassList();
  Object.defineProperty(globalThis, "document", {
    value: {
      documentElement: {
        classList: mockClassList,
      },
    },
    writable: true,
    configurable: true,
  });

  // Mock localStorage
  localStorageStore = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
      clear: vi.fn(() => {
        localStorageStore = {};
      }),
      key: vi.fn(),
      length: 0,
    },
    writable: true,
    configurable: true,
  });

  // Ensure window is defined (getInitialTheme checks typeof window)
  if (typeof globalThis.window === "undefined") {
    Object.defineProperty(globalThis, "window", {
      value: globalThis,
      writable: true,
      configurable: true,
    });
  }
}

// ─── Wrapper ────────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ThemeProvider, null, children);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("useTheme hook", () => {
  beforeEach(() => {
    setupDomMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Default dark theme ─────────────────────────────────────────────────
  it("defaults to dark theme when localStorage is empty", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    // The classList should have "dark" added
    expect(classListSet.has("dark")).toBe(true);
  });

  // ── 2. Toggle dark → light ────────────────────────────────────────────────
  it("toggles from dark to light", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
    // classList should have "dark" removed
    expect(classListSet.has("dark")).toBe(false);
  });

  // ── 3. Toggle light → dark (round-trip) ───────────────────────────────────
  it("toggles back from light to dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    // dark → light
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");

    // light → dark
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
    expect(classListSet.has("dark")).toBe(true);
  });

  // ── 4. localStorage persistence on toggle ─────────────────────────────────
  it("persists theme to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "ag-ui-crews-theme",
      "light"
    );

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "ag-ui-crews-theme",
      "dark"
    );
  });

  // ── 5. localStorage read on mount ─────────────────────────────────────────
  it("reads theme from localStorage on mount", () => {
    // Pre-set localStorage to "light" before rendering
    localStorageStore["ag-ui-crews-theme"] = "light";

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem).toHaveBeenCalledWith("ag-ui-crews-theme");
    // "dark" should not be in classList for light theme
    expect(classListSet.has("dark")).toBe(false);
  });

  // ── 6. useTheme throws outside ThemeProvider ──────────────────────────────
  it("throws when used outside ThemeProvider", () => {
    // Suppress console.error from React for this expected error
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
    expect(classListSet.has("dark")).toBe(false);

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(classListSet.has("dark")).toBe(true);
  });
});

/**
 * HTTP server entry point for ag-ui-crews.
 *
 * Powered by Bun's built-in HTTP server, this module wires together all
 * server-side subsystems:
 * - **SSE streaming** (`GET /events`) via the shared {@link EventEmitter}.
 * - **Bridge connection** (`POST /api/connect`) via {@link BridgeConnector}.
 * - **Simulation mode** (`POST /api/simulate`) via {@link startSimulation}.
 * - **Bridge discovery** (`GET /api/discover`) via {@link discoverBridges}.
 * - **Static file serving** (production only) for the Vite-built SPA.
 *
 * All responses include permissive CORS headers ({@link CORS_HEADERS}) since
 * the dashboard UI is typically served from a different origin during development.
 *
 * @module server/index
 */
import { EventEmitter } from "./event-emitter";
import { BridgeConnector } from "./bridge-connector";
import { startSimulation } from "./simulator";
import { discoverBridges } from "./discovery";
import { runStarted, runFinished } from "../shared/events";
import type { ConnectRequest, SimulationConfig } from "../shared/types";
import { v4 as uuidv4 } from "uuid";
import { join } from "path";

/**
 * TCP port the server listens on.
 * Defaults to `4120`; overridable via the `PORT` environment variable.
 */
const PORT = Number(process.env.PORT) || 4120;

/**
 * Whether the server is running in production mode.
 * When `true`, static files from the Vite build output (`dist/client/`) are served
 * and SPA fallback is enabled. In development, Vite's dev server handles static assets.
 */
const IS_PROD = process.env.NODE_ENV === "production";

// ─── Global State ──────────────────────────────────────────────────────────────

/** Singleton event emitter shared by all route handlers, the simulator, and the bridge connector. */
const emitter = new EventEmitter();
/** Active bridge connector instance, or `null` when not in live-bridge mode. */
let bridgeConnector: BridgeConnector | null = null;
/** Cleanup function for the current simulation, or `null` when no simulation is running. */
let simulationCleanup: (() => void) | null = null;
/** AG-UI run ID for the current session, used in `RUN_STARTED` / `RUN_FINISHED` events. */
let currentRunId: string | null = null;
/** AG-UI thread ID for the current session, paired with {@link currentRunId}. */
let currentThreadId: string | null = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Permissive CORS headers applied to every response.
 *
 * Allows any origin (`*`), `GET`/`POST`/`OPTIONS` methods, and the
 * `Content-Type` header. Required because the Vite dev server and the
 * API server run on different ports during development.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Creates a JSON {@link Response} with CORS headers.
 *
 * Serialises the given data as JSON and sets `Content-Type: application/json`.
 * Used by all API route handlers for success and structured error responses.
 *
 * @param data   - Any JSON-serialisable value.
 * @param status - HTTP status code (default `200`).
 * @returns A {@link Response} ready to be returned from the fetch handler.
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/**
 * Convenience wrapper around {@link jsonResponse} for error responses.
 *
 * Returns `{ "error": "<message>" }` with the specified HTTP status.
 *
 * @param message - Human-readable error description.
 * @param status  - HTTP status code (default `400`).
 * @returns A JSON error {@link Response}.
 */
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Tears down any active session (bridge connection or simulation).
 *
 * Performs three cleanup steps in order:
 * 1. If a {@link BridgeConnector} is active, calls `stop()` to halt polling
 *    and emit `BRIDGE_DISCONNECTED`.
 * 2. If a simulation cleanup function exists, invokes it to clear all timers.
 * 3. If a run is in progress, broadcasts a `RUN_FINISHED` AG-UI event and
 *    clears the run/thread IDs.
 *
 * Called at the beginning of `handleConnect` / `handleSimulate` (to ensure a
 * clean slate) and by `handleStop` (explicit user action).
 */
function stopSession(): void {
  if (bridgeConnector) {
    bridgeConnector.stop();
    bridgeConnector = null;
  }
  if (simulationCleanup) {
    simulationCleanup();
    simulationCleanup = null;
  }
  if (currentRunId && currentThreadId) {
    emitter.broadcast([runFinished(currentThreadId, currentRunId)]);
  }
  currentRunId = null;
  currentThreadId = null;
}

/**
 * Generates new AG-UI thread and run IDs and broadcasts a `RUN_STARTED` event.
 *
 * Thread and run IDs are UUIDv4 values. The thread ID groups related messages
 * in an AG-UI conversation, while the run ID identifies a single execution
 * (simulation or bridge session). Both are stored in module-level variables
 * so {@link stopSession} can emit the corresponding `RUN_FINISHED`.
 *
 * @returns An object containing the newly generated `threadId` and `runId`.
 */
function startRun(): { threadId: string; runId: string } {
  const threadId = uuidv4();
  const runId = uuidv4();
  currentThreadId = threadId;
  currentRunId = runId;
  emitter.broadcast([runStarted(threadId, runId)]);
  return { threadId, runId };
}

// ─── Route Handlers ────────────────────────────────────────────────────────────

/**
 * **`GET /events`** — Opens an SSE (Server-Sent Events) stream.
 *
 * Creates a `ReadableStream<Uint8Array>` whose controller is registered with
 * the shared {@link EventEmitter}. The client immediately receives a
 * `STATE_SNAPSHOT` event (via `addClient`), followed by a continuous stream
 * of AG-UI events as dashboard state changes.
 *
 * Response headers set `Content-Type: text/event-stream`, disable caching,
 * and include CORS headers. The stream stays open until the client disconnects
 * (triggering the `cancel` callback which calls `removeClient`).
 *
 * @returns A streaming SSE {@link Response}.
 */
function handleSSE(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      emitter.addClient(controller);
    },
    cancel(controller) {
      emitter.removeClient(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
}

/**
 * **`POST /api/connect`** — Connects to a live a2a-crews bridge.
 *
 * Request body (JSON): `{ "bridgeUrl": "http://localhost:<port>" }`
 *
 * Lifecycle:
 * 1. Validates that `bridgeUrl` is present.
 * 2. Stops any existing session via {@link stopSession} and resets emitter state.
 * 3. Creates a new {@link BridgeConnector} and calls `start()` (verifies reachability).
 * 4. Starts a new AG-UI run via {@link startRun}.
 *
 * Success response (200):
 * ```json
 * { "ok": true, "threadId": "...", "runId": "...", "bridgeUrl": "..." }
 * ```
 *
 * Error responses:
 * - `400` if `bridgeUrl` is missing from the request body.
 * - `502` if the bridge is unreachable or returns a non-200 status.
 *
 * @param req - The incoming HTTP request.
 * @returns A JSON {@link Response} indicating success or failure.
 */
async function handleConnect(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as ConnectRequest;
    if (!body.bridgeUrl) {
      return errorResponse("bridgeUrl is required");
    }

    // Stop any existing session first
    stopSession();
    emitter.reset();

    const { threadId, runId } = startRun();

    bridgeConnector = new BridgeConnector(body.bridgeUrl, emitter);
    await bridgeConnector.start();

    return jsonResponse({
      ok: true,
      threadId,
      runId,
      bridgeUrl: body.bridgeUrl,
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Connection failed",
      502
    );
  }
}

/**
 * **`POST /api/simulate`** — Starts a simulation run.
 *
 * Request body (JSON): {@link SimulationConfig}
 * ```json
 * {
 *   "scenario": "Build a REST API with auth and tests",
 *   "speedMultiplier": 1,
 *   "failureRate": 0.15,
 *   "agentCount": 4,
 *   "waveCount": 4
 * }
 * ```
 * All fields are optional; defaults are applied by the simulator.
 *
 * Lifecycle:
 * 1. Stops any existing session and resets emitter state.
 * 2. Starts a new AG-UI run.
 * 3. Calls {@link startSimulation} with the config and emitter, storing the
 *    returned cleanup function for later use by {@link stopSession}.
 *
 * Success response (200):
 * ```json
 * { "ok": true, "threadId": "...", "runId": "...", "mode": "simulation", "scenario": "..." }
 * ```
 *
 * Error response (400): `{ "error": "<message>" }`
 *
 * @param req - The incoming HTTP request.
 * @returns A JSON {@link Response} indicating success or failure.
 */
async function handleSimulate(req: Request): Promise<Response> {
  try {
    const config = (await req.json()) as SimulationConfig;

    // Stop any existing session first
    stopSession();
    emitter.reset();

    const { threadId, runId } = startRun();

    simulationCleanup = startSimulation(
      {
        scenario: config.scenario || "Build a REST API with auth and tests",
        speedMultiplier: config.speedMultiplier ?? 1,
        failureRate: config.failureRate ?? 0.15,
        agentCount: config.agentCount,
        waveCount: config.waveCount,
      },
      emitter
    );

    return jsonResponse({
      ok: true,
      threadId,
      runId,
      mode: "simulation",
      scenario: config.scenario || "Build a REST API with auth and tests",
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Simulation failed"
    );
  }
}

/**
 * **`POST /api/stop`** — Stops the current session (bridge or simulation).
 *
 * Calls {@link stopSession} to tear down any active connection or simulation,
 * then resets the emitter state so the dashboard returns to idle.
 *
 * Always succeeds with: `{ "ok": true, "message": "Session stopped" }`
 *
 * @returns A 200 JSON {@link Response}.
 */
function handleStop(): Response {
  stopSession();
  emitter.reset();
  return jsonResponse({ ok: true, message: "Session stopped" });
}

/**
 * **`GET /api/state`** — Returns the current {@link DashboardState} snapshot.
 *
 * Delegates to `emitter.getState()` which returns a deep clone. Useful for
 * clients that missed SSE events or need to poll state on demand.
 *
 * Response (200): The full {@link DashboardState} object as JSON.
 *
 * @returns A JSON {@link Response} containing the dashboard state.
 */
function handleState(): Response {
  return jsonResponse(emitter.getState());
}

/**
 * **`GET /api/health`** — Health check endpoint.
 *
 * Returns server status information including:
 * - `status` — Always `"ok"` if the server is running.
 * - `uptime` — Process uptime in seconds.
 * - `clients` — Number of currently connected SSE clients.
 * - `bridgeConnected` — Whether a live bridge is actively being polled.
 * - `simulationActive` — Whether a simulation is currently running.
 *
 * Response (200):
 * ```json
 * { "status": "ok", "uptime": 123.4, "clients": 2, "bridgeConnected": false, "simulationActive": true }
 * ```
 *
 * @returns A 200 JSON {@link Response} with health metrics.
 */
function handleHealth(): Response {
  return jsonResponse({
    status: "ok",
    uptime: process.uptime(),
    clients: emitter.clientCount,
    bridgeConnected: bridgeConnector?.isConnected() ?? false,
    simulationActive: simulationCleanup !== null,
  });
}

// ─── Static File Serving (Production) ──────────────────────────────────────────

/**
 * Absolute path to the Vite build output directory for static assets.
 *
 * Resolved relative to `import.meta.dir` (the directory of this source file),
 * navigating up two levels to the project root's `dist/client/` folder.
 * Only used when {@link IS_PROD} is `true`.
 */
const STATIC_DIR = join(import.meta.dir, "../../dist/client");

/**
 * Map of file extensions to MIME types for static file serving.
 *
 * Covers the common asset types produced by a Vite/React build:
 * HTML, JavaScript, CSS, JSON, images (PNG, SVG, ICO), and web fonts
 * (WOFF, WOFF2). Files with unrecognised extensions are served as
 * `application/octet-stream`.
 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Serves static files from the Vite build output directory (production only).
 *
 * Implements SPA (Single-Page Application) fallback routing:
 * 1. Attempts to serve the file at the exact `pathname` from {@link STATIC_DIR}.
 * 2. If the file doesn't exist and the path has no file extension (i.e., it's
 *    a client-side route like `/dashboard`), serves `index.html` instead.
 * 3. If neither succeeds, returns `null` to let the caller fall through to 404.
 *
 * **Production-only guard**: In development (`IS_PROD === false`), immediately
 * returns `null` so Vite's dev server handles all static assets via its proxy.
 *
 * MIME types are resolved from {@link MIME_TYPES} based on the file extension.
 * Unrecognised extensions default to `application/octet-stream`.
 *
 * @param pathname - The URL pathname to resolve (e.g., `/assets/index-abc123.js`
 *                   or `/dashboard`).
 * @returns A {@link Response} serving the file, or `null` if the file doesn't
 *          exist or the server is in development mode.
 */
async function serveStatic(pathname: string): Promise<Response | null> {
  if (!IS_PROD) return null;

  try {
    // Try the exact path first
    let filePath = join(STATIC_DIR, pathname);
    let file = Bun.file(filePath);

    if (await file.exists()) {
      const ext = pathname.substring(pathname.lastIndexOf("."));
      return new Response(file, {
        headers: {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        },
      });
    }

    // For SPA: serve index.html for non-asset routes
    if (!pathname.includes(".")) {
      filePath = join(STATIC_DIR, "index.html");
      file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": "text/html" },
        });
      }
    }
  } catch {
    // Fall through to 404
  }

  return null;
}

// ─── Server ────────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── API Routes ──────────────────────────────────────────────────────────
    if (pathname === "/events" && req.method === "GET") {
      return handleSSE();
    }

    if (pathname === "/api/connect" && req.method === "POST") {
      return handleConnect(req);
    }

    if (pathname === "/api/simulate" && req.method === "POST") {
      return handleSimulate(req);
    }

    if (pathname === "/api/stop" && req.method === "POST") {
      return handleStop();
    }

    if (pathname === "/api/state" && req.method === "GET") {
      return jsonResponse(emitter.getState());
    }

    if (pathname === "/api/health" && req.method === "GET") {
      return handleHealth();
    }

    if (pathname === "/api/discover" && req.method === "GET") {
      const bridges = await discoverBridges();
      return jsonResponse({ bridges });
    }

    // ── Static files (production) ───────────────────────────────────────────
    const staticResponse = await serveStatic(pathname);
    if (staticResponse) return staticResponse;

    // ── 404 ─────────────────────────────────────────────────────────────────
    return errorResponse("Not found", 404);
  },
});

// ─── Startup Banner ────────────────────────────────────────────────────────────

console.log(`
┌─────────────────────────────────────────────┐
│         ag-ui-crews server                  │
├─────────────────────────────────────────────┤
│  Port:   ${String(PORT).padEnd(35)}│
│  Mode:   ${(IS_PROD ? "production" : "development").padEnd(35)}│
│  SSE:    http://localhost:${PORT}/events${" ".repeat(Math.max(0, 14 - String(PORT).length))}│
│  Health: http://localhost:${PORT}/api/health${" ".repeat(Math.max(0, 8 - String(PORT).length))}│
└─────────────────────────────────────────────┘
`);

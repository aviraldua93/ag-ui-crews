/**
 * AG-UI Server for ag-ui-crews
 * Serves AG-UI protocol events via SSE, bridges to a2a-crews, and provides simulation mode.
 */
import { EventEmitter } from "./event-emitter";
import { BridgeConnector } from "./bridge-connector";
import { startSimulation } from "./simulator";
import { discoverBridges } from "./discovery";
import { runStarted, runFinished } from "../shared/events";
import type { ConnectRequest, SimulationConfig } from "../shared/types";
import { v4 as uuidv4 } from "uuid";
import { join } from "path";

const PORT = Number(process.env.PORT) || 4120;
const IS_PROD = process.env.NODE_ENV === "production";

// ─── Global State ──────────────────────────────────────────────────────────────

const emitter = new EventEmitter();
let bridgeConnector: BridgeConnector | null = null;
let simulationCleanup: (() => void) | null = null;
let currentRunId: string | null = null;
let currentThreadId: string | null = null;

// ─── Helpers ───────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/** Stop any active session (bridge or simulation) */
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

/** Start a new run (generates thread/run IDs and broadcasts RUN_STARTED) */
function startRun(): { threadId: string; runId: string } {
  const threadId = uuidv4();
  const runId = uuidv4();
  currentThreadId = threadId;
  currentRunId = runId;
  emitter.broadcast([runStarted(threadId, runId)]);
  return { threadId, runId };
}

// ─── Route Handlers ────────────────────────────────────────────────────────────

/** GET /events — SSE stream */
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

/** POST /api/connect — Connect to a2a-crews bridge */
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

/** POST /api/simulate — Start simulation */
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

/** POST /api/stop — Stop current session */
function handleStop(): Response {
  stopSession();
  emitter.reset();
  return jsonResponse({ ok: true, message: "Session stopped" });
}

/** GET /api/state — Get current dashboard state */
function handleState(): Response {
  return jsonResponse(emitter.getState());
}

/** GET /api/health — Health check */
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

const STATIC_DIR = join(import.meta.dir, "../../dist/client");

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

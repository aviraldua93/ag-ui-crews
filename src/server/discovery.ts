/**
 * Bridge discovery module for ag-ui-crews.
 *
 * Reads `bridge.json` files from `.a2a-crews/` directories to find active
 * a2a-crews bridges — no port scanning required.
 *
 * Search strategy:
 * - Checks the current working directory, its parent, and all sibling directories
 *   of the CWD (covers monorepos and adjacent projects).
 * - For each search root, looks inside `.a2a-crews/<team>/bridge.json` for a `port` field.
 * - Deduplicates by port number, then probes each candidate via `GET /status` to
 *   confirm the bridge is running (expects `{ bridge: "running", ... }`).
 *
 * Used by the `GET /api/discover` route to let the dashboard UI auto-detect
 * bridges without requiring manual URL entry.
 *
 * @see https://github.com/aviraldua93/a2a-crews/issues/19 — central registry proposal
 * @module server/discovery
 */
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";

/**
 * Describes a running a2a-crews bridge discovered on localhost.
 *
 * Populated by parsing the JSON response from a bridge's `/status` endpoint
 * after locating its port via a `bridge.json` file.
 */
export interface DiscoveredBridge {
  /** Fully-qualified HTTP URL of the bridge (e.g. `"http://localhost:62638"`). */
  url: string;
  /** TCP port the bridge is listening on. */
  port: number;
  /** Total number of agents registered with the bridge. */
  agents: number;
  /** Aggregate task counts from the bridge's `/status` response. */
  tasks: { total: number; completed: number; working: number };
  /** Bridge process uptime in seconds, as reported by `/status`. */
  uptime: number;
  /** Team (directory) name from the `.a2a-crews/<team>/bridge.json` path. */
  team: string;
  /** Human-readable scenario description from `crew.json`, or the team name as fallback. */
  scenario: string;
}

/**
 * Discovers all active a2a-crews bridges by reading `bridge.json` files and probing
 * the recorded ports.
 *
 * **Phase 1 — File discovery:** Calls {@link findBridgeJsonFiles} to scan the CWD,
 * parent directory, and sibling directories for `.a2a-crews/<team>/bridge.json` files.
 * Each file yields a `{ port, team }` candidate.
 *
 * **Phase 2 — Probe:** For each candidate port, sends a `GET /status` request with
 * a 1 500 ms timeout. Only ports responding with `{ bridge: "running" }` are included
 * in the results.
 *
 * Returns an empty array if no `bridge.json` files are found or all probes fail.
 *
 * @returns An array of {@link DiscoveredBridge} descriptors for confirmed running bridges.
 */
export async function discoverBridges(): Promise<DiscoveredBridge[]> {
  const candidates = await findBridgeJsonFiles();
  if (candidates.length === 0) return [];

  const results = await Promise.all(
    candidates.map(async ({ port, team, scenario }) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const resp = await fetch(`http://localhost:${port}/status`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!resp.ok) return null;

        const data = (await resp.json()) as Record<string, unknown>;
        if (data.bridge !== "running") return null;

        const agents = data.agents as { total?: number } | undefined;
        const tasks = data.tasks as { total?: number; completed?: number; working?: number } | undefined;

        return {
          url: `http://localhost:${port}`,
          port,
          agents: agents?.total ?? 0,
          tasks: {
            total: tasks?.total ?? 0,
            completed: tasks?.completed ?? 0,
            working: tasks?.working ?? 0,
          },
          uptime: (data.uptime as number) ?? 0,
          team,
          scenario,
        } satisfies DiscoveredBridge;
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is DiscoveredBridge => r !== null);
}

/**
 * Scans the filesystem for `.a2a-crews/<team>/bridge.json` files containing
 * bridge port numbers.
 *
 * Search roots (in order):
 * 1. `process.cwd()` — the current project directory.
 * 2. `dirname(process.cwd())` — the parent directory.
 * 3. All sibling directories of the CWD (children of the parent).
 *
 * Each `bridge.json` is expected to contain `{ "port": <number> }`. Ports are
 * deduplicated — if the same port appears in multiple files (e.g., symlinked
 * projects), only the first occurrence is kept.
 *
 * Filesystem errors (e.g., no `.a2a-crews` directory, permission denied) are
 * silently caught so discovery is best-effort and never throws.
 *
 * @returns An array of `{ port, team, scenario }` candidates, deduplicated by port number.
 */
async function findBridgeJsonFiles(): Promise<Array<{ port: number; team: string; scenario: string }>> {
  const found: Array<{ port: number; team: string; scenario: string }> = [];
  const seen = new Set<number>();

  const cwd = process.cwd();
  const parent = dirname(cwd);

  // Check CWD, parent, and all sibling directories of CWD
  const searchRoots: string[] = [cwd, parent];
  try {
    const siblings = await readdir(parent, { withFileTypes: true });
    for (const s of siblings) {
      if (s.isDirectory() && s.name !== "." && s.name !== "..") {
        searchRoots.push(join(parent, s.name));
      }
    }
  } catch { /* no access to parent */ }

  // Phase 1: Check central bridge registry (~/.a2a-crews/active-bridges/)
  const homedir = process.env.USERPROFILE ?? process.env.HOME ?? "";
  if (homedir) {
    try {
      const registryDir = join(homedir, ".a2a-crews", "active-bridges");
      const files = await readdir(registryDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(registryDir, file), "utf-8");
          const data = JSON.parse(content);
          if (data.port && !seen.has(data.port)) {
            seen.add(data.port);
            found.push({
              port: data.port,
              team: file.replace(".json", ""),
              scenario: data.scenario ?? file.replace(".json", ""),
            });
          }
        } catch { /* invalid entry */ }
      }
    } catch { /* no central registry */ }
  }

  // Phase 2: Check CWD, parent, and all sibling directories
  for (const dir of searchRoots) {
    try {
      const a2aDir = join(dir, ".a2a-crews");
      const entries = await readdir(a2aDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const teamDir = join(a2aDir, entry.name);
          const content = await readFile(join(teamDir, "bridge.json"), "utf-8");
          const data = JSON.parse(content);
          if (data.port && !seen.has(data.port)) {
            seen.add(data.port);
            // Read crew.json for the human-readable scenario
            let scenario = entry.name;
            try {
              const crewContent = await readFile(join(teamDir, "crew.json"), "utf-8");
              const crew = JSON.parse(crewContent);
              if (crew.scenario) scenario = crew.scenario;
            } catch { /* no crew.json */ }
            found.push({ port: data.port, team: entry.name, scenario });
          }
        } catch { /* no bridge.json */ }
      }
    } catch { /* no .a2a-crews dir */ }
  }

  return found;
}

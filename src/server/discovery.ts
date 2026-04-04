/**
 * Bridge discovery — scans localhost high ports to find active a2a-crews bridges.
 * Looks for the /status endpoint that returns { bridge: "running", ... }
 */

export interface DiscoveredBridge {
  url: string;
  port: number;
  agents: number;
  tasks: { total: number; completed: number; working: number };
  uptime: number;
}

const SCAN_START = 49152;
const SCAN_END = 65535;
const SCAN_TIMEOUT_MS = 300;
const BATCH_SIZE = 200;

/** Quick check if a port has an a2a-crews bridge */
async function probePort(port: number): Promise<DiscoveredBridge | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const resp = await fetch(`http://localhost:${port}/status`, {
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    // a2a-crews bridges return { bridge: "running", port, agents: {...}, tasks: {...} }
    if (data.bridge !== "running") return null;

    const agents = data.agents as { total?: number } | undefined;
    const tasks = data.tasks as {
      total?: number;
      completed?: number;
      working?: number;
    } | undefined;

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
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Scan known a2a-crews bridge port files first, then sweep high ports */
export async function discoverBridges(): Promise<DiscoveredBridge[]> {
  const found: DiscoveredBridge[] = [];

  // Phase 1: Check if there are bridge.json files with known ports
  const knownPorts = await findKnownPorts();

  // Probe known ports first (fast)
  const knownResults = await Promise.all(knownPorts.map(probePort));
  for (const r of knownResults) {
    if (r) found.push(r);
  }

  // Phase 2: Sweep common high ports in parallel batches
  // Skip ports we already checked, and also skip our own server (4120)
  const checkedPorts = new Set([...knownPorts, 4120]);
  const portsToScan: number[] = [];

  // Prioritize recently used port ranges (a2a-crews uses 49152-65535)
  for (let p = SCAN_START; p <= SCAN_END; p++) {
    if (!checkedPorts.has(p)) portsToScan.push(p);
  }

  // Scan in batches to avoid overwhelming the system
  for (let i = 0; i < portsToScan.length; i += BATCH_SIZE) {
    const batch = portsToScan.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(probePort));
    for (const r of results) {
      if (r) found.push(r);
    }
    // Stop after finding bridges (most users will have 1-2)
    if (found.length >= 5) break;
  }

  return found;
}

/** Look for bridge.json files in .a2a-crews directories */
async function findKnownPorts(): Promise<number[]> {
  const ports: number[] = [];
  try {
    const { readdir, readFile } = await import("fs/promises");
    const { join } = await import("path");

    // Check current directory and parent for .a2a-crews/*/bridge.json
    const dirs = [process.cwd(), join(process.cwd(), "..")];
    for (const dir of dirs) {
      try {
        const a2aDir = join(dir, ".a2a-crews");
        const entries = await readdir(a2aDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            try {
              const bridgeFile = join(a2aDir, entry.name, "bridge.json");
              const content = await readFile(bridgeFile, "utf-8");
              const data = JSON.parse(content);
              if (data.port) ports.push(data.port);
            } catch {
              // No bridge.json in this team dir
            }
          }
        }
      } catch {
        // No .a2a-crews directory
      }
    }
  } catch {
    // fs not available (shouldn't happen in Bun)
  }
  return [...new Set(ports)];
}

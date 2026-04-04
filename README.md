<h1 align="center">ag-ui-crews</h1>

<p align="center">
  <strong>Mission control for your AI agent crews — real-time, in your browser.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <a href="https://docs.ag-ui.com"><img src="https://img.shields.io/badge/protocol-AG--UI-8B5CF6" alt="AG-UI Protocol" /></a>
  <img src="https://img.shields.io/badge/tests-95%20passing-brightgreen" alt="Tests: 95 passing" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#features">Features</a> •
  <a href="#api-reference">API</a> •
  <a href="#ag-ui-events">Events</a> •
  <a href="#testing">Testing</a>
</p>

---

## Quick Demo

```bash
bun run dev
# → Open http://localhost:5173
# → Click "Run Simulation"
```

The dashboard springs to life: a feasibility assessment appears, agents register one by one with pulse animations, tasks fan out across waves, artifacts stream in, and the event log scrolls in real time — all powered by AG-UI protocol events over SSE. No agents required.

---

## Architecture

```mermaid
flowchart LR
    A2A["a2a-crews bridge\n(A2A REST)"] -->|HTTP poll| Server["ag-ui-crews server\n(Bun :4120)"]
    Sim["Simulation engine"] -->|events| Server
    Server -->|SSE stream\n(AG-UI events)| Client["React dashboard\n(:5173)"]

    style A2A fill:#064e3b,stroke:#10b981,color:#d1fae5
    style Sim fill:#1c1917,stroke:#a8a29e,color:#e7e5e3
    style Server fill:#0c4a6e,stroke:#0ea5e9,color:#e0f2fe
    style Client fill:#1e1b4b,stroke:#7c3aed,color:#e0e7ff
```

**Two data sources, one protocol.** The server accepts events from either a live a2a-crews bridge (HTTP polling) or the built-in simulation engine, translates them to [AG-UI protocol](https://docs.ag-ui.com) events, and streams them to connected clients via SSE.

---

## Features

- **Real-time SSE streaming** via AG-UI protocol events (`RUN_STARTED`, `STEP_STARTED`, `STATE_SNAPSHOT`, `CUSTOM`, etc.)
- **Simulation mode** — demo the full crew lifecycle without running agents
- **Bridge connector** — connects to live [a2a-crews](https://github.com/aviraldua93/a2a-crews) runs
- **Planning view** with feasibility assessment (go / risky / no-go)
- **Agent status cards** with live pulse animations
- **Wave timeline** with task dependency visualization
- **Artifact viewer** for produced deliverables
- **Scrolling event log** with type filters
- **Metrics dashboard** — tasks, waves, agents, elapsed time, completion %
- **95 passing tests** (Vitest) + Playwright E2E tests

---

## Quick Start

```bash
git clone https://github.com/aviraldua93/ag-ui-crews.git
cd ag-ui-crews && bun install
bun run dev
# Open http://localhost:5173 → Click "Run Simulation"
```

> **Prerequisite:** [Bun](https://bun.sh) ≥ 1.0

---

## Connect to a Live Crew

```bash
# Terminal 1 — run a2a-crews
cd your-project && crews plan "Build something" && crews apply && crews launch

# Terminal 2 — start dashboard
cd ag-ui-crews && bun run dev
# Click "Connect to Bridge" → enter bridge URL from crews output
```

The dashboard connects to the a2a-crews bridge, polls for state changes, and streams live execution events to your browser.

---

## API Reference

The server runs on port **4120** (configurable via `PORT` env var).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/events` | SSE stream — AG-UI protocol events. Sends `STATE_SNAPSHOT` on connect. |
| `POST` | `/api/simulate` | Start a simulation session. Accepts optional `scenario`, `speedMultiplier`, `failureRate`. |
| `POST` | `/api/connect` | Connect to a live a2a-crews bridge. Body: `{ "bridgeUrl": "http://..." }` |
| `POST` | `/api/stop` | Stop the current session (bridge or simulation). Resets state. |
| `GET` | `/api/state` | Current dashboard state snapshot as JSON. |
| `GET` | `/api/health` | Health check — uptime, client count, bridge/simulation status. |

---

## AG-UI Events

Events sent over the SSE stream, following the [AG-UI protocol](https://docs.ag-ui.com):

| Event Type | Purpose |
|------------|---------|
| `RUN_STARTED` / `RUN_FINISHED` | Session lifecycle |
| `STEP_STARTED` / `STEP_FINISHED` | Logical phases (`"planning"`, `"wave-0"`, …) |
| `TEXT_MESSAGE_START` / `CONTENT` / `END` | Streaming text messages (plan summaries, task updates) |
| `STATE_SNAPSHOT` | Full dashboard state on connect / reset |
| `STATE_DELTA` | Incremental state patches |
| `TOOL_CALL_START` / `ARGS` / `END` | Tool invocations |
| `CUSTOM` | Domain events — wraps `CREW_PLAN_*`, `WAVE_*`, `AGENT_*`, `TASK_*`, `ARTIFACT_PRODUCED`, `BRIDGE_*`, `METRICS_UPDATE` |

---

## Tech Stack

| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh) |
| **Frontend** | [React 19](https://react.dev) · TypeScript · [Vite 6](https://vite.dev) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com) · [Framer Motion](https://www.framer.com/motion/) |
| **Protocol** | [AG-UI](https://docs.ag-ui.com) (`@ag-ui/core`) |
| **Testing** | [Vitest](https://vitest.dev) · [Playwright](https://playwright.dev) |

---

## Testing

```bash
bun run test           # 95 unit tests (Vitest)
bun run test:e2e       # Playwright E2E — full simulation lifecycle
```

Unit tests cover the event emitter, simulator, SSE integration, AG-UI translation, and the client-side reducer. E2E tests verify the complete flow from hero landing through planning, execution, artifacts, and completion.

---

## Dogfood Story 🐕

This project was built using [a2a-crews](https://github.com/aviraldua93/a2a-crews) itself — dogfood squared. A crew of AI agents planned the architecture, wrote the server, built the React components, authored tests, and integrated SSE streaming. Bugs found during the build were [filed back as issues](https://github.com/aviraldua93/a2a-crews/issues) on a2a-crews.

---

## Relationship to a2a-crews

**ag-ui-crews** is the companion dashboard for [a2a-crews](https://github.com/aviraldua93/a2a-crews), a CLI that orchestrates multi-agent crews using the A2A protocol. While a2a-crews handles agent coordination in the terminal, ag-ui-crews gives you a real-time visual interface for the same execution — built on the [AG-UI protocol](https://docs.ag-ui.com).

---

## Roadmap

- [ ] Live bridge auto-discovery
- [ ] Token cost tracking
- [ ] Multi-crew dashboard
- [ ] Dark/light theme toggle

---

## License

[MIT](LICENSE) © 2026 [Aviral Dua](https://github.com/aviraldua93)

---

<p align="center">
  Built on <a href="https://docs.ag-ui.com">AG-UI Protocol</a> · <a href="https://github.com/aviraldua93/a2a-crews">a2a-crews</a> · <a href="https://bun.sh">Bun</a> · <a href="https://react.dev">React</a>
</p>

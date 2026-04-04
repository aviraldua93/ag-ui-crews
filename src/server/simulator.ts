/**
 * Simulation engine for ag-ui-crews.
 *
 * Provides a fully self-contained simulation mode that generates realistic crew
 * execution events with staggered timing, suitable for demos, UI development,
 * and integration testing without requiring a live a2a-crews bridge.
 *
 * The simulation follows a **5-phase lifecycle**:
 * 1. **Planning** — Emits `CREW_PLAN_STARTED`, waits 2 s, then `CREW_PLAN_COMPLETED`
 *    with the full {@link CrewPlan}.
 * 2. **Agent registration** — Emits `AGENT_REGISTERED` for each role with 200 ms
 *    spacing.
 * 3. **Wave execution** — Iterates through waves sequentially; within each wave,
 *    tasks run in parallel via `Promise.all` with staggered starts.
 * 4. **Metrics** — Emits a `METRICS_UPDATE` with aggregate timing and counts.
 * 5. **Completion** — Emits a `STATE_SNAPSHOT` with `phase: "completed"`.
 *
 * Tasks may randomly fail (controlled by `failureRate`) and are automatically
 * retried once. Each task produces a markdown artifact from
 * {@link ARTIFACT_TEMPLATES}.
 *
 * @module server/simulator
 */
import type {
  SimulationConfig,
  CrewPlan,
  PlanRole,
  PlanTask,
  FeasibilityAssessment,
  DashboardEvent,
} from "../shared/types";
import type { EventEmitter } from "./event-emitter";
import { v4 as uuidv4 } from "uuid";

// ─── Scenario Templates ────────────────────────────────────────────────────────

/**
 * Internal plan structure used by the simulation engine.
 *
 * Represents the pre-built scenario that drives the simulation. The default
 * scenario (built by {@link buildSimulationPlan}) defines:
 * - **4 roles**: architect, backend-dev, frontend-dev, reviewer
 * - **6 tasks**: design → implement-api + implement-ui → review + test → integrate
 * - **4 waves**: one per dependency tier
 *
 * The plan mirrors the shape of {@link CrewPlan} but includes the
 * {@link FeasibilityAssessment} at the same level for convenience during
 * simulation setup.
 */
interface SimulationPlan {
  scenario: string;
  roles: PlanRole[];
  tasks: PlanTask[];
  waves: PlanTask[][];
  feasibility: FeasibilityAssessment;
}

/**
 * Maps task IDs to markdown artifact generators.
 *
 * Each key corresponds to a task ID in the default simulation plan. The value
 * is a function that accepts the task title and returns a markdown string
 * representing the artifact that task "produced". The templates are:
 *
 * | Key              | Artifact Description |
 * |------------------|----------------------|
 * | `design`         | Architecture design document with component breakdown and decisions. |
 * | `implement-api`  | API implementation report listing endpoints, middleware, and status. |
 * | `implement-ui`   | UI implementation report listing React components and stack choices. |
 * | `review`         | Code review summary with findings and verdict. |
 * | `test`           | Test report with suite results, coverage percentages, and integration test outcomes. |
 * | `integrate`      | Integration/deployment checklist with final status. |
 *
 * If a task ID has no matching template key, the `design` template is used as
 * a fallback.
 */
const ARTIFACT_TEMPLATES: Record<string, (title: string) => string> = {
  design: (title) =>
    `# Architecture Design: ${title}\n\n## Overview\nMicroservice architecture with REST API layer.\n\n## Components\n- API Gateway (Express/Fastify)\n- Auth Service (JWT + bcrypt)\n- Database Layer (PostgreSQL)\n- Cache Layer (Redis)\n\n## Decisions\n- Use repository pattern for data access\n- Event-driven communication between services\n- OpenAPI 3.0 specification for all endpoints\n`,

  "implement-api": (title) =>
    `# API Implementation: ${title}\n\n## Endpoints\n\`\`\`\nPOST /api/auth/register  — Create account\nPOST /api/auth/login     — Authenticate\nGET  /api/users/:id      — Get user profile\nPUT  /api/users/:id      — Update profile\nDEL  /api/users/:id      — Delete account\n\`\`\`\n\n## Middleware\n- JWT validation\n- Rate limiting (100 req/min)\n- Request validation (zod schemas)\n- Error handling with structured responses\n\n## Status: All 12 endpoints implemented and passing.\n`,

  "implement-ui": (title) =>
    `# UI Implementation: ${title}\n\n## Components Built\n- \`<LoginForm />\` — Email/password with validation\n- \`<Dashboard />\` — Main authenticated view\n- \`<UserProfile />\` — Profile display and edit\n- \`<ApiStatus />\` — Health check indicator\n\n## Stack\n- React 19 + TypeScript\n- TailwindCSS for styling\n- React Query for data fetching\n- React Router v7 for navigation\n`,

  review: (title) =>
    `# Code Review: ${title}\n\n## Summary\nReviewed 847 lines across 23 files.\n\n## Findings\n- ✅ Auth flow is secure (bcrypt rounds = 12)\n- ✅ Input validation on all endpoints\n- ⚠️ Missing rate limit on /register (added)\n- ⚠️ SQL query in user search could be optimized (fixed)\n- ✅ Error handling is consistent\n\n## Verdict: **APPROVED** with minor fixes applied.\n`,

  test: (title) =>
    `# Test Report: ${title}\n\n## Results\n\`\`\`\nTest Suites: 8 passed, 8 total\nTests:       47 passed, 47 total\nCoverage:    91.3%\n\`\`\`\n\n## Coverage Breakdown\n- Auth Service: 94%\n- User API: 89%\n- Middleware: 93%\n- Utils: 88%\n\n## Integration Tests\n- Full auth flow: ✅\n- CRUD operations: ✅\n- Error scenarios: ✅\n- Rate limiting: ✅\n`,

  integrate: (title) =>
    `# Integration Report: ${title}\n\n## Deployment Checklist\n- [x] All services containerized (Docker)\n- [x] Docker Compose for local dev\n- [x] CI/CD pipeline configured\n- [x] Environment variables documented\n- [x] Database migrations ready\n- [x] Smoke tests passing\n\n## Final Status\nAll components integrated and verified.\nReady for staging deployment.\n`,
};

/**
 * Builds the default simulation plan from a {@link SimulationConfig}.
 *
 * Constructs a 4-role, 6-task, 4-wave scenario representing a typical
 * "Build a REST API with auth and tests" crew execution:
 *
 * - **Wave 0**: `design` (architect)
 * - **Wave 1**: `implement-api` (backend-dev) + `implement-ui` (frontend-dev)
 * - **Wave 2**: `review` (reviewer) + `test` (backend-dev)
 * - **Wave 3**: `integrate` (architect)
 *
 * The `config.scenario` string overrides the default scenario name but does
 * not change the task/role structure. Agent count, wave count, and other
 * config overrides affect simulation timing but not the plan topology.
 *
 * A hard-coded {@link FeasibilityAssessment} with `verdict: "go"` and
 * `confidence: 0.82` is included, along with two representative concerns.
 *
 * @param config - The {@link SimulationConfig} from the `/api/simulate` request body.
 * @returns A fully populated {@link SimulationPlan} ready for execution.
 */
function buildSimulationPlan(config: SimulationConfig): SimulationPlan {
  const scenario =
    config.scenario || "Build a REST API with auth and tests";

  const roles: PlanRole[] = [
    {
      key: "architect",
      description: "System architect — designs overall structure and API contracts",
      model: "gpt-4o",
    },
    {
      key: "backend-dev",
      description: "Backend developer — implements API endpoints, auth, and database logic",
      model: "gpt-4o",
    },
    {
      key: "frontend-dev",
      description: "Frontend developer — builds UI components and client-side logic",
      model: "gpt-4o",
    },
    {
      key: "reviewer",
      description: "Code reviewer — reviews code quality, security, and test coverage",
      model: "gpt-4o-mini",
    },
  ];

  const taskDefs = [
    { id: "design", title: "Design system architecture", assignedTo: "architect", deps: [] },
    { id: "implement-api", title: "Implement REST API with auth", assignedTo: "backend-dev", deps: ["design"] },
    { id: "implement-ui", title: "Build frontend components", assignedTo: "frontend-dev", deps: ["design"] },
    { id: "review", title: "Review code and security", assignedTo: "reviewer", deps: ["implement-api", "implement-ui"] },
    { id: "test", title: "Write and run test suite", assignedTo: "backend-dev", deps: ["implement-api", "implement-ui"] },
    { id: "integrate", title: "Integration and deployment prep", assignedTo: "architect", deps: ["review", "test"] },
  ];

  const tasks: PlanTask[] = taskDefs.map((t) => ({
    id: t.id,
    title: t.title,
    assignedTo: t.assignedTo,
    dependsOn: t.deps,
    acceptanceCriteria: [`${t.title} completed successfully`],
  }));

  // Wave 0: design
  // Wave 1: implement-api + implement-ui (parallel)
  // Wave 2: review + test (parallel)
  // Wave 3: integrate
  const waves: PlanTask[][] = [
    [tasks[0]],
    [tasks[1], tasks[2]],
    [tasks[3], tasks[4]],
    [tasks[5]],
  ];

  const feasibility: FeasibilityAssessment = {
    verdict: "go",
    confidence: 0.82,
    concerns: [
      "Auth implementation complexity may require additional iteration",
      "Frontend and backend must agree on API contract early",
    ],
    technical: 0.85,
    scope: 0.78,
    risk: 0.2,
  };

  return { scenario, roles, tasks, waves, feasibility };
}

// ─── Simulation Engine ──────────────────────────────────────────────────────────

/**
 * Entry point for simulation mode: kicks off an asynchronous simulation run
 * and returns a cleanup function to abort it.
 *
 * The simulation progresses through a 5-phase lifecycle:
 * 1. **Planning** (≈2 s) — Emits `CREW_PLAN_STARTED` and `CREW_PLAN_COMPLETED`.
 * 2. **Agent registration** (≈0.8 s) — Emits `AGENT_REGISTERED` × 4 roles.
 * 3. **Wave execution** (variable) — Runs 4 waves sequentially; tasks within
 *    each wave execute in parallel with staggered starts (300 ms per task).
 *    Tasks may fail randomly and retry once.
 * 4. **Metrics** — Emits a `METRICS_UPDATE` with aggregate totals.
 * 5. **Completion** — Emits `STATE_SNAPSHOT` with `phase: "completed"`.
 *
 * All timing is divided by `config.speedMultiplier` (default 1×), allowing
 * faster or slower playback. The `config.failureRate` (default 0.15) controls
 * the probability that a task fails on its first attempt.
 *
 * The returned cleanup function sets an internal `stopped` flag and clears all
 * pending timers. Once called, no further events are emitted. The cleanup is
 * idempotent and safe to call multiple times.
 *
 * @param config  - Simulation parameters: scenario name, speed, failure rate, etc.
 *                  See {@link SimulationConfig} for the full shape.
 * @param emitter - The shared {@link EventEmitter} that receives dashboard events
 *                  and forwards them to SSE clients.
 * @returns A cleanup function that stops the simulation immediately when invoked.
 *          All pending `setTimeout` timers are cleared and no further events are emitted.
 */
export function startSimulation(
  config: SimulationConfig,
  emitter: EventEmitter
): () => void {
  const speed = config.speedMultiplier ?? 1;
  const failureRate = config.failureRate ?? 0.15;
  const plan = buildSimulationPlan(config);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (stopped) return resolve();
      const t = setTimeout(resolve, ms / speed);
      timers.push(t);
    });

  const emit = (event: DashboardEvent): void => {
    if (stopped) return;
    emitter.broadcastDashboardEvent(event);
  };

  const now = () => Date.now();

  // ─── Run the simulation ───────────────────────────────────────────────────

  const run = async () => {
    const runStart = now();

    // ── Phase 1: Planning (2s) ──────────────────────────────────────────────
    emit({
      type: "CREW_PLAN_STARTED",
      timestamp: now(),
      data: { scenario: plan.scenario },
    });

    await delay(2000);
    if (stopped) return;

    const crewPlan: CrewPlan = {
      scenario: plan.scenario,
      feasibility: plan.feasibility,
      roles: plan.roles,
      tasks: plan.tasks,
      waves: plan.waves,
    };

    emit({
      type: "CREW_PLAN_COMPLETED",
      timestamp: now(),
      data: {
        plan: crewPlan,
        roleCount: plan.roles.length,
        taskCount: plan.tasks.length,
        waveCount: plan.waves.length,
      },
    });

    // Small pause before execution starts
    await delay(500);
    if (stopped) return;

    // ── Register agents ─────────────────────────────────────────────────────
    for (const role of plan.roles) {
      emit({
        type: "AGENT_REGISTERED",
        timestamp: now(),
        data: {
          name: role.key,
          role: role.description,
          model: role.model,
        },
      });
      await delay(200);
      if (stopped) return;
    }

    // ── Execute waves ───────────────────────────────────────────────────────
    for (let waveIdx = 0; waveIdx < plan.waves.length; waveIdx++) {
      if (stopped) return;

      const waveTasks = plan.waves[waveIdx];
      const waveDuration = waveIdx === 1 ? 4000 : 3000; // wave 1 is longer

      emit({
        type: "WAVE_STARTED",
        timestamp: now(),
        data: {
          waveIndex: waveIdx,
          taskCount: waveTasks.length,
        },
      });

      // Execute tasks in this wave (may be parallel)
      const taskPromises = waveTasks.map((task, taskIdx) =>
        simulateTask(task, waveIdx, taskIdx, waveDuration, failureRate)
      );

      await Promise.all(taskPromises);
      if (stopped) return;

      emit({
        type: "WAVE_COMPLETED",
        timestamp: now(),
        data: {
          waveIndex: waveIdx,
          tasksCompleted: waveTasks.length,
        },
      });

      // Pause between waves
      await delay(300);
    }

    if (stopped) return;

    // ── Phase 5: Wrap up ────────────────────────────────────────────────────
    const totalTime = now() - runStart;

    emit({
      type: "METRICS_UPDATE",
      timestamp: now(),
      data: {
        totalTime,
        waveCount: plan.waves.length,
        taskCount: plan.tasks.length,
        completedTasks: plan.tasks.length,
        failedTasks: 0,
        agentCount: plan.roles.length,
      },
    });

    emit({
      type: "STATE_SNAPSHOT",
      timestamp: now(),
      data: { phase: "completed" },
    });

    console.log(
      `[simulator] Simulation completed in ${(totalTime / 1000).toFixed(1)}s`
    );
  };

  // ─── Task simulation helper ─────────────────────────────────────────────────

  /**
   * Simulates a single task's lifecycle within a wave.
   *
   * Executes the following sequence of events:
   * 1. **Staggered start** — Waits `taskIdx * 300 ms` so parallel tasks don't
   *    fire simultaneously (provides a more realistic visual cascade).
   * 2. **Submission** — Emits `TASK_SUBMITTED` and `AGENT_ACTIVE`.
   * 3. **Working** — Emits `TASK_WORKING`, then waits 1–3 s (random).
   * 4. **Failure/retry** (conditional) — If `Math.random() < failRate` and the
   *    wave is 1 or 2 (not the first or last), emits `TASK_FAILED` →
   *    `AGENT_RETRYING` → `TASK_RETRYING` → `TASK_WORKING`, then waits 1.5 s.
   * 5. **Artifact generation** — Looks up the task ID in
   *    {@link ARTIFACT_TEMPLATES} (falls back to `design` template) and emits
   *    `ARTIFACT_PRODUCED`.
   * 6. **Completion** — Emits `TASK_COMPLETED` and `AGENT_COMPLETED`.
   *
   * The function respects the `stopped` flag: at each `await delay(...)` point,
   * if the simulation has been cancelled, it returns immediately.
   *
   * @param task         - The {@link PlanTask} to simulate.
   * @param waveIdx      - Zero-based index of the current wave (used for failure eligibility).
   * @param taskIdx      - Zero-based position of this task within the wave (used for stagger).
   * @param waveDuration - Intended wave duration in ms (currently unused for per-task timing
   *                       but reserved for future pacing adjustments).
   * @param failRate     - Probability (0–1) that this task will fail on its first attempt.
   */
  async function simulateTask(
    task: PlanTask,
    waveIdx: number,
    taskIdx: number,
    waveDuration: number,
    failRate: number
  ): Promise<void> {
    // Stagger task starts within a wave
    await delay(taskIdx * 300);
    if (stopped) return;

    // Submit
    emit({
      type: "TASK_SUBMITTED",
      timestamp: now(),
      data: {
        taskId: task.id,
        title: task.title,
        assignedTo: task.assignedTo,
        wave: waveIdx,
        dependsOn: task.dependsOn,
      },
    });

    // Activate agent
    emit({
      type: "AGENT_ACTIVE",
      timestamp: now(),
      data: { name: task.assignedTo, taskId: task.id },
    });

    await delay(200);
    if (stopped) return;

    // Working
    emit({
      type: "TASK_WORKING",
      timestamp: now(),
      data: {
        taskId: task.id,
        title: task.title,
        assignedTo: task.assignedTo,
      },
    });

    // Work duration: varies by task position in wave
    const workTime = 1000 + Math.random() * 2000;
    await delay(workTime);
    if (stopped) return;

    // Decide if task fails (only on waves 1+, not the last wave)
    const shouldFail =
      waveIdx > 0 &&
      waveIdx < 3 &&
      Math.random() < failRate;

    if (shouldFail) {
      emit({
        type: "TASK_FAILED",
        timestamp: now(),
        data: {
          taskId: task.id,
          title: task.title,
          assignedTo: task.assignedTo,
          error: "Transient error: model timeout",
        },
      });

      emit({
        type: "AGENT_RETRYING",
        timestamp: now(),
        data: { name: task.assignedTo },
      });

      // Retry
      await delay(800);
      if (stopped) return;

      emit({
        type: "TASK_RETRYING",
        timestamp: now(),
        data: { taskId: task.id, title: task.title, assignedTo: task.assignedTo },
      });

      emit({
        type: "TASK_WORKING",
        timestamp: now(),
        data: {
          taskId: task.id,
          title: task.title,
          assignedTo: task.assignedTo,
        },
      });

      // Retry work time
      await delay(1500);
      if (stopped) return;
    }

    // Generate artifact
    const artifactGenerator = ARTIFACT_TEMPLATES[task.id] ?? ARTIFACT_TEMPLATES["design"];
    const artifactContent = artifactGenerator(task.title);

    emit({
      type: "ARTIFACT_PRODUCED",
      timestamp: now(),
      data: {
        taskId: task.id,
        filename: `${task.id}.md`,
        content: artifactContent,
        producedBy: task.assignedTo,
      },
    });

    // Complete
    emit({
      type: "TASK_COMPLETED",
      timestamp: now(),
      data: {
        taskId: task.id,
        title: task.title,
        assignedTo: task.assignedTo,
        artifact: `${task.id}.md`,
      },
    });

    // Mark agent completed for this task
    emit({
      type: "AGENT_COMPLETED",
      timestamp: now(),
      data: { name: task.assignedTo, taskId: task.id },
    });
  }

  // ── Kick off the simulation ─────────────────────────────────────────────────
  run().catch((err) => {
    if (!stopped) {
      console.error("[simulator] Error:", err);
      emit({
        type: "CREW_PLAN_FAILED",
        timestamp: now(),
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  });

  // ── Return cleanup function ─────────────────────────────────────────────────
  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    console.log("[simulator] Simulation stopped");
  };
}

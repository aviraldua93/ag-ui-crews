/**
 * Simulation mode for ag-ui-crews
 * Generates realistic crew execution events with staggered timing for demo/testing.
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

interface SimulationPlan {
  scenario: string;
  roles: PlanRole[];
  tasks: PlanTask[];
  waves: PlanTask[][];
  feasibility: FeasibilityAssessment;
}

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

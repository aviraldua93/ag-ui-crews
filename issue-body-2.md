## Description

After CREW_PLAN_COMPLETED, the client-side MetricsBar shows task progress as `X/—` instead of `X/6` because `metrics.taskCount` is never initialized from the plan.

## Root Cause

In `src/client/hooks/useEventStream.ts`, the CREW_PLAN_COMPLETED handler builds the tasks and waves arrays but does not update `metrics.taskCount`:

```tsx
case "CREW_PLAN_COMPLETED": {
  const plan = data.plan as CrewPlan;
  const tasks = plan.tasks.map(...);
  const waves = plan.waves.map(...);
  return { ...state, eventLog, phase: "executing", plan, tasks, waves };
  // BUG: metrics.taskCount stays at 0 (initial value)
}
```

The MetricsBar renders:
```tsx
value={`${metrics.completedTasks}/${metrics.taskCount || "—"}`}
```

Since `metrics.taskCount` is 0, the fallback `"—"` is shown, producing `6/—` instead of `6/6`.

## Impact

- Task progress counter always shows `X/—` instead of `X/6` during and after simulation
- The completion percentage ring in MetricsBar is unaffected (uses `tasks.filter(completed).length / tasks.length`)
- Server state has correct taskCount (set in event-emitter.ts during CREW_PLAN_COMPLETED)

## Fix

Update the CREW_PLAN_COMPLETED handler to also set metrics:

```tsx
return {
  ...state, eventLog, phase: "executing", plan, tasks, waves,
  metrics: { ...state.metrics, taskCount: tasks.length },
};
```

Found by Playwright stress testing.

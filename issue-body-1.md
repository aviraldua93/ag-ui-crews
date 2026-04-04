## Description

The client-side METRICS_UPDATE event handler in useEventStream.ts reads data.metrics to extract incoming metrics, but the simulator (and server event emitter) sends metrics fields directly at the data root level — not nested under a metrics key.

## Root Cause

In src/client/hooks/useEventStream.ts, the METRICS_UPDATE case:

```tsx
case "METRICS_UPDATE": {
  const incoming = data.metrics as Partial<CrewMetrics>;  // BUG: data.metrics is undefined
  return { ...state, eventLog, metrics: { ...state.metrics, ...incoming } };
}
```

The simulator emits:
```js
emit({ type: "METRICS_UPDATE", data: { totalTime, waveCount, taskCount, completedTasks, failedTasks, agentCount } });
```

Since data.metrics is undefined, the spread `{ ...state.metrics, ...undefined }` returns state.metrics unchanged — the METRICS_UPDATE is silently ignored.

## Impact

- When failureRate > 0: tasks may fail and retry successfully. The final METRICS_UPDATE should correct failedTasks to 0, but this correction is ignored. The client shows a non-zero failed count even though all tasks succeeded.
- totalTime metric is never set on the client from the server.
- Only affects client-side display; server state is correct.

## Fix

Change the handler to read metrics from data directly with a fallback:

```tsx
const incoming = (data.metrics ?? data) as Partial<CrewMetrics>;
```

## Reproduction

1. Start simulation with failureRate: 0.5
2. Wait for completion
3. Observe: server /api/state shows failedTasks: 0, but client MetricsBar may show failedTasks > 0

Found by Playwright stress testing.

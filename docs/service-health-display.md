# Model and group health indicators

The model plaza, model details (overview, performance summaries, group histories
and chart points), and group monitor use `web/default/src/lib/service-health.ts`.
Measured success rates are never changed to achieve a particular color mix.

- Green: at least 90% successful requests.
- Yellow: less than 90%, unless there is enough evidence for red.
- Red: less than 50% successful requests, with at least 10 requests in that
  aggregate window. Missing sample counts cannot establish a red aggregate.
- Gray: no requests or invalid/missing metrics.

Individual recent-request bars retain the actual success/failure tooltip:
successes are green, isolated failures are yellow, and the third consecutive
failure and subsequent failures are red. A success resets that streak. Latency
and token throughput are still displayed, but do not determine availability
colors. These display rules do not affect routing, billing, automatic channel
disabling, or the timing colors in usage logs.

The plaza and performance views use the last 24 hours. Aggregate percentages
are weighted by request count (using exact success counts when available), not
by the number of groups or time buckets. The summary API exposes request_count
so a single unsuccessful test does not appear as a sustained outage. Historical
series without requests stay gray and do not enter success-rate averages.

Group cards label their recent window explicitly and use the same newest 30
requests for both the percentage and the strip. The API continues to retain up
to 60 records. Empty groups display their existing availability fallback with
no inferred request health. Three-bar badges use the same color in every bar.

Verification (Shanghai only):

```sh
cd /home/ubuntu/demo/SynthApi/web/default
bun scripts/test-service-health.mjs
bun run typecheck
```

Run ESLint and Prettier checks on changed files, then build with
`scripts/remote-build-shanghai.sh build`. Deployment must update both the Go
binary and the Nginx static release under `/var/www/synthapi-web/current`.
Browser verification should compare the displayed percentages and colors with
`/api/perf-metrics`, `/api/perf-metrics/summary`, and the authenticated
`/api/dashboard/channel-monitor`, including a slow successful request and a
series of consecutive failures. These checks do not require paid generation.

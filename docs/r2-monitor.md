# R2 Monitor

## Loading Crash Fix (2026-09-09)

The truncation notice previously read `data.r2_truncated` before the query
completed. This raised a TypeError and displayed the application's 500 page,
even though the HTML and API were healthy. The notice now guards undefined
query data; its optional field is declared in the snapshot type. Token rendering
also tolerates unavailable values. A 1500 ms response delay in the browser test
reproduces the old crash and passes with the fix at desktop and mobile widths.
Targeted ESLint and the isolated Shanghai production build passed.

Production entry: `https://admin.synthapi.asia/r2-monitor`.
`/console/r2-monitor` redirects to that entry in the default theme.

`GET /api/admin/r2-monitor` requires the existing `AdminAuth` middleware.
It serves metadata from `/var/lib/synthapi-monitor/snapshot.json`, with
`Cache-Control: no-store`. Missing or corrupt snapshots return HTTP 503.

`r2-monitor.timer` runs `scripts/r2-monitor.py` every two minutes after the
previous collection ends. The collector reads upload manifests, recorder
statistics, local trajectory metadata, and a paginated R2 ListObjectsV2 listing.
It signs R2 requests with curl SigV4 and keeps credentials out of argv and the
snapshot. The collector runs with CPUQuota=30% and MemoryMax=256M. The Go process
only needs group read access to the snapshot; it does not read R2 credentials
or raw trajectory files.

The R2 count and bytes cover the uploader's configured object prefix, not
necessarily the entire bucket. Token totals cover locally observed records,
deduplicated by request_id, since monitor initialization. They are not R2
lifetime token totals. Missing usage is not inferred from byte size. Record
details expose selected metadata and preliminary quality flags only.
Official procurement validation is not connected and is explicitly reported as
not validated. Local Feishu exports may already have been redacted by the
existing exporter. This monitor neither modifies nor uploads trajectories.

Build with `scripts/remote-build-shanghai.sh` on Shanghai. Do not build on the
production host. `scripts/deploy-r2-monitor.sh` is the dated deployment procedure
for this release and retains a binary backup plus the previous frontend link.

Validation: targeted Go snapshot and administrator gate tests, targeted ESLint,
production frontend/Go builds, and Playwright desktop/mobile fixture tests.
The full TypeScript project check exceeded the builder's 1.5 GiB resource limit;
it did not pass. Browser fixtures use real metadata with simulated authentication;
they do not constitute a production administrator login test.

Deployment completed on 2026-09-08. Authenticated API smoke tests returned 200
both locally and through admin.synthapi.asia; anonymous access returned 401.
Runtime SHA256: a6b9c8c208c55a0afb434f7307d8f0641032fb9394da7f9dfefc05d33a199519.
Rollback backup: `deploy-backups/r2-monitor-20260908T114857Z`.
Frontend release: `/var/www/synthapi-web/releases/r2-monitor-20260908-final`.

Shanghai cleanup preserved current and previous MeetingNotes releases/venvs,
running SynthAPI source/binaries, databases, and current task backups. Removed
reproducible dependencies in SynthApi-clean, the September 2 build, older
MeetingNotes releases/venvs, backups older than seven days, and stale rotated
logs/caches. Available disk increased from about 536 MiB to 19 GiB before rebuild.

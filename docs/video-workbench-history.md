# Video workbench playback and history

Completed video tasks are listed from the account's server-side task history
(`/api/task/self?action=videoGenerate`). The workbench shows the newest 50
matching tasks from the last seven days and restores the newest completed
preview after refresh or navigation. History errors have a visible retry state.
Text, first/last-frame, reference and remix video actions are included in both
list and count queries. Image actions remain excluded.

The UI understands OpenAI `metadata.url` and nested APIMart status/result
responses. Preview and download use the authenticated same-origin
`/v1/videos/:task_id/content` endpoint. `?download=1` sets an MP4 attachment
filename. GET/HEAD, byte ranges, conditional requests and 206/416 upstream
responses are supported. Task ownership is checked before fetching or serving
cached content; upstream cookies and public cache headers are not forwarded.

A disk cache under `data/cache/synthapi-video-history` (or the configured disk
cache path) preserves complete files after first playback/download. It uses a
single background streaming download, a 64 MiB per-file limit, a 128 MiB total
limit and seven-day expiry. Temporary/incomplete files are never served. Older
files can be evicted earlier when capacity is reached. This is not a guarantee
of permanent media storage: larger, never-opened or evicted videos still depend
on the upstream URL. Users should download important results promptly.

## Validation (Shanghai builder, 2026-09-14)

- Frontend typecheck, ESLint for changed TypeScript files, and Prettier checks.
- `bun test scripts/video-response.test.mjs`: OpenAI/nested APIMart normalization
  and same-origin URL tests.
- `go test -p 1 ./controller ./model -run TestVideo -count=1`: byte-range
  playback/seeking, HEAD/download, 416, safe response headers, complete cache
  reads, truncated/oversized cache rejection, expiry/capacity eviction, and
  task history filtering/user isolation.
- Both frontends and the Go binary built on Shanghai under systemd resource
  limits. Production binary backup retained and Nginx static release switched.
- Real Chrome on Shanghai against `admin.synthapi.asia/video-workbench` using
  an existing successful task: preview and archive playback, seek to 3 seconds,
  browser refresh, sidebar navigation, and clicking the history download link.
  Download was 1,405,827 bytes, MP4, 864x480, 5.041667 seconds. No new generation.
- Browser Range request returned 206 with `bytes 0-1023/1405827`; HEAD returned
  200 with attachment filename; anonymous media request returned 401.
- Download SHA-256 matched the production cache:
  `4e8216383cad4c5f6d590e4ce4500cabf61e5495bc5005aab72d6e1871b757e0`.

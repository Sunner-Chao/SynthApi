# Image and video audit logs

`/image-logs` and `/video-logs` are independent authenticated pages. Each contains request/billing records, generation tasks and the matching Midjourney tasks. The common usage-log UI requests `media_kind=other`; no historical ledger records are deleted. Existing API clients omitting that filter continue receiving all categories.

Users can query only their own rows. Administrators can query all users and filter by user/channel ID. The read-only API is `/api/media-logs/{self|admin}/{image|video}`. Views: `requests`, `tasks`, `midjourney`. Filters: `start_timestamp`, `end_timestamp`, exact `model`, `identifier` (request/upstream request/task ID for billing entries, task ID for task entries), `status`, `p`, `page_size`. Default: seven days. Maximum: 93 days and 100 rows per page. The summary covers all matching request records, including charge/refund/error counts, not only the displayed page. Task quota is a task snapshot, not an additional charge.

No raw task data, upstream API credentials, private billing context or raw log metadata is returned. Result routes enforce ownership or AdminAuth and reuse the existing bounded image/video proxy. Playback, Range and download requests require a valid session. Expired upstream assets can be unavailable while their audit metadata remains readable. Legacy synchronous image responses without persisted tasks remain visible as billing entries; this feature does not reconstruct missing historical prompts or results.

## Migration

`logs.media_kind` stores endpoint-first classification (`image`, `video`, `other`). Composite indexes cover `(media_kind,created_at)` and `(user_id,media_kind,created_at)`. New writes use the shared Go classifier in a GORM create hook. All writer nodes must be upgraded.

Before enabling the new UI, build `./scripts/maintenance/media-log-backfill` on Shanghai and run the resulting binary on production with the service's `SQL_DSN`/`LOG_SQL_DSN` environment. It adds the column if needed and creates indexes concurrently on PostgreSQL. MySQL/SQLite use GORM migrations (`MEDIA_DB_DRIVER=mysql|sqlite`, default PostgreSQL). It updates only missing classification in batches of 300, pausing between batches; it never changes quota, content or task data. Rerun after upgrading all writers to cover traffic generated during rollout. Keep the prior binary/static release for rollback. Empty classification is intentionally not treated as another media kind, so do not publish the UI until backfill completes.

All builds, tests, formatting and type checks run on Shanghai. Verification covers category separation, pagination/summary consistency, refunds/errors, user isolation, admin authorization, bad filters, absence of credentials and existing result playback/download without charging for a new generation.

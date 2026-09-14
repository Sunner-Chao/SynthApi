# Login timeout and local disk retention

## Production login

The public site's `/api/` prefix previously imposed a five-second upstream
header timeout on login and email verification. Turnstile could take six
seconds, producing Nginx 504 before the application returned. Authentication
paths now have a dedicated 30-second location pinned to the local worker with
upstream retries disabled. The public API prefix must use `location /api/`
instead of `^~` so the authentication regex can match. The administrator login
already has its own exact location.

The explicit `TURNSTILE_VERIFY_PROXY` uses the working local HTTP proxy on
7896 instead of the old global proxy on 7890. The application has an eight-second
verification budget. The proxy attempt has a three-second deadline; fallback
uses a transport with `Proxy=nil`, a fresh request body and the remaining parent
context. Human verification remains enabled. Relevant configuration templates
are under `scripts/maintenance/nginx` and `scripts/maintenance/systemd`.

Validation uses an ephemeral ordinary account with zero quota. Password login,
`/api/user/self`, and `/dashboard/overview` are checked in Chrome on Shanghai
against both public and admin hosts. This diagnostic seeds a verified Turnstile
session; verification connectivity is checked independently with an invalid
token (must reject normally, not 504). No email or paid generation is sent.

## R2 uploads and cleanup

The upload service's direct R2 connections timed out, leaving an archived batch
blocking subsequent work. Its HTTP(S) proxy now uses 7896, with a 256 MiB memory
high watermark and 512 MiB maximum. R2 monitor uses the same proxy. Successful
uploads resume the uploader's existing primary-export cleanup.

`synthapi-retention-cleanup.timer` runs about every 30 minutes, with low CPU/IO
priority, a 192 MiB memory limit and a 20-minute deadline. It supplements the
existing hourly low-disk cleanup:

- Keep the active static release and the three newest releases; remove other
  releases older than two days.
- Keep the three newest standalone binary backups; remove older binary backups
  after seven days. Running executables and SQL backups are excluded.
- Remove production `web/node_modules` when no build process is present.
  Production serves prebuilt artifacts; Shanghai retains build dependencies.
- Consider Feishu JSON copies older than 24 hours only if an uploader manifest
  is `cleaned`, has no failed files, and records an archive key, size and SHA-256.
  Before removal, R2 HEAD must match both Content-Length and the stored
  `x-amz-meta-session-recorder-sha256`. Limit checks to 200 archives per run and
  stop on repeated verification failure or a ten-minute runtime budget. Primary exports, pending archives,
  raw body spool, upload manifests, databases and R2 objects are never deleted.
- Check that each local file is unchanged since inspection; reject symlinks and
  path traversal. Hold the exporter lock and rebuild its metadata/manifest
  after removing verified copies. The exporter itself no longer deletes files
  merely based on age.

Run `python3 scripts/maintenance/retention-cleanup.py` for a dry run, or add
`--apply` to execute. Audit totals are stored in
`/var/lib/synthapi-maintenance/retention-last.json`. SHA-256 verification receipts
are local audit metadata, never authorization to delete R2 objects.

The first production run removed 91 old artifact paths (5,281,695,357 bytes)
and 2,194 verified Feishu copies (1,547,405,454 bytes), after verifying 27 R2
archives. Free space increased from about 0.5 GiB to 8.8 GiB including resumed
uploader cleanup. Retention tests run on Shanghai with
`python3 scripts/maintenance/test_retention_cleanup.py`.

After the final deployment, invalid Turnstile tokens were correctly rejected
with HTTP 200 in 0.22–0.29 seconds on both domains (no bypass). Unit tests cover
stalled-proxy fallback, fresh POST body replay, and an actual direct transport.

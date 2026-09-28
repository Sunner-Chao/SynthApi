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

`synthapi-retention-cleanup.timer` runs five minutes after the previous run, with low CPU/IO
priority, a 25% CPU quota, a 192 MiB memory limit and a 20-minute deadline. It supplements the
existing hourly low-disk cleanup:

- Keep the active static release and the three newest releases; remove other
  releases older than two days.
- Keep the three newest standalone binary backups; remove older binary backups
  after seven days. Legacy `/home/ubuntu/deploy-backups` keeps its three newest
  backup directories and only prunes verified ELF/gzip binaries older than
  fourteen days elsewhere. Running executables and SQL/config backups are excluded.
- Remove production `web/node_modules` when no build process is present.
  Production serves prebuilt artifacts; Shanghai retains build dependencies.
- Consider Feishu JSON copies older than six hours (one hour when root free
  space is below 5 GiB at run start) only if an uploader manifest
  is `cleaned`, has no failed files, and records an archive key, size and SHA-256.
  Before removal, R2 HEAD must match both Content-Length and the stored
  `x-amz-meta-session-recorder-sha256`. Check oldest copies first, with at most four concurrent R2 HEAD requests and
  2,000 archives per run. Stop on repeated verification failure or a ten-minute
  runtime budget; pressure runs also stop once 8 GiB is free. Primary exports, pending archives,
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


## September 23 disk exhaustion and database recovery

PostgreSQL could not write its initialization file when the 40 GB production
filesystem filled; port 5432 stopped accepting connections. After removing
verified uploaded local copies and obsolete deployment binaries, the existing
PostgreSQL 14/main cluster started successfully without database reset or restore.
Both the public status endpoint and database-backed pricing endpoint returned
HTTP 200. The old 24-hour local-copy retention allowed about 6.6 GiB of copies
to accumulate in less than a day; the shorter, pressure-sensitive schedule above
keeps a larger free-space buffer while still requiring a live R2 verification.

The PostgreSQL service restart override now retries failures every 30 seconds,
without a burst limit, so freeing space does not leave the cluster permanently
failed after five rapid attempts. The override is stored in
`scripts/maintenance/systemd/postgresql-disk-recovery.conf`; daemon reload
applies the policy without restarting a healthy database.

The September 23 pressure run completed at 11:55 CST: 376 R2 archives passed
live size/SHA-256 metadata verification, allowing 6,037 local Feishu copies
(5,071,105,114 bytes) to be removed. It stopped at the 8 GiB free-space target;
220 eligible batches were deferred to later runs. The rebuilt index matched
all 2,450 remaining local JSON files. Earlier emergency cleanup removed
2,707,652,611 bytes of obsolete legacy binaries while retaining three rollback
sets. The next timer activation was scheduled for 12:00 CST. PostgreSQL accepted
connections and a temporary-table write/read/rollback check passed. Recorder
write-error counters stayed unchanged after recovery and the queue was empty.

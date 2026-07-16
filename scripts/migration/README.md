# SynthAPI migration bundle

This directory provides a source export script and a target restore script for
moving the current SynthAPI deployment without relying on Git alone.

The bundle contains sensitive production material:

- the exact source tree, including uncommitted changes and `.git` metadata;
- the current `synthapi-server-new` executable;
- a PostgreSQL custom-format dump;
- `.env`, payment configuration, and database credentials;
- optional systemd, Nginx, TLS, and local payment key backups.
- the complete MPay source tree, MPay `.env`, MariaDB dump, and systemd unit.

Redis is intentionally not migrated. It is used as a cache/rate-limit store and
is rebuilt from PostgreSQL after the target service starts.

## 1. Read-only preflight on the source server

```bash
cd /home/ubuntu/demo/SynthApi
bash scripts/migration/export-synthapi.sh --check
```

This does not stop or restart any service.

## 2. Rehearsal bundle without downtime

```bash
sudo bash scripts/migration/export-synthapi.sh --online --encrypt
```

Online mode is useful to rehearse the target restore. It is not the final
cutover snapshot because pending in-memory batch billing may not yet be in the
database.

## 3. Final cutover bundle

Prepare the target host first, lower DNS TTL, then run:

```bash
sudo bash scripts/migration/export-synthapi.sh --leave-stopped --encrypt
```

This stops Nginx and MPay, waits for the configured batch-update interval,
stops SynthAPI, creates both PostgreSQL and MariaDB dumps, and leaves the source
services stopped.
If export fails, the script automatically starts services it stopped.

For a consistent snapshot with automatic source restart instead:

```bash
sudo bash scripts/migration/export-synthapi.sh --encrypt
```

Traffic accepted after that restart will not exist in the generated bundle, so
do not use that mode as the final cutover unless writes are otherwise blocked.

## 4. Transfer and extract on the target server

For an encrypted bundle:

```bash
gpg --output synthapi-migration.tar.zst --decrypt synthapi-migration-*.tar.zst.gpg
tar --zstd -xf synthapi-migration.tar.zst
cd synthapi-migration-*
```

For an unencrypted bundle:

```bash
tar --zstd -xf synthapi-migration-*.tar.zst
cd synthapi-migration-*
```

Install the target prerequisites before restore. PostgreSQL 14 or newer,
MariaDB 10.6 or newer, PHP 8.1 with `pdo_mysql`, Redis, Nginx, zstd, rsync, and
Python 3 are recommended; the target architecture must match the source.

## 5. Restore

Restore the project and database, install the systemd unit, and start SynthAPI:

```bash
sudo ./restore-synthapi.sh
```

Also install the bundled Nginx configuration and TLS files:

```bash
sudo ./restore-synthapi.sh --install-nginx
```

Useful alternatives:

```bash
sudo ./restore-synthapi.sh --no-start
sudo ./restore-synthapi.sh --target /srv/SynthApi --service-user ubuntu
sudo ./restore-synthapi.sh --mpay-target /srv/mpay
sudo ./restore-synthapi.sh --force
```

`--force` first backs up an existing target database and project under
`/var/backups/synthapi/` before replacement.

## Scope and cutover notes

- MPay on port `18088` and its MariaDB database are restored by default. Use
  `--no-mpay` only when intentionally keeping MPay on another host.
- Cloudflare DNS records, security groups, firewall rules, BBR/sysctl settings,
  and provider IP allowlists are host-level cutover tasks and are not changed.
- The bundled Nginx file contains the source direct-IP virtual host. Domain
  virtual hosts remain usable, but review the direct-IP block on the new host.
- Perform a small real payment only after the new host passes local health and
  the Alipay/WeChat callback domains resolve to it.
- Keep the source server and encrypted bundle until balances, subscriptions,
  logs, channels, and payment callbacks have been verified on the target.

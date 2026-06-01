# Docker Compose Fixes for Cosmian KMS v5.20.0

## Issues and Fixes

### 1. Config file conflict with CLI arguments

**Error:**
```
Configuration file found at the default path (/etc/cosmian/kms.toml) but extra command-line
arguments were also provided. When a configuration file is present, all command-line arguments
and environment variables are ignored.
```

**Cause:** The container entrypoint passes default CLI arguments when `COSMIAN_KMS_CONF` is not set. Since our `kms.toml` is mounted at the default path (`/etc/cosmian/kms.toml`), the server detects both a config file and CLI arguments, which is not allowed.

**Fix:** Added `COSMIAN_KMS_CONF=/etc/cosmian/kms.toml` to the environment variables in `docker-compose.yml`. This tells the entrypoint to use the config file and skip default CLI arguments.

### 2. Incorrect SQLite volume mount path

**Cause:** The volume was mounted at `/cosmian-kms/sqlite-data`, but KMS v5.20.0 stores SQLite data at `/var/lib/cosmian-kms/cosmian-kms/sqlite-data`.

**Fix:** Updated the volume mount from `./data:/cosmian-kms/sqlite-data` to `./data:/var/lib/cosmian-kms/cosmian-kms/sqlite-data`.

### 3. Invalid `[database]` section in kms.toml

**Cause:** The `[database]` config section with `type` and `path` keys is not recognized by KMS v5.20.0. The server ignored it and used its default SQLite path.

**Fix:** Removed the `[database]` section from `kms.toml`, letting the server use its default SQLite configuration (which matches the corrected volume mount).

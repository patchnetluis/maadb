# MAADB — systemd deployment (bare metal)

Reference guide for running `maad serve --transport http` under systemd behind an nginx TLS reverse proxy on Linux. Engine-scope only — pick whatever hosting platform, secrets manager, and log aggregation you already use.

## Prerequisites

- Node.js 22+
- Git
- A built MAADB checkout (`npm install && npm run build`) or a published npm install
- A system user to run the service (not root)
- A reverse proxy in front of the engine (nginx here, any proxy works) to terminate TLS

## Layout

```
/opt/maad/
  maadb/                 # built engine (git clone or npm install)
  instance.yaml          # multi-project declaration, or use --project
  data/                  # your project directories
    proj-a/
    proj-b/
/etc/maad/
  env                    # systemd EnvironmentFile (chmod 600, chown maad:maad)
/var/log/maad/
  ops.log                # ops channel (if you redirect stderr here)
  audit.log              # MAAD_AUDIT_PATH target
```

## 1. Create the service user

```bash
sudo useradd --system --home /opt/maad --shell /usr/sbin/nologin maad
sudo mkdir -p /opt/maad /etc/maad /var/log/maad
sudo chown -R maad:maad /opt/maad /var/log/maad
sudo chown root:maad /etc/maad && sudo chmod 750 /etc/maad
```

## 2. Generate a bearer token

The HTTP transport refuses to start without `MAAD_AUTH_TOKEN`. Generate an opaque token with real entropy — this is the single shared secret between every authorized client and the server.

```bash
openssl rand -base64 48 | tr -d '=' | tr '+/' '-_'
```

Rotation is a restart: change the value in `/etc/maad/env`, restart the service. Clients update their copy out-of-band. Per-client tokens and rotation-without-restart are on the roadmap (0.8.5).

## 3. Write the environment file

```ini
# /etc/maad/env   — chmod 600, chown root:maad
MAAD_TRANSPORT=http
MAAD_HTTP_HOST=127.0.0.1
MAAD_HTTP_PORT=7733
MAAD_AUTH_TOKEN=<paste-the-token-from-step-2>
MAAD_INSTANCE=/opt/maad/instance.yaml

# Optional — defaults are sensible, tune for your environment
MAAD_SESSION_IDLE_MS=1800000
MAAD_HTTP_MAX_BODY=1048576
MAAD_HTTP_HEADERS_TIMEOUT_MS=10000
MAAD_HTTP_REQUEST_TIMEOUT_MS=60000
MAAD_HTTP_KEEPALIVE_TIMEOUT_MS=5000
MAAD_SHUTDOWN_TIMEOUT_MS=10000

# Logging — pino writes JSON to stderr by default. Split audit to a file
# if you want an append-only audit trail.
MAAD_LOG_LEVEL=info
MAAD_AUDIT_PATH=/var/log/maad/audit.log
```

Permissions matter: the token leaks if this file is world-readable.

```bash
sudo install -o root -g maad -m 0640 env.example /etc/maad/env
sudo $EDITOR /etc/maad/env
```

## 4. systemd unit

```ini
# /etc/systemd/system/maad.service
[Unit]
Description=MAADB MCP server (HTTP transport)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=maad
Group=maad
WorkingDirectory=/opt/maad/maadb
EnvironmentFile=/etc/maad/env
ExecStart=/usr/bin/node /opt/maad/maadb/dist/cli.js serve

# Graceful shutdown — matches MAAD_SHUTDOWN_TIMEOUT_MS drain budget
KillSignal=SIGTERM
TimeoutStopSec=15

# ops/audit are JSON on stderr by default; journald captures stderr.
# For a separate file, set MAAD_AUDIT_PATH in the env file (above) and
# rely on the app to open that file handle.
StandardOutput=journal
StandardError=journal

# Hardening — loopback bind means no network exposure directly
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/maad /var/log/maad
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true
RestrictRealtime=true

Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Install and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maad
sudo systemctl status maad
journalctl -u maad -f
```

## 5. nginx reverse proxy

TLS terminates at nginx. The engine binds to `127.0.0.1` so it's unreachable from the network except via the proxy.

```nginx
# /etc/nginx/sites-available/maad
server {
    listen 443 ssl http2;
    server_name maad.example.com;

    ssl_certificate     /etc/letsencrypt/live/maad.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/maad.example.com/privkey.pem;

    # Reasonable TLS baseline — tune to your policy
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # SSE requires buffering OFF and a long read timeout. SSE streams
    # can sit idle between server pushes; the proxy must not buffer
    # responses or close idle connections before the engine does.
    location /mcp {
        proxy_pass http://127.0.0.1:7733/mcp;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;

        # Preserve client IP for the engine's audit log.
        # Requires MAAD_TRUST_PROXY=true in /etc/maad/env.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Unauthenticated liveness endpoint — used by orchestrators,
    # uptime monitors, and k8s-style liveness probes. Returns 200
    # when the process is up, 503 during drain.
    location = /healthz {
        proxy_pass http://127.0.0.1:7733/healthz;
        access_log off;
    }
}

# Redirect plaintext to TLS
server {
    listen 80;
    server_name maad.example.com;
    return 301 https://$host$request_uri;
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/maad /etc/nginx/sites-enabled/maad
sudo nginx -t && sudo systemctl reload nginx
```

If you set `MAAD_TRUST_PROXY=true`, make sure nginx is the only path to the engine — untrusted upstream + trust-proxy = client IP spoofing via forged `X-Forwarded-For`. Binding to 127.0.0.1 enforces that.

## 6. Liveness probe

`GET /healthz` is unauthenticated and returns `{ok:true}` when live, `{ok:false, errors:[{code:"SHUTTING_DOWN"}]}` with HTTP 503 during drain. Use it from whatever supervisor you're running.

```bash
curl -fsS http://127.0.0.1:7733/healthz
```

Rich health (project names, document counts, session telemetry) lives in the authenticated `maad_health` MCP tool — liveness ≠ health, by design.

## 7. Log rotation

If you used `MAAD_AUDIT_PATH` to split audit to a file, rotate it with logrotate. Otherwise stderr goes to journald and you rely on journal retention.

```
# /etc/logrotate.d/maad
/var/log/maad/audit.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su maad maad
}
```

`copytruncate` is deliberate — pino keeps the fd open for the life of the process, and we don't want a restart-on-rotate dance.

## 8. Client-side MCP config

This is user responsibility, not engine concern. For reference, the Claude Desktop / Claude Code shape:

```json
{
  "mcpServers": {
    "maad": {
      "transport": { "type": "http", "url": "https://maad.example.com/mcp" },
      "headers": { "Authorization": "Bearer ${MAAD_TOKEN}" }
    }
  }
}
```

The client sets `MAAD_TOKEN` in its environment. Never commit the token into a config file.

## 9. Smoke test

```bash
# From the server (no TLS, direct loopback)
TOKEN=$(sudo awk -F= '/^MAAD_AUTH_TOKEN=/{print $2}' /etc/maad/env)

curl -sS -X POST http://127.0.0.1:7733/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}' -i
```

Expected: `200 OK`, a `mcp-session-id` response header, and a JSON-RPC initialize result on SSE.

Missing/wrong token returns `401 UNAUTHORIZED` before any session state is created — unauthenticated callers can't enumerate session IDs.

## Gotchas

- **Token required at boot.** `--transport http` without `MAAD_AUTH_TOKEN` fails with `AUTH_TOKEN_REQUIRED`. This is intentional.
- **Binding non-loopback.** If you set `MAAD_HTTP_HOST=0.0.0.0`, the engine logs a warning recommending a reverse proxy. Exposing the engine directly to the network is allowed but means clients talk to it without TLS unless you add it yourself.
- **SSE proxy buffering.** Most proxies buffer by default. `proxy_buffering off` in nginx is the common miss — symptoms are "client connects but tools/list hangs."
- **Rotation = restart.** Since the token is a single process-level secret, rotation today is a config edit + `systemctl restart maad`. Drain is bounded by `MAAD_SHUTDOWN_TIMEOUT_MS` (10s default).
- **Graceful shutdown returns 503.** Requests during the drain window get `SHUTTING_DOWN`. `/healthz` reflects the same state so liveness probes fail-fast during restart.

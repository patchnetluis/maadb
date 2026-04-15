# MAADB — Docker deployment

Reference guide for running `maad serve --transport http` in a container behind traefik with TLS. Engine-scope only — pick whatever container orchestrator, secrets store, and log aggregation you already use.

## Prerequisites

- Docker 24+ and Docker Compose v2
- A host with ports 80/443 reachable (for traefik TLS) and a DNS name pointed at it
- An `instance.yaml` or a project directory to mount into the container

## Layout

```
maad-deploy/
  compose.yaml
  Dockerfile                 # build from the maadb source tree, or pull npm
  instance.yaml              # mounted read-only
  data/                      # project directories — mounted read-write
    proj-a/
    proj-b/
  secrets/
    maad_auth_token          # docker secret, chmod 600
  letsencrypt/               # traefik ACME persistence
```

## 1. Generate a bearer token

```bash
mkdir -p secrets
openssl rand -base64 48 | tr -d '=' | tr '+/' '-_' > secrets/maad_auth_token
chmod 600 secrets/maad_auth_token
```

Never put the token in `compose.yaml` or in an env file checked into git. Docker secrets mount the file at `/run/secrets/<name>` inside the container with correct permissions.

## 2. Dockerfile

Multi-stage build — install + build in a heavier image, copy only runtime artifacts into a minimal final stage.

```dockerfile
# Dockerfile
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Non-root runtime. Keep the UID stable so bind-mounted project dirs on the
# host don't need to be chowned after every rebuild.
RUN groupadd -g 10001 maad && useradd -m -u 10001 -g 10001 maad
USER maad
WORKDIR /app

COPY --from=build --chown=maad:maad /src/dist ./dist
COPY --from=build --chown=maad:maad /src/node_modules ./node_modules
COPY --from=build --chown=maad:maad /src/package.json ./package.json

# tini PID 1 so SIGTERM from `docker stop` actually reaches node and triggers
# the graceful-shutdown state machine.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/cli.js", "serve"]

# Liveness target — no auth required, 200 live / 503 draining
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7733/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
```

Build:

```bash
docker build -t maadb:0.5.0 .
```

## 3. Compose stack with traefik

```yaml
# compose.yaml
services:
  traefik:
    image: traefik:v3.2
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedByDefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.email=you@example.com
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.le.acme.tlschallenge=true
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt

  maad:
    image: maadb:0.5.0
    restart: unless-stopped
    environment:
      MAAD_TRANSPORT: http
      MAAD_HTTP_HOST: 0.0.0.0      # safe — traefik is the only ingress
      MAAD_HTTP_PORT: 7733
      MAAD_INSTANCE: /data/instance.yaml
      MAAD_SESSION_IDLE_MS: 1800000
      MAAD_HTTP_MAX_BODY: 1048576
      MAAD_SHUTDOWN_TIMEOUT_MS: 10000
      MAAD_TRUST_PROXY: "true"     # trust X-Forwarded-For from traefik
      MAAD_LOG_LEVEL: info
      MAAD_AUDIT_PATH: /data/logs/audit.log
    # Docker secrets materialize at /run/secrets/<name>. Read the token from
    # that file via MAAD_AUTH_TOKEN_FILE-style pattern, or shell-wrap to export
    # it. Example below uses a small entrypoint wrapper.
    secrets:
      - maad_auth_token
    entrypoint: ["/bin/sh", "-c"]
    command:
      - 'export MAAD_AUTH_TOKEN="$(cat /run/secrets/maad_auth_token)" && exec /usr/bin/tini -- node dist/cli.js serve'
    volumes:
      - ./instance.yaml:/data/instance.yaml:ro
      - ./data:/data
    labels:
      - traefik.enable=true
      - traefik.http.routers.maad.rule=Host(`maad.example.com`)
      - traefik.http.routers.maad.entrypoints=websecure
      - traefik.http.routers.maad.tls.certresolver=le
      - traefik.http.services.maad.loadbalancer.server.port=7733
      # SSE-safe timeouts and no response buffering
      - traefik.http.services.maad.loadbalancer.responseforwarding.flushinterval=100ms
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:7733/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3

secrets:
  maad_auth_token:
    file: ./secrets/maad_auth_token
```

Start:

```bash
docker compose up -d
docker compose logs -f maad
```

## 4. Smoke test

```bash
TOKEN=$(cat secrets/maad_auth_token)

# Liveness — no auth required
curl -fsS https://maad.example.com/healthz

# Initialize — needs bearer
curl -sS -X POST https://maad.example.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}' -i
```

Expected: `200 OK` on initialize with an `mcp-session-id` header. Missing/wrong token returns `401 UNAUTHORIZED` before any session state is created.

## 5. Client-side MCP config

User responsibility. For Claude Code / Claude Desktop:

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

Keep `MAAD_TOKEN` in the client's environment, never in the committed config.

## 6. Rotating the token

Today this is a restart:

```bash
openssl rand -base64 48 | tr -d '=' | tr '+/' '-_' > secrets/maad_auth_token
chmod 600 secrets/maad_auth_token
docker compose up -d --force-recreate maad
```

Clients update their copy out-of-band. In-flight writes get `MAAD_SHUTDOWN_TIMEOUT_MS` to drain before the container exits. Rotation without restart is on the roadmap (0.8.5).

## Gotchas

- **Token required at boot.** `--transport http` without `MAAD_AUTH_TOKEN` fails with `AUTH_TOKEN_REQUIRED`. Don't forget the `export` line in the entrypoint wrapper.
- **Bind host inside the container.** `MAAD_HTTP_HOST=0.0.0.0` is correct here — the container's network namespace is isolated and traefik is the only ingress. The loopback-only warning doesn't apply behind Docker's userland networking.
- **SSE and proxy buffering.** Traefik doesn't buffer response bodies by default, but some orchestrators insert a second proxy. If `tools/list` hangs after `initialize` returns, look for buffering in the ingress chain. The `flushinterval=100ms` label above helps.
- **Git inside the container.** The engine needs git for its audit trail — the Dockerfile installs git in the runtime image. Bind-mounted project dirs must include `.git/`. First boot on an empty dir will `git init` automatically.
- **tini as PID 1.** Without it, `docker stop` sends SIGTERM to node but node may not propagate it through the shell wrapper. tini makes the drain → exit cycle reliable.
- **Non-root UID mapping.** The image runs as UID 10001. If your host project directories are owned by a different UID, either chown them or adjust the `maad` user in the Dockerfile before building.
- **HEALTHCHECK during drain.** `/healthz` returns 503 `SHUTTING_DOWN` while draining — orchestrators will mark the container unhealthy and stop routing traffic to it during restart. That's intentional.

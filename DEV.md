# Developer Guide

Everything you need to run HackHub locally and contribute.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Docker Desktop | 4.x+ | Runs the full stack |
| Java | 21 | Backend development |
| Node.js | 20+ | Frontend development |
| Maven | 3.9 (bundled via `mvnw`) | Backend builds |

## Quick Start (Docker Compose)

```bash
# 1. Clone and enter the repo
git clone https://github.com/HackHub-wtf/app.git && cd app

# 2. Configure environment
cp .env.example .env
./scripts/generate-jwt-keys.sh   # writes JWT_PRIVATE_KEY + JWT_PUBLIC_KEY into .env

# 3. Start the stack
docker compose up -d

# 4. First-run setup (WordPress-style installer)
./scripts/install.sh

# 5. Open the app
open http://localhost
```

### Enterprise proxy for Docker builds (optional)

Docker build steps do not inherit the host proxy automatically. Compose uses
`HTTP_PROXY`/`HTTPS_PROXY` when present; `DOCKER_BUILD_*` overrides them when a
Docker-reachable endpoint is needed. If Maven or npm must go through an
enterprise proxy, provide the endpoint and the CA certificate used for TLS
inspection:

```bash
export DOCKER_BUILD_HTTP_PROXY=http://host.docker.internal:3128
export DOCKER_BUILD_HTTPS_PROXY=http://host.docker.internal:3128
export DOCKER_BUILD_NO_PROXY=localhost,127.0.0.1
export CORPORATE_CA_FILE=/absolute/path/to/enterprise-proxy-ca.crt

docker compose build
```

Compose exposes `host.docker.internal` to the build container, translates a
host-loopback proxy URL for the build, and mounts the CA only during the build.
The certificate is not stored in the repository or copied into the runtime
images. Leave these variables unset for a direct public-network build.

Both Dockerfiles use BuildKit's bundled frontend, avoiding an extra pull of
`docker/dockerfile` before the build starts. Use a recent Docker Engine with
BuildKit support for heredocs and secret/cache mounts.

If loading a base image fails with `Proxy authentication required`, configure
the Docker daemon or the selected BuildKit builder with a working authenticated
proxy. The Compose `DOCKER_BUILD_*` variables above only affect commands inside
build containers; they do not configure registry access for the builder.
See https://docs.docker.com/engine/daemon/proxy/ for Docker daemon configuration.

On this Linux workstation, if the logged-in user's local proxy works but Docker
still receives HTTP 407, use the user-proxy build helper from the repository root:

```bash
python3 scripts/build-with-user-proxy.py
docker compose up -d --no-build
```

This requires Python 3.8+, access to the local Docker Engine, and an authenticated
HTTP proxy at `127.0.0.1:3128`. Missing official Docker Hub base images are
downloaded through that proxy, SHA-256 verified, and imported into Docker. During
the build, a temporary relay binds to the Docker bridge and forwards requests
through the user's local proxy. It stops when the build exits. This does not
change Docker's global proxy configuration; ordinary `docker pull` may still
need the daemon's proxy authentication repaired. Use the helper again for future
builds while that daemon issue persists.

## Manual Dev Mode (hot reload)

Requires Postgres + MinIO running:
```bash
docker compose up -d postgres minio
```

**Backend** (port 8080):
```bash
cd hackhub-api
cp src/main/resources/application.yml src/main/resources/application-local.yml
# edit application-local.yml for local DB URL if needed
./mvnw spring-boot:run
```

**Frontend** (port 5173):
```bash
cd hackhub-app
npm install
cp .env.example .env.local
# set VITE_API_BASE_URL=http://localhost:8080
npm run dev
```

## Port Map

| Port | Service |
|------|---------|
| 80 | React app (nginx, production build) |
| 5173 | React app (Vite dev server) |
| 8080 | Spring Boot API |
| 8081 | Spring Boot actuator (health, metrics) |
| 5432 | PostgreSQL |
| 9000 | MinIO S3 API |
| 9001 | MinIO web console |

## Seed Data

```bash
# First-run wizard (creates admin, optional demo data)
./scripts/install.sh --demo

# Dev seed only (adds demo org, hackathon, 5 users)
./scripts/seed-dev.sh

# Full reset (drops all data, restarts stack)
./scripts/reset.sh
```

## Database

Schema managed by Flyway. Migrations in `hackhub-api/src/main/resources/db/migration/`.

On startup the API runs all pending migrations automatically (`spring.flyway.enabled=true`).

Adding a migration:
```bash
# Name format: V{next_number}__{description}.sql
touch hackhub-api/src/main/resources/db/migration/V009__my_change.sql
```

Never modify an existing migration — always add a new one.

## Tests

```bash
# Frontend (Vitest + jsdom)
cd hackhub-app
npm test                     # run all tests
npm run build                # type check + bundle (fails on type errors)

# Backend (JUnit 5 + Mockito, JaCoCo coverage gate at 78%)
cd hackhub-api
./mvnw test -DskipSpotlessCheck          # unit tests
./mvnw verify -DskipSpotlessCheck        # unit + JaCoCo report
./mvnw test -DskipSpotlessCheck -Pintegration   # includes TestContainers IT
```

## CI/CD

GitHub Actions runs on every push to `main` and all PRs:
- `ci.yml` — lint, test, coverage upload to Codecov
- `build.yml` — Docker image build check

See `.github/workflows/` for details.

## Architecture Decisions

See `docs/architecture/` for Mermaid diagrams covering:
- Data model (ERD)
- Auth flow
- Multi-tenancy model
- Real-time (STOMP/WebSocket)
- Hackathon lifecycle state machine

Key decisions:
- **Spring Boot** — Clean Architecture layers, type-safe JPA, built-in security
- **Flyway** — versioned migrations, never ORM-managed schema
- **STOMP over Socket.io** — native Spring WebSocket, no extra server
- **MinIO** — S3-compatible, self-hostable file storage
- **Mantine 8** — comprehensive component library, accessible, Tailwind-compatible theming

## Troubleshooting

**JWT key format errors on startup:**
```bash
./scripts/generate-jwt-keys.sh  # regenerates keys in .env
docker compose restart api
```

**Flyway migration conflict (`Found more than one migration`):**
Check that no two files share the same version number in `db/migration/`.

**CORS errors in browser:**
Verify `APP_CORS_ALLOWED_ORIGINS` in `.env` includes your frontend origin
(e.g. `http://localhost:5173,http://localhost`).

**Port 8080 already in use:**
```bash
lsof -ti:8080 | xargs kill -9
docker compose restart api
```

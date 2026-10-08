# =============================================================================
# PromptVault Lite — Web/LAN-Server (issue #126 / H1, epic #97)
#
# Multi-stage Build: Rust-Server + Vite-UI → schlankes Runtime-Image.
# Der Server liefert die gebaute UI aus und exponiert /api (read-only
# Default). Kein Root-User, kein Package-Manager im Runtime-Image.
#
# Build:  docker build -f deploy/Dockerfile -t promptvault-server .
# Run:    docker run -p 8080:8080 \
#           -v /pfad/zum/vault:/vault:ro \
#           -e PROMPTVAULT_SERVER_VAULT=/vault \
#           promptvault-server
# =============================================================================

# --- Stage 1: Rust-Server bauen ---------------------------------------------
FROM rust:1.85-slim AS rust-build
WORKDIR /build
# minimale System-Abhängigkeiten (keine GUI-Libs — der Server ist headless)
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && \
    rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
# Workspace-Manifest: src-tauri ist Workspace-Member und muss für die
# Manifest-Auflösung samt Library-Target-Root vorhanden sein (gebaut wird per
# -p ausschließlich der Server).
COPY src-tauri/Cargo.toml ./src-tauri/Cargo.toml
COPY src-tauri/src/lib.rs ./src-tauri/src/lib.rs
COPY crates ./crates
RUN cargo build --release -p promptvault-server

# --- Stage 2: Web-UI bauen ----------------------------------------------------
FROM node:22-slim AS ui-build
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
RUN pnpm build

# --- Stage 3: Runtime ----------------------------------------------------------
FROM debian:12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --system --uid 10001 --create-home --home-dir /home/promptvault promptvault
COPY --from=rust-build /build/target/release/promptvault-server /usr/local/bin/promptvault-server
COPY --from=ui-build /build/dist /opt/promptvault/ui
ENV PROMPTVAULT_SERVER_HOST=0.0.0.0 \
    HOME=/home/promptvault \
    PROMPTVAULT_SERVER_PORT=8080 \
    PROMPTVAULT_SERVER_STATIC=/opt/promptvault/ui \
    PROMPTVAULT_SERVER_READ_ONLY=1
# Vault wird per Volume gemountet (read-only empfohlen: :ro)
VOLUME ["/vault"]
EXPOSE 8080
USER promptvault
ENTRYPOINT ["/usr/local/bin/promptvault-server"]

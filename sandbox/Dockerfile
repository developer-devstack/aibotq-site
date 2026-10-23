# Sandbox image for aibotq.dev chat tools. Shim tag must match the installed @cloudflare/sandbox version.
FROM docker.io/cloudflare/sandbox:1.0.3 AS sandbox-tools
FROM node:24-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates curl git coreutils && rm -rf /var/lib/apt/lists/*
COPY --from=sandbox-tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN mkdir -p /workspace
WORKDIR /workspace
CMD ["sleep", "infinity"]

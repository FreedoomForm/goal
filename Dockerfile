# ──────────────────────────────────────────────────────────────
# AegisOps Local AI — server container
# Builds the headless Node server (server/standalone.js), no Electron.
# ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS base

ENV NODE_ENV=production \
    PORT=18090 \
    BIND=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better Docker layer caching)
COPY aegisops_app/package.json aegisops_app/package-lock.json* ./aegisops_app/
RUN cd aegisops_app \
 && npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
 && npm cache clean --force

# Copy source
COPY aegisops_app ./aegisops_app

# Drop root
RUN useradd --system --create-home --uid 1001 aegisops \
 && chown -R aegisops:aegisops /app
USER aegisops

EXPOSE 18090 18091

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+ (process.env.PORT||18090) + '/healthz', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "aegisops_app/server/standalone.js"]

# A4 backend (apps/server) — built from the repo root so pnpm workspace
# packages (@a4/shared-schemas) are available. Runtime is tsx, matching dev:
# workspace packages export raw TypeScript, so there is no compile step.
FROM node:20-slim

WORKDIR /app

RUN corepack enable

# Install with the full workspace manifest so the lockfile resolves, but only
# the server's dependency subtree is downloaded
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared-schemas/package.json packages/shared-schemas/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/ui/package.json packages/ui/
COPY packages/tailwind-config/package.json packages/tailwind-config/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN pnpm install --frozen-lockfile --filter @a4/server...

COPY packages/shared-schemas packages/shared-schemas
COPY packages/shared-types packages/shared-types
COPY apps/server apps/server

WORKDIR /app/apps/server
RUN chmod +x start.sh

ENV NODE_ENV=production
EXPOSE 4000

CMD ["./start.sh"]

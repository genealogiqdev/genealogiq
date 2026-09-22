# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/app/package.json apps/app/package.json
COPY apps/bms/package.json apps/bms/package.json
COPY apps/seq/package.json apps/seq/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS workspace

COPY . .
RUN pnpm db:generate

FROM workspace AS app-build

ARG APP
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG SENTRY_ORG
ARG SENTRY_PROJECT

ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

RUN test "$APP" = "app" || test "$APP" = "bms" || test "$APP" = "seq"
RUN pnpm --filter "@genealogiq/$APP" build
RUN mkdir -p /output/apps/$APP/.next \
    && cp -R "apps/$APP/.next/standalone/." /output/ \
    && cp -R "apps/$APP/.next/static" "/output/apps/$APP/.next/static" \
    && if [ -d "apps/$APP/public" ]; then cp -R "apps/$APP/public" "/output/apps/$APP/public"; fi \
    && for package in node_modules/.pnpm/@swc+helpers@*; do \
         target="/output/$package/node_modules/@swc/helpers"; \
         mkdir -p "$target"; \
         cp -R "$package/node_modules/@swc/helpers/." "$target/"; \
       done \
    && printf '#!/bin/sh\nexec node "apps/%s/server.js"\n' "$APP" > /output/start.sh \
    && chmod +x /output/start.sh

FROM node:22-bookworm-slim AS app-runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=app-build --chown=nextjs:nodejs /output/ ./

USER nextjs
EXPOSE 3000
CMD ["/app/start.sh"]

FROM workspace AS migration

ENV NODE_ENV=production
CMD ["pnpm", "db:migrate:deploy"]

FROM workspace AS migration-baseline

ENV NODE_ENV=production
RUN sed -i 's/\r$//' scripts/azure/baseline-migrations.sh \
    && chmod +x scripts/azure/baseline-migrations.sh
CMD ["/workspace/scripts/azure/baseline-migrations.sh"]

FROM node:22-bookworm-slim AS scheduler

ENV NODE_ENV=production
WORKDIR /job
COPY scripts/azure/run-bms-daily-job.mjs ./
USER node
CMD ["node", "/job/run-bms-daily-job.mjs"]

FROM postgres:17-alpine AS database-transfer

COPY scripts/azure/transfer-database.sh /usr/local/bin/transfer-database
RUN sed -i 's/\r$//' /usr/local/bin/transfer-database \
    && chmod +x /usr/local/bin/transfer-database
ENTRYPOINT ["/usr/local/bin/transfer-database"]

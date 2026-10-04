# Imagen parametrizada: el workflow construye una imagen independiente por worker.
ARG NODE_IMAGE=node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81

FROM ${NODE_IMAGE} AS build
ARG WORKER
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY workers/${WORKER}/package.json workers/${WORKER}/package.json
RUN pnpm install --frozen-lockfile

COPY workers/${WORKER} workers/${WORKER}
RUN pnpm --filter "@workers/${WORKER}" build
RUN pnpm --filter "@workers/${WORKER}" deploy --prod --legacy /runtime

FROM ${NODE_IMAGE} AS runtime
ARG WORKER
ARG SOURCE_COMMIT=unknown
ARG REPO_URL=https://github.com/nicolasjones/automation-platform-template

RUN addgroup -S worker && adduser -S worker -G worker
WORKDIR /app
COPY --from=build /runtime/ ./
COPY --from=build /workspace/workers/${WORKER}/dist ./dist

LABEL org.opencontainers.image.title="worker-${WORKER}" \
      org.opencontainers.image.source="${REPO_URL}" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.vendor="Agenmatica"

USER worker
CMD ["node", "dist/index.js"]

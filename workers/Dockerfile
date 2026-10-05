# Imagen parametrizada: el workflow construye una imagen independiente por worker.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

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
# El runtime solo ejecuta "node dist/index.js" — nunca invoca npm/corepack.
# El npm que trae empaquetado la imagen base de Node arrastra su propio
# árbol de dependencias (tar, undici, ip-address, brace-expansion,
# http-cache-semantics), fuente de vulnerabilidades que docker scout
# bloquea sin que el código de la aplicación las use nunca.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=build /runtime/ ./
COPY --from=build /workspace/workers/${WORKER}/dist ./dist

LABEL org.opencontainers.image.title="worker-${WORKER}" \
      org.opencontainers.image.source="${REPO_URL}" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.vendor="nicolasjones"

USER worker
CMD ["node", "dist/index.js"]

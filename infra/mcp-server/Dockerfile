FROM node:24-alpine

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ia/package.json packages/ia/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
RUN pnpm install --frozen-lockfile

COPY packages/ia packages/ia
COPY packages/mcp-server packages/mcp-server

ARG MCP_SERVER_PORT=8787
EXPOSE $MCP_SERVER_PORT

CMD ["pnpm", "--filter", "@platform/mcp-server", "dev"]

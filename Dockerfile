FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY app ./app
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/piring-kita.sqlite
VOLUME ["/data"]
EXPOSE 3000
CMD ["bun", "run", "--cwd", "app/backend", "start"]

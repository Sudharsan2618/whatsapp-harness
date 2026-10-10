# syntax=docker/dockerfile:1

# Install dependencies (including tsx, used to run the TypeScript server directly).
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Runtime image.
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public
COPY sql ./sql

# Cloud Run injects PORT (default 8080); the server reads process.env.PORT.
EXPOSE 8080
CMD ["npm", "run", "start:prod"]

# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.15.1

################################################################################
# Base stage with Node.js
FROM node:${NODE_VERSION}-alpine as base

# Install build dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /usr/src/app

################################################################################
# Dependencies stage - install production dependencies
FROM base as deps

# Copy package files from mev-bot-server directory
COPY mev-bot-server/package.json mev-bot-server/package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

################################################################################
# Build stage - compile TypeScript and generate Prisma client
FROM deps as build

# Copy Prisma schema (shared at root level for all projects)
COPY prisma ./prisma

# Copy source files from mev-bot-server directory
# Keep mev-bot-server structure to match local dev paths (mev-bot-server/src -> mev-bot-server/src)
COPY mev-bot-server/tsconfig.json ./mev-bot-server/
COPY mev-bot-server/scripts ./mev-bot-server/scripts
COPY mev-bot-server/src ./mev-bot-server/src
COPY mev-bot-server/package.json ./mev-bot-server/

# Generate Prisma client (prisma is at ./prisma, matches local ../prisma structure)
# From mev-bot-server/src/config: ../../../prisma resolves to /usr/src/app/prisma
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build the application
# Change to mev-bot-server directory to match local structure
WORKDIR /usr/src/app/mev-bot-server
RUN npm run copy:assets && npx tsc

################################################################################
# Production dependencies stage
FROM base as prod-deps

# Copy package files from mev-bot-server directory
COPY mev-bot-server/package.json mev-bot-server/package-lock.json ./

# Install only production dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

################################################################################
# Final production image
FROM base as final

# Set production environment
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files from mev-bot-server directory
COPY mev-bot-server/package.json mev-bot-server/package-lock.json ./

# Copy production dependencies
COPY --from=prod-deps --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules

# Set working directory to mev-bot-server to match local structure
WORKDIR /usr/src/app/mev-bot-server

# Copy Prisma schema and generated client (at root level for sharing)
# Copy to /usr/src/app/prisma (parent of mev-bot-server) to match local structure
WORKDIR /usr/src/app
COPY --chown=nodejs:nodejs --from=build /usr/src/app/prisma ./prisma
WORKDIR /usr/src/app/mev-bot-server
COPY --from=build --chown=nodejs:nodejs /usr/src/app/node_modules/.prisma ./node_modules/.prisma
# Copy Prisma CLI for migrations (from build stage where devDependencies are installed)
COPY --from=build --chown=nodejs:nodejs /usr/src/app/node_modules/prisma ./node_modules/prisma

# Copy built application
COPY --from=build --chown=nodejs:nodejs /usr/src/app/mev-bot-server/dist ./dist

# Note: prisma/generated is already copied above, so dist/config/db.js can import it
# (dist/config/db.js imports ../../../prisma/generated/prisma/client)
# The path goes from dist/config/ -> dist/ -> root -> prisma/generated/prisma/

# Switch to non-root user
USER nodejs

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check (optional - remove if you don't have a health endpoint)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run the application
CMD ["node", "dist/index.js"]

FROM node:24-alpine AS collection-builder
WORKDIR /workspace

COPY . .
ARG VITE_RELAY_URL=/relay
ENV VITE_RELAY_URL=${VITE_RELAY_URL}
# The registry drives dependency installation, builds and collection staging.
RUN node scripts/build-collection.mjs --install --build /collection

FROM node:24-alpine AS relay-builder
WORKDIR /relay
COPY relay/package*.json ./
RUN npm ci --no-audit --no-fund
COPY relay/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/collection MAX_CLIENTS_PER_ROOM=4
COPY --from=relay-builder /relay/dist ./dist
COPY --from=relay-builder /relay/node_modules ./node_modules
COPY --from=relay-builder /relay/package.json ./
COPY --from=collection-builder /collection/ /collection/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8080') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]

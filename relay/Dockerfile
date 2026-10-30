FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:' + (process.env.PORT || '8080') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
USER node
CMD ["node", "dist/server.js"]

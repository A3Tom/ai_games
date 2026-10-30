FROM node:24-alpine AS builder
WORKDIR /workspace

COPY . .
ARG VITE_RELAY_URL=/relay
ENV VITE_RELAY_URL=${VITE_RELAY_URL}
# The registry drives dependency installation, builds and collection staging.
RUN node scripts/build-collection.mjs --install --build /collection

FROM nginx:1.28-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /collection/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q --spider http://127.0.0.1/ || exit 1

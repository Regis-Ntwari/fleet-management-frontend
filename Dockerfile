# syntax=docker/dockerfile:1.7

# ---- Build stage -----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Vite inlines VITE_* variables at build time. Defaults produce the demo build
# that runs against the in-browser mock API; override for a real backend, e.g.
#   docker build --build-arg VITE_USE_MOCK_API=false --build-arg VITE_API_BASE_URL= .
# (an empty base URL means same-origin, so nginx can proxy /api/ to the backend).
ARG VITE_API_BASE_URL=
ARG VITE_USE_MOCK_API=true
ARG VITE_MOCK_LATENCY_MIN=120
ARG VITE_MOCK_LATENCY_MAX=420
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_USE_MOCK_API=$VITE_USE_MOCK_API \
    VITE_MOCK_LATENCY_MIN=$VITE_MOCK_LATENCY_MIN \
    VITE_MOCK_LATENCY_MAX=$VITE_MOCK_LATENCY_MAX

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime stage ---------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Runtime-configurable upstream for /api/ (only used when the bundle was built
# with VITE_USE_MOCK_API=false and an empty VITE_API_BASE_URL).
ENV API_UPSTREAM=http://backend:8080 \
    NGINX_PORT=8080

RUN rm /etc/nginx/conf.d/default.conf \
    && apk add --no-cache curl
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${NGINX_PORT}/healthz || exit 1

# The official image renders /etc/nginx/templates/*.template with envsubst on
# start, then runs nginx in the foreground.

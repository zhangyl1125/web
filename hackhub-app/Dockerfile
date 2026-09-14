# Use BuildKit's bundled Dockerfile frontend to avoid an extra Docker Hub pull.

# Multi-stage: build React app, serve with Nginx

FROM node:20-alpine AS builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

# Build-only proxy settings. They are not present in the runtime image.
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY} \
    http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    no_proxy=${NO_PROXY} \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

WORKDIR /app

COPY package*.json .npmrc ./
RUN --mount=type=secret,id=corporate-ca,required=false \
    normalize_proxy() { \
      printf '%s' "$1" | sed \
        -e 's#://127\\.0\\.0\\.1:#://host.docker.internal:#' \
        -e 's#://localhost:#://host.docker.internal:#' \
        -e 's#@127\\.0\\.0\\.1:#@host.docker.internal:#' \
        -e 's#@localhost:#@host.docker.internal:#'; \
    } && \
    export HTTP_PROXY="$(normalize_proxy "${HTTP_PROXY:-}")" \
      HTTPS_PROXY="$(normalize_proxy "${HTTPS_PROXY:-}")" \
      http_proxy="$(normalize_proxy "${http_proxy:-}")" \
      https_proxy="$(normalize_proxy "${https_proxy:-}")" && \
    if [ -s /run/secrets/corporate-ca ]; then \
      apk add --no-cache ca-certificates && \
      cp /run/secrets/corporate-ca /usr/local/share/ca-certificates/corporate-proxy-ca.crt && \
      update-ca-certificates; \
    fi && \
    npm ci --frozen-lockfile

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# nginx.conf lives alongside this Dockerfile in the app/ build context
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN addgroup -S hackhub && adduser -S hackhub -G hackhub \
    && chown -R hackhub:hackhub /usr/share/nginx/html \
    && chown -R hackhub:hackhub /var/cache/nginx \
    && chown -R hackhub:hackhub /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown hackhub:hackhub /var/run/nginx.pid

USER hackhub
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

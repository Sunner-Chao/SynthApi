# syntax=docker/dockerfile:1.7
FROM golang:1.26.5-alpine AS backend-builder

ARG VERSION=0.1.173
ARG COMMIT=hotfix
ARG DATE

ENV GOPROXY=https://goproxy.cn,direct
ENV GOSUMDB=sum.golang.google.cn
ENV GOMAXPROCS=1
ENV GOMEMLIMIT=900MiB

RUN apk add --no-cache git ca-certificates tzdata
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,id=sub2api-gomod,target=/go/pkg/mod go mod download
COPY backend/ ./
RUN --mount=type=cache,id=sub2api-gomod,target=/go/pkg/mod \
    --mount=type=cache,id=sub2api-gobuild,target=/root/.cache/go-build \
    DATE_VALUE="${DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -p=1 \
    -tags embed \
    -ldflags="-s -w -X main.Version=${VERSION} -X main.Commit=${COMMIT} -X main.Date=${DATE_VALUE} -X main.BuildType=release" \
    -trimpath \
    -o /app/sub2api \
    ./cmd/server

FROM synthapi:local
COPY --from=backend-builder --chown=sub2api:sub2api /app/sub2api /app/sub2api

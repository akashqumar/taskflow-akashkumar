# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy module files and download deps first (layer caching)
COPY go.mod ./
RUN go mod download || true

# Copy source and let go mod tidy resolve everything
COPY . .
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o server ./cmd/server

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy binary and migrations
COPY --from=builder /app/server .
COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

CMD ["./server"]

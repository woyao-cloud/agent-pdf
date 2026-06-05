# 多阶段构建（自动解析 go.sum）
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY pb/ ./pb/
RUN go mod tidy
COPY client/ ./client/
RUN CGO_ENABLED=0 GOOS=linux go build -o /client ./client

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /client /client
CMD ["/client"]
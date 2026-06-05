# 多阶段构建（自动解析 go.sum）
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY pb/ ./pb/
RUN go mod tidy
COPY stock-server/ ./stock-server/
RUN CGO_ENABLED=0 GOOS=linux go build -o /stock-server ./stock-server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /stock-server /stock-server
EXPOSE 50052
CMD ["/stock-server"]
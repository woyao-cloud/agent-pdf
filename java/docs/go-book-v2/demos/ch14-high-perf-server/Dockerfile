FROM golang:1.21-alpine AS builder

WORKDIR /app

# 安装依赖
COPY go.mod .
COPY go.sum ./
RUN go mod download

# 编译
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/gateway .

# 运行镜像
FROM alpine:3.19
RUN apk --no-cache add ca-certificates

WORKDIR /app
COPY --from=builder /app/gateway .

EXPOSE 8080 6060

ENTRYPOINT ["./gateway"]
CMD ["-addr", ":8080", "-rate", "100", "-burst", "200"]
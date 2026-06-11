FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.mod
COPY main.go main.go
COPY collector/ collector/
RUN go mod tidy && go build -o exporter .

FROM alpine:3.18
WORKDIR /app
COPY --from=builder /app/exporter .
EXPOSE 9300
CMD ["./exporter"]
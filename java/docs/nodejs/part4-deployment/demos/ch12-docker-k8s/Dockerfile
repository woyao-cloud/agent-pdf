# ===== Builder Stage =====
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

# ===== Production Stage =====
FROM node:20-alpine
WORKDIR /app

# 安装 PM2
RUN npm install -g pm2 && pm2 install pm2-logrotate

# 从 builder 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY ecosystem.config.js ./

# 安全：非 root 用户运行
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# 使用 PM2 启动
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
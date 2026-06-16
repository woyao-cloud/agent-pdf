/**
 * config.macro.ts — 编译期配置注入宏
 *
 * 在编译时从环境变量和构建参数生成配置对象，
 * 避免运行时读取环境变量的开销，同时确保
 * 敏感配置不会泄露到源代码中。
 */

/**
 * 编译时读取环境变量。
 * 在 Bun 构建时，该函数读取 process.env 中的值，
 * 并将结果直接内联到代码中。
 *
 * @param key - 环境变量名称
 * @param defaultValue - 默认值（可选）
 * @returns 环境变量的值
 */
export function env(key: string, defaultValue?: string): string {
  return process.env[key] ?? defaultValue ?? ""
}

/**
 * 编译时生成应用配置对象。
 * 合并环境变量、构建参数和默认配置。
 */
export function buildConfig(): Record<string, unknown> {
  return {
    // 构建时信息
    buildTime: new Date().toISOString(),
    buildVersion: process.env.BUILD_VERSION || "0.0.0",
    buildEnvironment: process.env.NODE_ENV || "development",

    // API 配置
    apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
    apiTimeout: parseInt(process.env.API_TIMEOUT || "5000", 10),
    apiRetryCount: parseInt(process.env.API_RETRY_COUNT || "3", 10),

    // 功能开关 — 编译时确定，运行时不能更改
    features: {
      enableAnalytics: process.env.ENABLE_ANALYTICS === "true",
      enableDarkMode: process.env.ENABLE_DARK_MODE !== "false",
      enableNewDashboard: process.env.ENABLE_NEW_DASHBOARD === "true",
      enableBetaFeatures: process.env.ENABLE_BETA === "true",
    },

    // 日志配置
    logging: {
      level: process.env.LOG_LEVEL || "info",
      enableConsole: process.env.LOG_CONSOLE !== "false",
      enableFileLogging: process.env.LOG_FILE === "true",
    },

    // 缓存配置
    cache: {
      ttl: parseInt(process.env.CACHE_TTL || "3600", 10),
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || "100", 10),
    },
  }
}

/**
 * 编译时生成数据库连接配置。
 * 从环境变量中读取数据库连接信息。
 */
export function dbConfig(): Record<string, unknown> {
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "app",
    user: process.env.DB_USER || "app",
    password: process.env.DB_PASSWORD || "",
    ssl: process.env.DB_SSL === "true",
    poolSize: parseInt(process.env.DB_POOL_SIZE || "10", 10),
    connectionTimeout: parseInt(
      process.env.DB_CONNECTION_TIMEOUT || "5000",
      10
    ),
  }
}

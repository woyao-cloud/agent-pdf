module.exports = {
  apps: [{
    name: 'docker-k8s-demo',
    script: 'dist/app.js',
    instances: 'max',         // 使用所有 CPU 核心
    exec_mode: 'cluster',     // Cluster 模式
    max_memory_restart: '300M',
    shutdown_with_message: true,
    kill_timeout: 5000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    },
  }],
};
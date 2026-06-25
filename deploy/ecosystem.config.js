module.exports = {
  apps: [{
    name: 'escape-api',
    script: 'server.js',
    cwd: '/opt/escape/backend',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      HOST: '0.0.0.0',
      DB_PATH: '/opt/escape/backend/data/escape.db',
      UPLOAD_DIR: '/opt/escape/backend/uploads',
    },
    env_file: '/opt/escape/backend/.env',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    error_file: '/opt/escape/logs/api-error.log',
    out_file: '/opt/escape/logs/api-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
  }]
};

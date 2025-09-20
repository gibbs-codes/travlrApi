// PM2 Process Manager Configuration
// Production deployment configuration for TravlrAPI

module.exports = {
  apps: [{
    name: 'travlrapi',
    script: 'src/server.js',
    
    // Clustering configuration
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    
    // Environment configurations
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3000,
      MONGODB_URI: process.env.STAGING_MONGODB_URI
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000,
      MONGODB_URI: process.env.MONGODB_URI
    },
    
    // Logging configuration
    error_file: 'logs/pm2-err.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Memory and performance settings
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Auto-restart configuration
    autorestart: true,
    watch: false, // Set to true for development, false for production
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Health monitoring
    health_check_grace_period: 30000,
    
    // Cron restart (optional - restart daily at 2 AM)
    cron_restart: '0 2 * * *'
  }],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: ['production-server-1', 'production-server-2'],
      ref: 'origin/main',
      repo: 'git@github.com:gibbs-codes/travlrApi.git',
      path: '/var/www/travlrapi',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'ForwardAgent=yes'
    },
    staging: {
      user: 'deploy',
      host: 'staging-server',
      ref: 'origin/staging',
      repo: 'git@github.com:gibbs-codes/travlrApi.git',
      path: '/var/www/travlrapi-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging'
    }
  }
};
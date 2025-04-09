module.exports = {
  apps: [
    {
      name: 'exchange-engine',
      script: './build/api.bundle.js',
      instances: '4',
      max_memory_restart: '4G',
      max_restarts: '5',
      restart_delay: '10',
      exec_mode: 'cluster',
      merge_logs: true,
    },
  ],
};

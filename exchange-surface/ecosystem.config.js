module.exports = {
  apps: [
    {
      name: 'exchange-surface',
      script: './build/surface.bundle.js',
      instances: '4',
      max_memory_restart: '2G',
      max_restarts: '5',
      restart_delay: '10',
      exec_mode: 'cluster',
      merge_logs: true,
    },
  ],
};

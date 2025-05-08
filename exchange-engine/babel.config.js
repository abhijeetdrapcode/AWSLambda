module.exports = {
  presets: ['@babel/preset-env'],
  plugins: [
    ['@babel/plugin-transform-runtime'],
    ['transform-remove-console', { exclude: ['log', 'error', 'warn'] }], //TODO: Remove 'log' from exclude list on Production ENV.
  ],
};

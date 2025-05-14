require('events').EventEmitter.defaultMaxListeners = 25;
// For LangChain
require('./langchain-polyfill.js');
// dot env
require('dotenv').config();
require('@babel/register')({
  presets: ['@babel/preset-env'],
});
require('./server');

require('web-streams-polyfill/dist/polyfill.js');
require('core-js/modules/web.structured-clone.js');
const fetch = require('node-fetch');
if (!globalThis.fetch) globalThis.fetch = fetch;

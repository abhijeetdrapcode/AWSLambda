const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const externalApiMiddleware = new Schema(
  {
    uuid: String,
    url: String,
    headers: [Object],
    params: [Object],
    collectionName: String,
    query: { type: Object },
    projectId: String,
  },
  {
    timestamp: true,
  },
);

export default mongoose.model('ExternalApiMiddlewares', externalApiMiddleware);

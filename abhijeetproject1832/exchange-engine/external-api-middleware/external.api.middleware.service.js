require('./external.api.middleware.model');
import { v4 as uuidv4 } from 'uuid';

export const saveExternalApiMiddlewareService = async (db, data) => {
  data.uuid = uuidv4();
  const ExternalApiMiddleware = db.model('ExternalApiMiddlewares');
  const externalApiMiddlewareInstance = new ExternalApiMiddleware(data);
  return await externalApiMiddlewareInstance.save();
};

export const findExternalApiMiddlewareService = async (db, query) => {
  const ExternalApiMiddleware = db.model('ExternalApiMiddlewares');
  return await ExternalApiMiddleware.findOne(query).exec();
};

import express from 'express';
import {
  saveExternalApiMiddleware,
  findExternalApiMiddleware,
  getCollectionItemsOfExternalApiMiddleware,
} from './external.api.middleware.controller';
import checkdb from './../middleware/dbchecking.middleware'

const externalApiMiddlewareRoute = express.Router();

externalApiMiddlewareRoute.get('/:externalApiMiddlewareId', checkdb, findExternalApiMiddleware);
externalApiMiddlewareRoute.post('/', checkdb, saveExternalApiMiddleware);
externalApiMiddlewareRoute.get(
  '/:externalApiMiddlewareId/collection-items', checkdb,
  getCollectionItemsOfExternalApiMiddleware,
);

export default externalApiMiddlewareRoute;

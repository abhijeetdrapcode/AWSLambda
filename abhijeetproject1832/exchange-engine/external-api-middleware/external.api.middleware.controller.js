import {
  saveExternalApiMiddlewareService,
  findExternalApiMiddlewareService,
} from './external.api.middleware.service';
import { getItemsByQueryWithPagination } from '../item/item.service';

export const saveExternalApiMiddleware = async (req, res, next) => {
  try {
    const { db, body } = req;
    const data = await saveExternalApiMiddlewareService(db, body);
    res.status(200).send(data);
  } catch (err) {
    console.error(err);
    next(err);
  }
};

export const findExternalApiMiddleware = async (req, res, next) => {
  try {
    const { db, params } = req;
    const data = await findExternalApiMiddlewareService(db, {
      uuid: params.externalApiMiddlewareId,
    });
    res.status(200).send(data);
  } catch (err) {
    next(err);
  }
};

export const getCollectionItemsOfExternalApiMiddleware = async (req, res, next) => {
  try {
    const { builderDB, db, projectId, params } = req;
    const externalApiMiddlewareData = await findExternalApiMiddlewareService(db, {
      uuid: params.externalApiMiddlewareId,
    });
    if (!externalApiMiddlewareData) {
      throw new Error('External api midddleware not found.');
    }
    const { limit, page } = req.query;
    const { query, collectionName } = externalApiMiddlewareData;
    const result = await getItemsByQueryWithPagination(
      builderDB,
      db,
      collectionName,
      projectId,
      { [query.primaryKey]: { $in: query.itemsPrimaryKeyValues } },
      page,
      limit,
    );
    console.log(':::result:::', result);
    res.status(result.code).send(result.data);
  } catch (err) {
    next(err);
  }
};

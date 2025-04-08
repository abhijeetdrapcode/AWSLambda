import express from 'express';
import {
  collectionTableItems,
  collectionTableFilterItemCount,
  collectionTableFilterItems,
  findOneItem,
  exportFilterItems,
} from './collectionTable.controller';

import { interceptLogger } from 'drapcode-utility';
import checkdb from './../middleware/dbchecking.middleware';

const collectionTableRoute = express.Router();
collectionTableRoute.get('/:collectionName/items/', interceptLogger, checkdb, collectionTableItems);
collectionTableRoute.post(
  '/:collectionName/itemList',
  interceptLogger,
  checkdb,
  collectionTableItems,
);
collectionTableRoute.get('/:collectionName/item/:itemId', interceptLogger, checkdb, findOneItem);
collectionTableRoute.get(
  '/:collectionName/finder/:filterId/items/',
  interceptLogger,
  checkdb,
  collectionTableFilterItems,
);
collectionTableRoute.get(
  '/:collectionName/finder/:filterId/items/count',
  interceptLogger,
  checkdb,
  collectionTableFilterItemCount,
);
collectionTableRoute.post(
  '/:collectionName/finder/:filterId/export-data',
  interceptLogger,
  checkdb,
  exportFilterItems,
);

export default collectionTableRoute;

import express from 'express';
import {
  findAll,
  findOne,
  addItemFromBuilder,
  addReferenceItemFromBuilder,
  executeQueryFromBuilder,
  findAllForBuilder,
  findOneItemForBuilder,
  findUpdateItemForBuilder,
  removeAllItemFromBuilder,
  removeItemFromBuilder,
  removeReferenceItemFromBuilder,
  saveItemsImportedFromCSVForBuilder,
  findAllByRegexForBuilder,
  fetchLastRecord,
  collectionTableFilterItems,
  exportFilterItems,
  deleteFieldRecordFromItems,
} from './item.controller';
import { interceptLogger } from 'drapcode-utility';
import checkdb from './../middleware/dbchecking.middleware';
import { validateBuilderAPI } from '../middleware/restrictBuilder.middleware';
import sessionValidate from '../middleware/sessionValidate.middleware';
const itemRouter = express.Router();

itemRouter.get('/:collectionName/collection', sessionValidate, checkdb, interceptLogger, findAll);
itemRouter.get('/:collectionName/item/:itemId', sessionValidate, checkdb, interceptLogger, findOne);

/**
 * Used in
 * Builder Engine
 */
itemRouter.get(
  '/builder/:collectionName/:finderId',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  collectionTableFilterItems,
);
itemRouter.post(
  '/builder/:collectionName/collection/list',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  findAllForBuilder,
);
itemRouter.post(
  '/builder/:collectionName/collection',
  checkdb,
  interceptLogger,
  addItemFromBuilder,
);
itemRouter.get(
  '/builder/:collectionName/collection/:itemId/item',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  findOneItemForBuilder,
);
itemRouter.post(
  '/builder/:collectionName/collection/last-record',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  fetchLastRecord,
);
itemRouter.post(
  '/builder/:collectionName/collection/query',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  executeQueryFromBuilder,
);
itemRouter.delete(
  '/builder/:collectionName/collection/:itemId/remove-item',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  removeItemFromBuilder,
);
itemRouter.post(
  '/builder/:collectionName/collection/remove-reference',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  removeReferenceItemFromBuilder,
);
itemRouter.post(
  '/builder/:collectionName/collection/add-reference',
  checkdb,
  interceptLogger,
  addReferenceItemFromBuilder,
);
itemRouter.put(
  '/builder/:collectionName/collection/:itemId/item',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  findUpdateItemForBuilder,
);
itemRouter.delete(
  '/builder/:collectionName/collection/clear-collection',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  removeAllItemFromBuilder,
);
itemRouter.post(
  '/builder/:collectionName/collection/import-from-csv',
  checkdb,
  interceptLogger,
  saveItemsImportedFromCSVForBuilder,
);
itemRouter.delete(
  '/builder/:collectionName/collection/:fieldName/field-record',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  deleteFieldRecordFromItems,
);
/**
 * Used in
 * Exchange Build Surface
 */
itemRouter.post(
  '/builder/:collectionName/collection/regex',
  sessionValidate,
  checkdb,
  interceptLogger,
  findAllByRegexForBuilder,
);
//TODO: Not used, find usage
itemRouter.get(
  '/builder/:collectionName/:finderId/export-data',
  validateBuilderAPI,
  checkdb,
  interceptLogger,
  exportFilterItems,
);

export default itemRouter;

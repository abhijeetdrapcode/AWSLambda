import express from 'express';
import {
  addToItemField,
  bulkUpdate,
  createItem,
  deleteItem,
  importFromCSV,
  pdfToTextField,
  removeFromItemField,
  update,
  anyFileToText,
} from './collectionForm.controller';
import { interceptLogger } from 'drapcode-utility';
import { cryptItemData } from '../middleware/encryption.middleware';
import { bulkDelete } from '../developer/developer.controller';
const collectionFormRoute = express.Router();
collectionFormRoute.post('/:collectionName/items/', interceptLogger, cryptItemData, createItem);
collectionFormRoute.put('/:collectionName/items/:itemId', interceptLogger, cryptItemData, update);
collectionFormRoute.post(
  '/import-from-csv/:collectionName',
  interceptLogger,
  cryptItemData,
  importFromCSV,
);
collectionFormRoute.put('/:collectionName/items/bulk/update', interceptLogger, bulkUpdate);
collectionFormRoute.delete('/:collectionName/items/:itemId', interceptLogger, deleteItem);
collectionFormRoute.post(
  '/:collectionName/items/constructor/:constructorId?',
  interceptLogger,
  cryptItemData,
  createItem,
);
collectionFormRoute.post(
  '/:collectionName/items/:survey/submit/constructor/:constructorId?',
  interceptLogger,
  cryptItemData,
  createItem,
);
collectionFormRoute.post(
  '/:collectionName/items/:itemId/fields/:collectionFieldId',
  interceptLogger,
  addToItemField,
);
collectionFormRoute.put(
  '/:collectionName/items/:itemId/fields/:collectionFieldId',
  interceptLogger,
  removeFromItemField,
);
collectionFormRoute.post(
  '/:collectionName/items/:itemId/pdf-text/:fieldForPdf/:fieldForText',
  interceptLogger,
  pdfToTextField,
);
collectionFormRoute.post('/:collectionName/items/bulkDelete', interceptLogger, bulkDelete);
collectionFormRoute.post(
  '/:collectionName/items/:itemId/anyfile-to-text/:fieldForPdf/:fieldForText',
  interceptLogger,
  anyFileToText,
);
export default collectionFormRoute;

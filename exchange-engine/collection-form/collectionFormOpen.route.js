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
  nlpAnonymization,
  customTermsAnonymization,
} from './collectionForm.controller';
import { interceptLogger } from 'drapcode-utility';
import { cryptItemData } from '../middleware/encryption.middleware';
import { bulkDelete } from '../developer/developer.controller';
const collectionFormOpenRoute = express.Router();
collectionFormOpenRoute.post('/:collectionName/items', interceptLogger, cryptItemData, createItem);
collectionFormOpenRoute.post(
  '/import-from-csv/:collectionName',
  interceptLogger,
  cryptItemData,
  importFromCSV,
);
collectionFormOpenRoute.put(
  '/:collectionName/items/:itemId',
  interceptLogger,
  cryptItemData,
  update,
);
collectionFormOpenRoute.put('/:collectionName/items/bulk/update', interceptLogger, bulkUpdate);
collectionFormOpenRoute.delete('/:collectionName/items/:itemId', interceptLogger, deleteItem);
collectionFormOpenRoute.post(
  '/:collectionName/items/constructor/:constructorId?',
  interceptLogger,
  cryptItemData,
  createItem,
);
collectionFormOpenRoute.post(
  '/:collectionName/items/:survey/submit/constructor/:constructorId?',
  interceptLogger,
  cryptItemData,
  createItem,
);
collectionFormOpenRoute.post(
  '/:collectionName/items/:itemId/fields/:collectionFieldId',
  interceptLogger,
  addToItemField,
);
collectionFormOpenRoute.put(
  '/:collectionName/items/:itemId/fields/:collectionFieldId',
  interceptLogger,
  removeFromItemField,
);
collectionFormOpenRoute.post(
  '/:collectionName/items/:itemId/pdf-text/:fieldForPdf/:fieldForText',
  interceptLogger,
  pdfToTextField,
);
collectionFormOpenRoute.post('/:collectionName/items/bulkDelete', interceptLogger, bulkDelete);
collectionFormOpenRoute.post(
  '/:collectionName/items/:itemId/anyfile-to-text/:fieldForPdf/:fieldForText',
  interceptLogger,
  anyFileToText,
);
collectionFormOpenRoute.post(
  '/:collectionName/items/:itemId/nlp_anonymization/:fieldForSourceText/:fieldForAnonymizedText',
  interceptLogger,
  nlpAnonymization,
);
collectionFormOpenRoute.post(
  '/:collectionName/items/:itemId/custom_terms_anonymization/:fieldForSourceText/:fieldForCustomTerms/:fieldForAnonymizedText',
  interceptLogger,
  customTermsAnonymization,
);
export default collectionFormOpenRoute;

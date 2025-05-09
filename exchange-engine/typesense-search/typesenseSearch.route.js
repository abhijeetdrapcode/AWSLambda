import express from 'express';
import checkdb from './../middleware/dbchecking.middleware';
import {
  initializeTypesenseCollection,
  reindexAllData,
  deleteTypesenseCollection,
  searchTypesenseCollection,
  getAllTypesenseIndexedData,
} from './typesenseSearch.controller';

const typesenseSearchRouter = express.Router();

typesenseSearchRouter.post('/initialize', checkdb, initializeTypesenseCollection);
typesenseSearchRouter.post('/reindex-data', checkdb, reindexAllData);
typesenseSearchRouter.delete(
  '/delete-collection/:collectionName',
  checkdb,
  deleteTypesenseCollection,
);
typesenseSearchRouter.post('/search', checkdb, searchTypesenseCollection);
typesenseSearchRouter.get(
  '/get-all-indexed-data/:typesenseCollectionName',
  checkdb,
  getAllTypesenseIndexedData,
);

export default typesenseSearchRouter;

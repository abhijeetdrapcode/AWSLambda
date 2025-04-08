import express from 'express';
import {
  sendDataOnExternalApi,
  callExternalApiAndProcess,
  findById,
  traceError,
  processDataFromResponseJSON,
  processAPIRequest,
} from './external-api.controller';
import checkdb from './../middleware/dbchecking.middleware';

const externalApiRouter = express.Router();
//TODO:this route will be handled using below route
externalApiRouter.post('/send-webhook/', checkdb, sendDataOnExternalApi);
externalApiRouter.post('/:collectionItemId?', checkdb, callExternalApiAndProcess);
externalApiRouter.post('/process/response-data/', processDataFromResponseJSON);
externalApiRouter.get('/id/:externalApiId', checkdb, findById);
externalApiRouter.get('/traceError/', traceError);

externalApiRouter.post('/mock-data/rest-api/', processAPIRequest);

export default externalApiRouter;

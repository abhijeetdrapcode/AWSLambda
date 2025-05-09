import express from 'express';
import { checkUniqueValidation, findById, findByName } from './collection.controller';

const collectionRouter = express.Router();
collectionRouter.get('/:collectionName/name', findByName);
collectionRouter.get('/:uuid/id', findById);
collectionRouter.get('/:collectionName/items/unique-check', checkUniqueValidation);
export default collectionRouter;

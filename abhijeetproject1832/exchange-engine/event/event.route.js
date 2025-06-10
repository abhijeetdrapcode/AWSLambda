import express from 'express';
import { interceptLogger } from 'drapcode-utility';
import { findAllEvent, findOneEvent } from './event.controller';
import checkdb from './../middleware/dbchecking.middleware'

/**
 * We are not using Redis for Events
 */
const eventRouter = express.Router();
eventRouter.get('/', interceptLogger, checkdb, findAllEvent);
eventRouter.get('/:eventId', checkdb, findOneEvent);
export default eventRouter;

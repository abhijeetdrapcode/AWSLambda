import express from 'express';
import { interceptLogger } from 'drapcode-utility';
import { findAll } from './installedPlugin.controller';
import checkdb from './../middleware/dbchecking.middleware'
export const pluginRouter = express.Router();

pluginRouter.get('/', interceptLogger, checkdb, findAll);

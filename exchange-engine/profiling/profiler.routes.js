import express from 'express';
import { interceptLogger } from 'drapcode-utility';
import { deleteProfiler, listProfiler } from './profiler.controller';
const profilerRoute = express.Router();

profilerRoute.post('/delete', interceptLogger, deleteProfiler);
profilerRoute.get('/list', interceptLogger, listProfiler);

export default profilerRoute;

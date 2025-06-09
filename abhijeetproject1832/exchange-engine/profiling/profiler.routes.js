import express from 'express';
import { interceptLogger } from 'drapcode-utility';
import { deleteProfiler } from './profiler.controller';
const profilerRoute = express.Router();

profilerRoute.post('/delete', interceptLogger, deleteProfiler);

export default profilerRoute;

import express from 'express';
import { getCustomDataMapping } from './customMapping.controller';

const customDataMappingRoute = express.Router();

customDataMappingRoute.post('/:uuid', getCustomDataMapping);

export default customDataMappingRoute;

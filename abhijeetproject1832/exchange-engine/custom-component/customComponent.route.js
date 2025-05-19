import express from 'express';
import { getCustomComponentConfig } from './customComponent.controller';

const customComponentRoute = express.Router();

customComponentRoute.get('/:uuid', getCustomComponentConfig);

export default customComponentRoute;

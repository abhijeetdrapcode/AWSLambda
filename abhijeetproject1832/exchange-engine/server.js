import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import responseTime from 'response-time';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import { errorLogger } from 'drapcode-utility';
import collectionFormRoute from './collection-form/collectionForm.route';
import collectionFormOpenRoute from './collection-form/collectionFormOpen.route';
import collectionTableRoute from './collection-table/collectionTable.route';
import loginPluginRoute from './loginPlugin/loginPlugin.route';
import { verifyJwt, verifyJwtForOpen } from './loginPlugin/jwtUtils';
import uploadRoute from './upload-api/upload.route';
import itemRouter from './item/item.route';
import eventRouter from './event/event.route';
import emailRouter from './email/email.route';

import externalApiRouter from './external-api/external-api.route';
import projectRouter from './project/project.route';
import collectionRouter from './collection/collection.route';
import externalApiMiddlewareRoute from './external-api-middleware/external.api.mddleware.route';
import { pluginRouter } from './install-plugin/installedPlugin.route';


import docusignRouter from './docusign/docusign.route';
import {
  AUTH_ROUTE,
  COLLECTION_DETAIL_ROUTE,
  COLLECTION_FORM_AUTH,
  COLLECTION_FORM_OPEN,
  COLLECTION_ITEMS_ROUTE,
  EMAIL_ROUTE,
  EVENT_ROUTE,
  ITEM_ROUTE,
  
  
  PROJECT_ROUTE,
  
  UPLOAD_ROUTE,
  EXTERNAL_API_ROUTE,
  EXTERNAL_API_MIDDLEWARE_ROUTE,
  
  DOCS_API,
  DEVELOPER_API,
  
  
  
  PLUGIN_ROUTE,
  CUSTOM_COMPONENT_ROUTE,
  
  CUSTOM_DATA_MAPPING,
  PROFILER_API,
  
  
  
  
  
  
  
  
  
  
  
  STRIPE_PAYMENT_METHODS,
  DOCUSIGN_ROUTE,
} from './route-constants';
import dbConnection from './config/database';

import stripePaymentMethodsRouter from './stripe-payment-methods/stripePaymentMethod.route';



import developerRouter from './developer/developer.route';
import globalConnection from './config/global.database.config';

import profilerRouter from './profiling/profiler.routes';

import { tenantMiddleware } from './middleware/tenant.middleware';
import customComponentRoute from './custom-component/customComponent.route';

import customDataMappingRoute from './custom-mapping/customMapping.route';









import sessionValidate from './middleware/sessionValidate.middleware';
import { swaggerMiddleware } from './middleware/swagger.middleware';

require('./loginPlugin/passport');

let APP_PORT = process.env.APP_PORT;
APP_PORT = APP_PORT || 5001;

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.raw({ limit: '500mb' }));
app.use(compression());

app.use('/', express.static('public'));
app.use(responseTime());
app.use(
  cors({
    exposedHeaders: ['Content-Disposition', 'jsessionid'],
  }),
);

globalConnection();

app.use(dbConnection);
app.use(DOCS_API, swaggerUi.serve, swaggerMiddleware, (req, res) => {
  swaggerUi.setup(req.swaggerSpec, { explorer: true })(req, res);
});


app.use(PROJECT_ROUTE, projectRouter);

app.use(AUTH_ROUTE, sessionValidate, loginPluginRoute);
app.use(EVENT_ROUTE, eventRouter);
app.use(EMAIL_ROUTE, sessionValidate, verifyJwtForOpen, tenantMiddleware, emailRouter);
app.use(ITEM_ROUTE, itemRouter); //Remain
app.use(COLLECTION_ITEMS_ROUTE, sessionValidate, tenantMiddleware, collectionTableRoute);
app.use(EXTERNAL_API_ROUTE, sessionValidate, verifyJwtForOpen, tenantMiddleware, externalApiRouter);
app.use(UPLOAD_ROUTE, sessionValidate, uploadRoute);
app.use(COLLECTION_DETAIL_ROUTE, sessionValidate, collectionRouter);
app.use(EXTERNAL_API_MIDDLEWARE_ROUTE, sessionValidate, externalApiMiddlewareRoute);




app.use(DEVELOPER_API, developerRouter);
app.use(PLUGIN_ROUTE, sessionValidate, pluginRouter);
app.use(CUSTOM_COMPONENT_ROUTE, customComponentRoute);
app.use(CUSTOM_DATA_MAPPING, verifyJwtForOpen, tenantMiddleware, customDataMappingRoute);
app.use(PROFILER_API, profilerRouter);


app.use(DOCUSIGN_ROUTE, sessionValidate, verifyJwtForOpen, tenantMiddleware, docusignRouter);
/*
Above this will be public API(not authenticated)
Below this all will be authenticated
*/
app.use(
  STRIPE_PAYMENT_METHODS,
  sessionValidate,
  verifyJwtForOpen,
  tenantMiddleware,
  stripePaymentMethodsRouter,
);
app.use(
  COLLECTION_FORM_OPEN,
  sessionValidate,
  verifyJwtForOpen,
  tenantMiddleware,
  collectionFormOpenRoute,
);


app.use(COLLECTION_FORM_AUTH, sessionValidate, verifyJwt, tenantMiddleware, collectionFormRoute);







app.use(errorLogger);

// define a simple route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to exchange application' });
});

app.all('*', (err, req, res, next) => {
  next(err);
});

app.listen(APP_PORT, () => {
  console.log(`Server is listening on port ${APP_PORT}`);
});
mongoose.connection.on('error', (err) => {
  console.error('********** $$$$$$ ********');
  console.error('Connection Broke from Database');
  console.error('Connection Err :>> ', err);
  console.error('********** $$$$$$ ********');
});
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose connection disconnected');
});

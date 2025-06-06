import express from 'express';
import {
  checkStripePaymentMethod,
  createCheckoutSession,
  deleteCustomPaymentMethod,
  getCustomerPaymentMethodList,
} from './stripePaymentMethods.controller';
import checkdb from './../middleware/dbchecking.middleware';

const stripePaymentMethodsRouter = express.Router();

stripePaymentMethodsRouter.post(
  '/create-checkout-session',
  checkStripePaymentMethod,
  createCheckoutSession,
);

stripePaymentMethodsRouter.get(
  '/customer/:customerId/list',
  checkStripePaymentMethod,
  checkdb,
  getCustomerPaymentMethodList,
);

stripePaymentMethodsRouter.delete(
  '/delete/:methodId',
  checkStripePaymentMethod,
  checkdb,
  deleteCustomPaymentMethod,
);

export default stripePaymentMethodsRouter;

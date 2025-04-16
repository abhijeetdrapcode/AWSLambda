import { Stripe } from 'stripe';
import { replaceValueFromSource } from 'drapcode-utility';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { pluginCode } from 'drapcode-constant';
import { v4 as uuidv4 } from 'uuid';
import { addUserAndTenantFieldsInItem } from '../item/item.service';
import { createAuditTrail } from '../logs/audit/audit.service';
const stripeCollectionName = 'stripe_payment_methods';

export const checkStripePaymentMethod = async (req, res, next) => {
  const { builderDB, projectId, environment } = req;
  const installedStripePaymentMethods = await findInstalledPlugin(builderDB, {
    code: pluginCode.STRIPE_PAYMENT_METHODS,
    projectId: projectId,
  });

  if (!installedStripePaymentMethods) {
    return res.json({
      code: 400,
      message: 'Stripe Payment Methods Plugin not installed',
      status: 'failed',
    });
  }
  const { setting: pluginSetting } = installedStripePaymentMethods;
  let { secretKey, publishedKey, return_url } = pluginSetting;
  secretKey = replaceValueFromSource(secretKey, environment, null);
  publishedKey = replaceValueFromSource(publishedKey, environment, null);
  return_url = replaceValueFromSource(return_url, environment, null);

  req.stripeConfig = { secretKey, publishedKey, return_url };
  next();
};

export const createCheckoutSession = async (req, res, next) => {
  try {
    const { body, stripeConfig } = req;
    let { secretKey, publishedKey, return_url } = stripeConfig;
    const { customerId, currentPage } = body;

    if (!return_url) return_url = currentPage;

    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'setup',
      ui_mode: 'embedded',
      customer: customerId,
      return_url: `${return_url}?session_id={CHECKOUT_SESSION_ID}`,
    });
    res.status(200).send({ clientSecret: session.client_secret, publishedKey });
  } catch (error) {
    console.log('\n error :>> ', error);
    next(error);
  }
};

export const getCustomerPaymentMethodList = async (req, res, next) => {
  try {
    const { db, params, stripeConfig, user, tenant } = req;
    const { secretKey } = stripeConfig;
    const { customerId } = params;

    const stripe = new Stripe(secretKey);

    const paymentMethods = await stripe.paymentMethods.list({
      type: 'card',
      customer: customerId,
      limit: 100,
    });
    let finalData = [];
    paymentMethods.data.forEach((item) => {
      const {
        id,
        billing_details: { name, email },
        card: { brand, display_brand, country, exp_month, exp_year, last4 },
      } = item;
      finalData.push({
        id,
        name,
        email,
        brand,
        display_brand,
        country,
        exp_month,
        exp_year,
        last4,
        customer: customerId,
      });
    });

    res.status(200).send({ paymentMethodsList: finalData });
    await savePaymentMethodToCollection(db, finalData, user, tenant);
  } catch (error) {
    console.log('\n error :>> ', error);
    next(error);
  }
};

export const deleteCustomPaymentMethod = async (req, res, next) => {
  try {
    const { db, params, stripeConfig, enableAuditTrail } = req;
    const { secretKey } = stripeConfig;
    const { methodId } = params;
    const stripe = new Stripe(secretKey);
    const paymentMethod = await stripe.paymentMethods.detach(methodId);
    res.status(200).send({ paymentMethod });
    await deletePaymentMethodFromCollection(db, enableAuditTrail, methodId);
  } catch (error) {
    console.log('\n error :>> ', error);
    next(error);
  }
};

const savePaymentMethodToCollection = async (db, items, user, tenant) => {
  try {
    let finalItems = [];
    let ids = [];
    items.forEach((item) => {
      let finalItem = {
        ...item,
        payment_method_id: item.id,
        uuid: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      finalItem = addUserAndTenantFieldsInItem(finalItem, user, tenant);
      ids.push(item.id);
      finalItems.push(finalItem);
    });

    let dbCollection = await db.collection(stripeCollectionName);
    const existingItems = await dbCollection.find({ payment_method_id: { $in: ids } }).toArray();
    if (existingItems.length) {
      ids = existingItems.map((item) => item.payment_method_id);
      finalItems = finalItems.filter((item) => !ids.includes(item.payment_method_id));
    }
    if (finalItems.length) {
      const savedRecords = await dbCollection.insertMany(finalItems);
      console.log('\n savedRecords :>> ', savedRecords);
    }
  } catch (error) {
    console.log('\n error :>> ', error);
  }
};

const deletePaymentMethodFromCollection = async (db, enableAuditTrail, methodId) => {
  try {
    let dbCollection = await db.collection(stripeCollectionName);
    const query = { payment_method_id: methodId };

    let result = await dbCollection.deleteOne(query);
    if (!result || (result.result && !result.result.n)) {
      console.log('Record not Found');
    } else {
      // FINAL: START:Audit Trail
      createAuditTrail(
        db,
        enableAuditTrail,
        'SYSTEM',
        'delete',
        '',
        stripeCollectionName,
        '',
        query,
      );
      // END:Audit Trail
    }
  } catch (error) {
    console.log('\n error :>> ', error);
  }
};

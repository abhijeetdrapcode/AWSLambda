import moment from 'moment';
import { copyPermissionsInUser } from '../loginPlugin/user.service';
import { customInsertOne } from '../utils/utils';
import {
  compareOldNewValue,
  createAuditTrail,
  removeItemFromArray,
} from '../logs/audit/audit.service';
import { isNew } from '../utils/appUtils';
require('../external-api-middleware/external.api.middleware.model');
const USER_COLLECTION = 'user';

export const listForBuilder = async (db, collectionName, query, page, size) => {
  const dbCollection = await db.collection(collectionName);
  console.log('#### 1', moment.now());

  if (page) {
    page = +page;
    size = +size || 20;
    const countQuery = [...query];
    console.log('#### 1 i have page', moment.now());
    console.log(query);
    let content = await dbCollection
      .aggregate(query)
      .skip(size * page)
      .limit(size)
      .toArray();
    console.log('#### 2 i have page', moment.now());

    let count = 0;
    const isEmptyQuery = countQuery.length;

    if (isEmptyQuery) {
      console.log('#### 3 i have page', moment.now());
      console.log(countQuery);
      let countContent = await dbCollection.aggregate(countQuery).toArray();
      console.log('#### 4 i have page', moment.now());
      const contentLength = countContent.length;
      count = contentLength;
    } else {
      console.log('#### 5 i have page', moment.now());
      count = await dbCollection.estimatedDocumentCount({});
      console.log('#### 6 i have page', moment.now());
    }

    return { content: content, totalPages: Math.ceil(count / size), totalItems: count };
  } else {
    console.log('I will get all items');
    console.log('#### 2', moment.now());
    console.log(query);
    return await dbCollection.aggregate(query).toArray();
  }
};

export const createItemFromBuilder = async (db, enableAuditTrail, collectionName, body) => {
  const dbCollection = await db.collection(collectionName);
  if (body) {
    body.createdAt = new Date();
    body.updatedAt = new Date();
    body.version = 0;
  }
  // FINAL: START:Audit Trail
  createAuditTrail(db, enableAuditTrail, 'BUILDER', 'create', '', collectionName, body);
  // END:Audit Trail
  let result = await customInsertOne(dbCollection, body);
  if (result) {
    if (collectionName === USER_COLLECTION) {
      return await copyPermissionsInUser(db, enableAuditTrail, result);
    } else {
      return result;
    }
  } else {
    throw new Error('Failed to save data');
  }
};

export const findItemForBuilder = async (db, collectionName, itemId) => {
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.findOne({ uuid: itemId });
  return result;
};

export const findItemForBuilderByRegex = async (db, collectionName, body) => {
  const regex = new RegExp(body.regex);
  const query = { pageComponents: regex };
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.find(query).toArray();
  return result;
};

export const updateItemForBuilder = async (
  db,
  builderDB,
  projectId,
  enableAuditTrail,
  collectionName,
  itemId,
  itemData,
) => {
  const dbCollection = await db.collection(collectionName);
  if (itemData['$set']) {
    itemData['$set'].updatedAt = new Date();
  }
  if (!itemData['$inc']) {
    if (itemData['$set'].version || itemData['$set'].version === 0) delete itemData['$set'].version;
    itemData['$inc'] = { version: 1 };
  }
  const query = { uuid: itemId };

  // FINAL: START:Audit Trail
  // No Encryption/Decryption required, This will be replaced soon.
  // need to check collection detail
  // Final Check
  const collItem = await dbCollection.findOne(query);
  const { oldValues, newValues: nValues } = await compareOldNewValue(
    builderDB,
    projectId,
    collItem,
    itemData['$set'],
    null,
  );
  createAuditTrail(
    db,
    enableAuditTrail,
    'BUILDER',
    'update',
    '',
    collectionName,
    nValues,
    oldValues,
  );
  // END:Audit Trail

  let result = await dbCollection.findOneAndUpdate(query, itemData, isNew);
  return result;
};

export const executeQueryBuilder = async (db, collectionName, query) => {
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.aggregate(query).toArray();
  return result;
};

export const executeLastRecordBuilder = async (db, collectionName) => {
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.find().sort({ _id: -1 }).limit(1).toArray();
  return result;
};

export const executeFindBuilder = async (db, collectionName, query) => {
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.aggregate(query).toArray();
  return result;
};

export const removeItemBuilder = async (db, enableAuditTrail, collectionName, itemId) => {
  const dbCollection = await db.collection(collectionName);
  const query = { uuid: itemId };
  //TODO: This will be removed soon.
  // FINAL: START:Audit Trail
  // No Encryption/Decryption required, removing record
  createAuditTrail(
    db,
    enableAuditTrail,
    'BUILDER',
    'delete',
    '',
    collectionName,
    '',
    '',
    '',
    query,
  );
  // END:Audit Trail

  let result = await dbCollection.deleteOne(query);
  return result;
};

export const removeReferenceBuilder = async (db, enableAuditTrail, collectionName, data) => {
  const { belongsToItemId, collectionField, recordId, isMultiSelect } = data;
  const dbCollection = await db.collection(collectionName);

  const finder = { uuid: belongsToItemId };
  if (isMultiSelect) {
    finder[collectionField] = { $size: 0 };
  }
  // FINAL: START:Audit Trail
  const collItem = await dbCollection.findOne(finder);
  const newData = removeItemFromArray(collItem);
  createAuditTrail(
    db,
    enableAuditTrail,
    'BUILDER',
    'update',
    '',
    collectionName,
    newData,
    collItem[collectionField],
  );
  // END:Audit Trail

  const updatedRecord = await dbCollection.findOneAndUpdate(finder, {
    $pull: { [collectionField]: recordId },
  });
  return updatedRecord;
};

export const addReferenceBuilder = async (db, enableAuditTrail, collectionName, data) => {
  const { collectionField, recordId, isMultiSelect } = data;
  let { belongsToItemId } = data;
  const dbCollection = await db.collection(collectionName);
  belongsToItemId = Array.isArray(belongsToItemId) ? belongsToItemId[0] : belongsToItemId;
  const belongsToItem = await findItemForBuilder(db, collectionName, belongsToItemId);
  if (belongsToItem) {
    let belongsToField = belongsToItem[collectionField];
    if (belongsToField) {
      if (!belongsToField.includes(recordId)) {
        belongsToField =
          isMultiSelect && Array.isArray(belongsToField)
            ? [...belongsToField, recordId]
            : [recordId];
      }
    } else belongsToField = [recordId];
    const finder = { uuid: belongsToItemId };
    // FINAL: START:Audit Trail
    const collItem = await dbCollection.findOne(finder);
    createAuditTrail(
      db,
      enableAuditTrail,
      'BUILDER',
      'update',
      '',
      collectionName,
      { [collectionField]: belongsToField },
      { [collectionField]: collItem[collectionField] },
    );
    // END:Audit Trail

    let res = await dbCollection.findOneAndUpdate(finder, {
      $set: { [collectionField]: belongsToField },
    });
    return res;
  }
};

export const saveItemsImportedFromCSVForBuilderService = async (
  db,
  enableAuditTrail,
  collectionName,
  data,
) => {
  let dbCollection = await db.collection(collectionName);
  // FINAL: START:Audit Trail
  createAuditTrail(db, enableAuditTrail, 'BUILDER', 'create', '', collectionName, data, '');
  // END:Audit Trail
  return dbCollection.insertMany(data);
};

export const deleteFieldRecordFromItemsService = async (
  db,
  enableAuditTrail,
  collectionName,
  fieldName,
) => {
  const $unset = {};
  $unset[fieldName] = 1;
  //TODO: This will be removed soon.
  // FINAL: START:Audit Trail
  createAuditTrail(db, enableAuditTrail, 'BUILDER', 'update', '', collectionName, '', '', '', {});
  // END:Audit Trail
  return await db.collection(collectionName).updateMany({}, { $unset });
};

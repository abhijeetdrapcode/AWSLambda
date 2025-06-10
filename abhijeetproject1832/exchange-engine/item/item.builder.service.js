import moment from 'moment';
import { copyPermissionsInUser } from '../loginPlugin/user.service';
import { customInsertOne } from '../utils/utils';
require('../external-api-middleware/external.api.middleware.model');
const USER_COLLECTION = 'user';

export const listForBuilder = async (db, collectionName, query, page, size) => {
  const dbCollection = await db.collection(collectionName);

  if (page) {
    page = +page;
    size = +size || 20;
    const countQuery = [...query];
    console.log('#### 1 i have page', moment.now());

    console.log(query);
    let content = await dbCollection
      .aggregate(query)
      .sort({ _id: -1 })
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

export const createItemFromBuilder = async (db, collectionName, body) => {
  const dbCollection = await db.collection(collectionName);
  if (body) {
    body.createdAt = new Date();
    body.updatedAt = new Date();
  }
  let result = await customInsertOne(dbCollection, body);
  if (result) {
    if (collectionName === USER_COLLECTION) {
      return await copyPermissionsInUser(db, result);
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

export const updateItemForBuilder = async (db, collectionName, itemId, itemData) => {
  const dbCollection = await db.collection(collectionName);
  if (itemData['$set']) {
    itemData['$set'].updatedAt = new Date();
  }
  let result = await dbCollection.findOneAndUpdate({ uuid: itemId }, itemData, { new: true });
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

export const removeItemBuilder = async (db, collectionName, itemId) => {
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.deleteOne({ uuid: itemId });
  return result;
};

export const removeReferenceBuilder = async (db, collectionName, data) => {
  const { belongsToItemId, collectionField, recordId, isMultiSelect } = data;
  const dbCollection = await db.collection(collectionName);

  if (isMultiSelect) {
    const updatedRecord = await dbCollection.findOneAndUpdate(
      { uuid: belongsToItemId },
      { $pull: { [collectionField]: recordId } },
    );
    return updatedRecord;
  } else {
    let res = await dbCollection.findOneAndUpdate(
      { uuid: belongsToItemId, [collectionField]: { $size: 0 } },
      {
        $pull: {
          [collectionField]: recordId,
        },
      },
    );
    return res;
  }
};

export const addReferenceBuilder = async (db, collectionName, data) => {
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
    let res = await dbCollection.findOneAndUpdate(
      { uuid: belongsToItemId },
      { $set: { [collectionField]: belongsToField } },
    );
    return res;
  }
};

export const saveItemsImportedFromCSVForBuilderService = async (db, collectionName, data) => {
  let dbCollection = await db.collection(collectionName);
  return dbCollection.insertMany(data);
};

export const deleteFieldRecordFromItemsService = async (db, collectionName, fieldName) => {
  const $unset = {};
  $unset[fieldName] = 1;
  return await db.collection(collectionName).updateMany({}, { $unset });
};

/* eslint-disable no-prototype-builtins */
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { getFindQuery, getPrimaryFieldNameOfDataSource } from 'external-api-util';
import {
  checkCollectionByName,
  findCollection,
  findOneService,
  userCollectionService,
} from '../collection/collection.service';
import {
  FieldTypes,
  SelectOptionFields,
  ImageUrlFields,
  onlyReferenceField,
} from 'drapcode-constant';
import {
  queryParser,
  convertItemToArray,
  queryParserNew,
  parseJsonString,
  isEmptyObject,
  isEntityInCondition,
  drapcodeEncryptDecrypt,
  processItemEncryptDecrypt,
  formatFieldsOfItem,
  formatProjectDates,
  processKMSDecryption,
  fillDefaultValues,
  validateData,
} from 'drapcode-utility';

import _ from 'lodash';
import { convertHashPassword, userCollectionName } from '../loginPlugin/loginUtils';
import { verifyToken } from '../loginPlugin/jwtUtils';
import {
  mergeConstructorAndRequestData,
  removeEmptyFields,
} from '../collection-form/collectionForm.util';
import { customInsertOne, generateNextCustomUuid, generateRandomCustomUuid } from '../utils/utils';
import {
  filterFieldsForCSVImport,
  processConstructorData,
  processFieldsInclude,
} from './item.utils';
import { genericQuery } from '../developer/developer.service';
import { copyPermissionsInUser, validateUserData } from '../loginPlugin/user.service';
import { addReferenceBuilder } from './item.builder.service';
import os from 'os';
import path from 'path';
import fs from 'fs';
import PdfParse from 'pdf-parse';
import { cryptService } from '../middleware/encryption.middleware';
import { findProjectByQuery } from '../project/project.service';
import { privateUrl } from '../upload-api/fileUpload.service';
import { extractUserSettingFromUserAndTenant } from '../middleware/tenant.middleware';
import {
  compareOldNewValue,
  createAuditTrail,
  removeItemFromArray,
} from '../logs/audit/audit.service';
import {
  checkParams,
  formatDateFields,
  isNew,
  processQueryResult,
  processSearch,
} from '../utils/appUtils';
import { prepareDataForTypesenseIndexing } from '../typesense-search/typesenseSearch.utils';
import { deleteTypesenseDataService } from '../typesense-search/typesenseSearch.service';

const BulkHasOperations = (b) =>
  b &&
  b.s &&
  b.s.currentBatch &&
  b.s.currentBatch.operations &&
  b.s.currentBatch.operations.length > 0;

const {
  reference,
  belongsTo,
  password,
  createdBy,
  custom_uuid,
  text,
  dynamic_option,
  updatedBy,
  // version,
} = FieldTypes;
const USER_COLLECTION = 'user';

export const checkUniqueValidationFromCollection = async (dbConnection, collectionName, query) => {
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  const uniqueCheck = await dbCollection.findOne(query);
  if (uniqueCheck === null) {
    return true;
  }
  return false;
};

export const saveItem = async (
  builderDB,
  dbConnection,
  projectId,
  environment,
  enableAuditTrail,
  collectionName,
  itemData,
  constructorId = null,
  currentUser = {},
  headers = {},
  decrypt,
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  const { constructors, fields } = collectionData;
  const { constructorMetaObj } = itemData ?? '';
  // eslint-disable-next-line no-prototype-builtins
  if (itemData && itemData.hasOwnProperty('constructorMetaObj')) {
    delete itemData['constructorMetaObj'];
  }
  if (constructorId) {
    console.log('****** I have constructor Id');
    const constructor = constructors.find(
      (constructor) => constructorId && constructor.uuid === constructorId,
    );
    if (constructor) {
      itemData = await prepareConstructorData(
        builderDB,
        projectId,
        collectionData,
        constructor,
        constructorMetaObj,
        currentUser,
        headers,
        itemData,
        decrypt,
      );

      console.log('🚀 ~ file: item.service.js:97 ~ saveItem ~ itemData:', itemData);
    }
  }
  const validationResult = validateData(fields, itemData);
  if (!validationResult.isValid) {
    return {
      code: 400,
      status: 'error',
      type: 'Validation failed',
      message: validationResult.errors[0],
      data: validationResult.errors[0],
    };
  }
  const referenceFieldForm = [];
  fields.forEach((field) => {
    if (field.type === reference.id) {
      const { refCollection } = field;
      if (
        refCollection &&
        refCollection !== 'undefined' &&
        refCollection.displayType === 'innerForm'
      ) {
        referenceFieldForm.push(field);
      }
    }
  });
  let errorResponse = null;
  if (referenceFieldForm.length > 0) {
    await Promise.all(
      referenceFieldForm.map(async (field) => {
        const innerItemResponse = await saveItem(
          builderDB,
          dbConnection,
          projectId,
          environment,
          enableAuditTrail,
          field.refCollection.collectionName,
          itemData[field.fieldName],
          null,
          currentUser,
        );

        if (innerItemResponse.code === 201) {
          itemData[field.fieldName] = innerItemResponse.data.uuid;
        } else {
          errorResponse = innerItemResponse;
        }
      }),
    );
  }

  console.log('errorResponse out reference :>> ', errorResponse);
  if (errorResponse) return errorResponse;
  if (collectionName && collectionName === USER_COLLECTION) {
    validateUserData(collectionData, itemData);
  }

  const saveItemResponse = await saveCollectionItem(
    builderDB,
    dbConnection,
    projectId,
    enableAuditTrail,
    collectionData,
    itemData,
    currentUser,
    headers,
    environment,
  );
  console.log('saveItemResponse :>> ', saveItemResponse);
  return saveItemResponse;
};

const prepareConstructorData = async (
  builderDB,
  projectId,
  collectionData,
  constructor,
  constructorMetaObj,
  currentUser,
  headers,
  itemData,
  decrypt,
  isForUpdate,
  isDraft,
) => {
  let { constructorData } = constructor;
  const {
    ipAddress,
    navigator,
    previousActionResponse,
    previousActionFormData,
    sessionStorageData,
    localStorageData,
    cookiesData,
  } = constructorMetaObj;

  console.log(
    '🚀 ~ file: item.service.js:115 ~ sessionStorageData:',
    sessionStorageData,
    'localStorageData:',
    localStorageData,
    'cookiesData:',
    cookiesData,
  );
  const context = {
    headers,
    ipAddress,
    navigator,
    currentUser,
    previousActionResponse,
    previousActionFormData,
    sessionStorageData,
    localStorageData,
    cookiesData,
  };
  constructorData = processConstructorData(constructorData, context);
  console.log('\n constructorData 2 :>> ', constructorData);
  if (isForUpdate) {
    removeEmptyFields(constructorData);
  }

  itemData = await mergeConstructorAndRequestData(
    constructorData,
    itemData,
    builderDB,
    projectId,
    collectionData,
    decrypt,
  );
  if (isForUpdate) {
    itemData['isDraft'] = isDraft;
  }
  return itemData;
};

export const saveCollectionItem = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  collectionData,
  itemData,
  currentUser = {},
  headers,
  environment,
) => {
  const errorJson = await validateItemCollection(dbConnection, collectionData, itemData);
  console.log('errorJson saveCollectionItem', errorJson);
  if (Object.keys(errorJson).length !== 0) {
    const { field, isExist } = errorJson;
    if (field === 0) return { code: 500, data: `${isExist} field does not exist.`, message: {} };
    if (field)
      return {
        code: 409,
        message: 'Validation Failed',
        data: field,
      };
  }

  let { fields, collectionName, typesenseMapping = [] } = collectionData ? collectionData : '';
  const hasTenantIdField = fields
    ? !!fields.find((field) => field.fieldName === 'tenantId')
    : false;
  console.log('🚀 ~ file: item.service.js:231 ~ hasTenantIdField:', hasTenantIdField);
  console.log('Adding Value in auto generated fields');
  itemData = await convertAutoGenerateTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    itemData,
  );
  console.log('changing password field value');
  itemData = await convertPasswordTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    itemData,
  );
  console.log('Converting String to Object');
  itemData = await convertStringDataToObject(collectionData, itemData);
  console.log('Converting Single Item to List');
  itemData = await convertSingleItemToList(collectionData, itemData);
  itemData.createdAt = new Date();
  itemData.updatedAt = new Date();
  itemData.createdBy = currentUser.uuid;
  itemData.updatedBy = currentUser.uuid;
  itemData.version = 0;
  console.log('Filling default value');
  itemData = await fillDefaultValues(collectionData, itemData);
  let hasItemDataTenantIdValue = false;
  if (hasTenantIdField && Array.isArray(itemData.tenantId)) {
    const cleanedItemDataTenantId = itemData.tenantId.filter((item) => item.length !== 0);
    hasItemDataTenantIdValue = !!cleanedItemDataTenantId.length;
  } else if (hasTenantIdField) {
    hasItemDataTenantIdValue = !!itemData.tenantId;
  }
  const fileFields = fields.filter((field) => field.type === 'file');
  console.log('🚀 ~ file: item.service.js:249 ~ fileFields:', fileFields);
  fileFields.forEach((fileField) => {
    const fieldName = fileField.fieldName;
    if (itemData[fieldName] && !Array.isArray(itemData[fieldName])) {
      itemData[fieldName] = [itemData[fieldName]];
    }
  });

  console.log('item.service.js:275 ~ hasItemDataTenantIdValue:', hasItemDataTenantIdValue);

  if (hasTenantIdField && !hasItemDataTenantIdValue && currentUser.tenantId) {
    console.log('🚀 ~ Load Tenant from Header or User...');
    const tenantId = headers['x-tenant-id'];
    itemData.tenantId = tenantId
      ? [tenantId]
      : Array.isArray(currentUser.tenantId) && currentUser.tenantId.length
      ? [currentUser.tenantId[0]]
      : [];
  }

  itemData.uuid = uuidv4();
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  console.log('Adding record in database');
  // FINAL: START:Audit Trail
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'create',
    currentUser,
    collectionName,
    itemData,
  );
  // END:Audit Trail
  let savedItem = await customInsertOne(dbCollection, itemData);
  /* save belongs to field flow*/
  console.log('Saving Belongs to field');
  const belongsToResult = await saveBelongsToField(
    builderDB,
    dbConnection,
    projectId,
    enableAuditTrail,
    collectionData,
    itemData,
    savedItem.uuid,
  );

  if (collectionName && collectionName === USER_COLLECTION) {
    console.log('Copying permission to user');
    await copyPermissionsInUser(dbConnection, enableAuditTrail, savedItem);
  }

  if (belongsToResult && belongsToResult[0] && belongsToResult[0].value === null) {
    console.log('Removing Item by ID');
    await removeItemById(
      dbConnection,
      builderDB,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      savedItem.uuid,
    );
    return {
      code: 400,
      message: `Can't save more than one if reference field is not multi selected`,
      data: `Can't save more than one item if Child Of field Reference field is not multi select`,
    };
  }
  /*end save belongs to field flow */
  //Saving in Typesense Collection start
  if (typesenseMapping.length) {
    await prepareDataForTypesenseIndexing(
      builderDB,
      projectId,
      environment,
      collectionName,
      savedItem,
      typesenseMapping,
    );
  }
  //Saving in Typesense Collection end
  return {
    code: 201,
    message: 'Item Created Successfully',
    data: savedItem ? savedItem : {},
  };
};

export const convertSingleItemToList = async (collection, itemData) => {
  const arrayOptionFields = collection.fields.filter((field) => {
    const { type } = field;
    return SelectOptionFields.includes(type);
  });
  if (!arrayOptionFields || arrayOptionFields.length <= 0) {
    return itemData;
  }
  const fieldsInItemData = Object.keys(itemData);

  await Promise.all(
    arrayOptionFields.map(async (field) => {
      if (fieldsInItemData.includes(field.fieldName))
        itemData[field.fieldName] = itemData[field.fieldName]
          ? convertItemToArray(itemData[field.fieldName])
          : [];
    }),
  );

  return itemData;
};

export const saveBelongsToField = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  collection,
  itemData,
  recordId,
) => {
  const belongsToFields = collection.fields.filter((field) => field.type === belongsTo.id);
  if (!belongsToFields || belongsToFields.length === 0) {
    return [];
  }
  console.log('Save Belongs To Field');
  return await Promise.all(
    belongsToFields.map(async (field) => {
      const collectionName = field.refCollection.collectionName;
      const collectionField = field.refCollection.parentCollectionField;
      const belongsToItemId = itemData[field.fieldName];
      console.log('belongsToItemId', belongsToItemId);
      if (belongsToItemId) {
        const updateItem = await addItemToReferenceItemField(
          builderDB,
          dbConnection,
          projectId,
          enableAuditTrail,
          belongsToItemId,
          recordId,
          collectionName,
          collectionField,
        );
        return updateItem;
      }
    }),
  );
};

const addItemToReferenceItemField = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  belongsToItemId,
  recordId,
  collectionName,
  collectionField,
) => {
  console.log('Add Item To Reference Item Field');
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 422, data: `Collection not found with provided name` };
  }
  const refFieldOfBelongsTo = collectionData.fields.find((e) => e.fieldName === collectionField);
  collectionName = collectionName.toString();
  const data = {
    belongsToItemId,
    collectionField,
    recordId,
    isMultiSelect: refFieldOfBelongsTo.isMultiSelect,
  };
  return await addReferenceBuilder(dbConnection, enableAuditTrail, collectionName, data);
};

export const convertAutoGenerateTypeFields = async (
  builderDB,
  dbConnection,
  projectId,
  collection,
  itemData,
  itemId = null,
) => {
  const { fields, collectionName } = collection;
  const autogeneratedFields = fields.filter((field) => field.type === custom_uuid.id);
  if (!autogeneratedFields || autogeneratedFields.length === 0) {
    return itemData;
  }

  let existingItem = null;
  if (itemId) {
    //Since we already have collection detail
    //Comment below line

    // const collection = await findOneService(builderDB, {
    //   projectId,
    //   collectionName,
    // });
    existingItem = await findItemById(dbConnection, builderDB, projectId, collection, itemId, null);
    if (existingItem.message === 'success') {
      existingItem = existingItem.data;
    } else {
      existingItem = null;
    }
  }

  const lastItem = await findLastItem(dbConnection, collectionName);
  autogeneratedFields.forEach((field) => {
    const { extraFieldSetting, fieldName } = field;
    if (!existingItem || !existingItem[fieldName] || existingItem[fieldName].length === 0) {
      const value = itemData[fieldName];

      if (value && (value !== undefined || value !== 'undefined')) {
        console.log('Already have value from form so skip.');
      } else {
        /** Remove this if else in case not worked. */
        /** Don't assign/generate value, if already given */
        let algorithm = '',
          prepend = '',
          append = '',
          minLength = 1;
        if (extraFieldSetting instanceof Map) {
          algorithm = extraFieldSetting.get('algorithm');
          prepend = extraFieldSetting.get('prepend');
          append = extraFieldSetting.get('append');
          minLength = extraFieldSetting.get('minLength');
        } else {
          algorithm = extraFieldSetting.algorithm;
          prepend = extraFieldSetting.prepend;
          append = extraFieldSetting.append;
          minLength = extraFieldSetting.minLength;
        }
        if (['randomAlphanumeric', 'randomNumeric', 'randomAlphabet'].includes(algorithm)) {
          itemData[fieldName] = generateRandomCustomUuid(prepend, minLength, append, algorithm);
        } else {
          itemData[fieldName] = generateNextCustomUuid(
            lastItem && lastItem[fieldName] ? lastItem[fieldName] : '',
            prepend,
            minLength,
            append,
            algorithm,
          );
        }
      }
    }
  });
  return itemData;
};

export const convertPasswordTypeFields = async (
  builderDB,
  dbConnection,
  projectId,
  collection,
  itemData,
  itemId = null,
) => {
  const { fields } = collection;
  const passwordFields = fields.filter((field) => field.type === password.id);
  if (!passwordFields || passwordFields.length <= 0) {
    return itemData;
  }
  await Promise.all(
    passwordFields.map(async (field) => {
      const { fieldName } = field;
      if (itemId) {
        const existingItem = await findItemById(
          dbConnection,
          builderDB,
          projectId,
          collection,
          itemId,
          null,
        );
        if (existingItem[fieldName] !== itemData[fieldName]) {
          itemData[fieldName] = await convertHashPassword(itemData[fieldName]);
        }
      } else {
        itemData[fieldName] = await convertHashPassword(itemData[fieldName]);
      }
    }),
  );
  return itemData;
};

export const convertStringDataToObject = async (collection, itemData) => {
  const fileUploadFields = collection.fields.filter((field) => ImageUrlFields.includes(field.type));
  if (!fileUploadFields || fileUploadFields.length <= 0) {
    return itemData;
  }
  await Promise.all(
    fileUploadFields.map(async (field) => {
      const fieldValue = itemData[field.fieldName];
      if (fieldValue && typeof fieldValue === 'string') {
        itemData[field.fieldName] = parseJsonString(fieldValue);
      }
    }),
  );
  return itemData;
};

async function filter(arr, callback) {
  const fail = Symbol();
  return (
    await Promise.all(arr.map(async (item) => ((await callback(item)) ? item : fail)))
  ).filter((i) => i !== fail);
}

const validateUniqueFieldsKeyData = async (
  dbConnection,
  collection,
  itemData,
  itemId,
  isNewPhoneSignUp,
) => {
  const { fields, collectionName } = collection;
  let errorJson = {};
  const uniqueFields = fields.filter((field) => field.unique);
  let errors = await filter(uniqueFields, async (field) => {
    return (
      (await countByQueryOther(
        dbConnection,
        collectionName,
        field.fieldName,
        itemData[[field.fieldName]],
        itemId,
        isNewPhoneSignUp,
      )) > 0
    );
  });
  console.log('**************ERROR*******************');
  console.log('errors', errors);
  errors.some((field) => {
    if (field) {
      console.log('field.fieldTitle', field.fieldTitle);
      console.log('Object.keys(field.fieldTitle)', Object.keys(field.fieldTitle));
      errorJson.message = `This ${
        field && field.fieldTitle ? field.fieldTitle.en : field
      } already exists`;
      return true;
    }
  });
  console.error('errorJson', errorJson);
  return errorJson;
};

export const validateItemCollection = async (
  dbConnection,
  collection,
  itemData,
  itemId = null,
  isValidateFields = true,
  isUpdate = false,
  isNewPhoneSignUp,
) => {
  let { fields } = collection;
  let arr = Object.keys(itemData);
  let isExist = false;
  if (isValidateFields) {
    for (let obj of arr) {
      let find = fields.find((field) => field.fieldName === obj);
      if (!find && obj !== 'isDraft') {
        delete itemData[obj];
      }
    }
  }

  if (isExist) return { field: 0, isExist };
  const requireFields = fields.filter((field) => field.required);
  if (isUpdate) {
    for (const field of requireFields) {
      if (
        Object.prototype.hasOwnProperty.call(itemData, `${field.fieldName}`) &&
        !itemData[`${field.fieldName}`]
      ) {
        return { field: field.fieldTitle.en + ' field is required' };
      }
    }
  } else {
    for (const field of requireFields) {
      if (!itemData[`${field.fieldName}`]) {
        return { field: `${field.fieldTitle.en} field is required` };
      }
    }
  }
  //Checking if data has unique data for unique fields
  let errorResponse = await validateUniqueFieldsKeyData(
    dbConnection,
    collection,
    itemData,
    itemId,
    isNewPhoneSignUp,
  );
  if (isEmptyObject(errorResponse)) {
    //Checking if data of composite keys have unique data
    errorResponse = await validateCompositeKeyData(dbConnection, collection, itemData, itemId);
  }
  return !isEmptyObject(errorResponse)
    ? { field: errorResponse ? errorResponse.message : errorResponse }
    : {};
};

export const list = async (
  builderDB,
  dbConnection,
  projectId,
  collectionName,
  ids = null,
  reqQuery = {},
  decrypt,
) => {
  console.log('hhdhdhdh');
  console.log('**** 1 list', moment.now());
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  console.log('**** 2 list', moment.now());
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  let query = [];
  if (ids) {
    if (!Array.isArray(ids)) {
      ids = [ids];
    }
    query.push({ $match: { uuid: { $in: ids } } });
  }
  let { fields } = collectionData;
  query = [...query, ...genericQuery(reqQuery, fields)];
  console.log('**** 3 list', moment.now());
  if (fields.length) {
    fields = fields.filter((field) => onlyReferenceField.includes(field.type));
    if (fields && fields.length) {
      await Promise.all(
        fields.map((field) => {
          const { refCollection, fieldName } = field;
          let collectionName = refCollection ? refCollection.collectionName : null;
          if (collectionName) {
            query.push({
              $lookup: {
                from: `${collectionName}`,
                localField: fieldName,
                foreignField: 'uuid',
                as: field.fieldName,
              },
            });
          }
        }),
      );
    }
  }
  console.log('**** 4 list', moment.now());
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  console.log('**** 5 list', moment.now());
  console.log(query);
  let result = await dbCollection.aggregate(query).toArray();
  if (!result) {
    return result;
  }
  console.log('**** 6 list', moment.now());
  let encryptedResponse = await cryptService(
    result,
    builderDB,
    projectId,
    collectionData,
    true,
    false,
    decrypt,
  );
  if (encryptedResponse) {
    if (encryptedResponse.status === 'FAILED') {
      return null;
    } else {
      result = encryptedResponse;
    }
  }
  console.log('**** 7 list', moment.now());
  return result;
};

export const modifiedList = async (
  builderDB,
  dbConnection,
  projectId,
  collectionName,
  ids = null,
  reqQuery = {},
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  let query = [];
  if (ids) {
    if (!Array.isArray(ids)) {
      ids = [ids];
    }
    query.push({ $match: { uuid: { $in: ids } } });
  }
  const { fields } = collectionData;
  if (fields.length) {
    await Promise.all(
      fields.map((field) => {
        if (onlyReferenceField.includes(field.type)) {
          let collectionName = field.refCollection ? field.refCollection.collectionName : null;
          if (collectionName) {
            query.push({
              $lookup: {
                from: `${collectionName}`,
                localField: field.fieldName,
                foreignField: 'uuid',
                as: field.fieldName,
              },
            });
          }
        }
      }),
    );
  }

  if (reqQuery?.date) {
    query.push({ $match: { updatedAt: { $gte: reqQuery.date } } }, { $sort: { updatedAt: 1 } });
  }
  if (reqQuery?.offset) {
    query.push({ $skip: parseInt(reqQuery.offset) || 0 });
  }
  if (reqQuery?.max) {
    query.push({ $limit: parseInt(reqQuery.max) || 100 });
  }

  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  let result = await dbCollection.aggregate(query).toArray();
  return result;
};

export const updateCollectionItem = async (
  builderDB,
  db,
  projectId,
  environment,
  enableAuditTrail,
  collectionData,
  itemId,
  itemData,
  currentUser = {},
) => {
  const filteredFieldsAndData = filterFieldsToBeSaved(collectionData, itemData);
  itemData = filteredFieldsAndData.itemData;
  const errorJson = await validateItemCollection(db, collectionData, itemData, itemId, true, true);
  if (Object.keys(errorJson).length !== 0) {
    if (errorJson.field === 0) {
      return { code: 404, message: `${errorJson.isExist} field does not exist.`, data: {} };
    }
    if (errorJson.field)
      return {
        code: 409,
        message: 'validation failed',
        data: errorJson.field,
      };
  } else {
    delete itemData.uuid; // if user is trying to pass uuid for update;
    itemData = await convertAutoGenerateTypeFields(
      builderDB,
      db,
      projectId,
      collectionData,
      itemData,
      itemId,
    );
    itemData = await convertPasswordTypeFields(
      builderDB,
      db,
      projectId,
      collectionData,
      itemData,
      itemId,
    );
    itemData = await convertStringDataToObject(collectionData, itemData);
    itemData = await convertSingleItemToList(collectionData, itemData);
    itemData.updatedAt = new Date();

    const query = { uuid: itemId };
    if (currentUser) itemData['updatedBy'] = currentUser.uuid;
    if (itemData.version || itemData.version === 0) delete itemData.version;
    let newValues = { $set: itemData, $inc: { version: 1 } };
    if (filteredFieldsAndData && Object.keys(filteredFieldsAndData.fieldsToBeDeleted).length > 0) {
      newValues['$unset'] = filteredFieldsAndData.fieldsToBeDeleted;
    }
    let { collectionName, typesenseMapping = [] } = collectionData;
    collectionName = collectionName.toString().toLowerCase();
    let dbCollection = await db.collection(collectionName);
    // START:Audit Trail
    // Encryption/Decryption required, updating multiple field
    const collItem = await dbCollection.findOne(query);
    const { oldValues, newValues: nValues } = await compareOldNewValue(
      builderDB,
      projectId,
      collItem,
      itemData,
      collectionData,
    );
    createAuditTrail(
      db,
      enableAuditTrail,
      'NORMAL',
      'update',
      currentUser,
      collectionName,
      nValues,
      oldValues,
    );
    // END:Audit Trail
    let data = await dbCollection.findOneAndUpdate(query, newValues, isNew);
    if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
      return { code: 404, message: 'Item not found with provided id', data: {} };
    }
    /* save belongs to field flow*/
    const belongsToResult = await saveBelongsToField(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      collectionData,
      itemData,
      data?.value?.uuid,
    );
    if (belongsToResult && belongsToResult[0] && belongsToResult[0].value === null) {
      await removeItemById(
        db,
        builderDB,
        projectId,
        environment,
        enableAuditTrail,
        collectionName,
        data?.value?.uuid,
      );
      return {
        code: 400,
        message: `Can't save more than one if reference field is not multi selected`,
        data: `Can't save more than one item if Child Of field Reference field is not multi select`,
      };
    }
    if (typesenseMapping.length) {
      await prepareDataForTypesenseIndexing(
        builderDB,
        projectId,
        environment,
        collectionName,
        { ...itemData, uuid: itemId },
        typesenseMapping,
      );
    }
    return {
      code: 200,
      message: 'Item Updated Successfully',
      data: Object.assign(data?.value, { ...itemData, uuid: itemId }),
    };
  }
};

export const updateItemById = async (
  builderDB,
  dbConnection,
  projectId,
  environment,
  enableAuditTrail,
  collectionData,
  itemId,
  itemData,
  currentUser = {},
  headers = {},
  decrypt,
) => {
  const { constructors, fields } = collectionData;
  const { constructorMetaObj } = itemData ?? '';

  let isDraft = false;
  if (itemData && itemData.hasOwnProperty('constructorMetaObj')) {
    delete itemData['constructorMetaObj'];
  }

  if (itemData && itemData.hasOwnProperty('isDraft')) {
    isDraft = itemData['isDraft'];
  }

  if (constructorMetaObj && Object.keys(constructorMetaObj).length) {
    const { constructorId } = constructorMetaObj;
    const constructor = constructors.find(
      (constructor) => constructorId && constructor.uuid === constructorId,
    );
    if (constructor) {
      itemData = await prepareConstructorData(
        builderDB,
        projectId,
        collectionData,
        constructor,
        constructorMetaObj,
        currentUser,
        headers,
        itemData,
        decrypt,
        true,
        isDraft,
      );
    }
  }

  const validationResult = validateData(fields, itemData);
  if (!validationResult.isValid) {
    return {
      code: 400,
      status: 'error',
      type: 'Validation failed',
      message: validationResult.errors[0],
      data: validationResult.errors[0],
    };
  }
  const referenceFieldForm = fields.filter(
    (field) => field.type === reference.id && field.refCollection.displayType === 'innerForm',
  );
  let errorResponse = null;
  if (referenceFieldForm.length > 0) {
    await Promise.all(
      referenceFieldForm.map(async (field) => {
        const { fieldName, refCollection } = field;
        const refCollectionData = await findOneService(builderDB, {
          projectId,
          collectionName: refCollection.collectionName,
        });
        if (refCollectionData) {
          const innerItemResponse = await updateItemById(
            builderDB,
            dbConnection,
            projectId,
            environment,
            enableAuditTrail,
            refCollectionData,
            itemData[fieldName].uuid,
            itemData[fieldName],
            currentUser,
            headers,
            decrypt,
          );
          if (innerItemResponse.code === 200) {
            itemData[fieldName] = innerItemResponse.data.uuid;
          } else {
            errorResponse = innerItemResponse;
          }
        }
      }),
    );
  }
  if (errorResponse) return errorResponse;
  return await updateCollectionItem(
    builderDB,
    dbConnection,
    projectId,
    environment,
    enableAuditTrail,
    collectionData,
    itemId,
    itemData,
    currentUser,
  );
};
/**
 * TODO: This method is getting collection detail from DB
 * and collection details are getting again from wherever it get calls
 * @returns
 */

export const findItemById = async (
  dbConnection,
  builderDB,
  projectId,
  collection,
  itemId,
  initialQuery = null,
) => {
  if (!collection) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  let query = [{ $match: initialQuery ? initialQuery : { uuid: itemId } }];
  const { fields, collectionName } = collection;
  const belongsToFields = fields.filter((field) => field.type === belongsTo.id);
  const userGeneratedFields = fields.filter((field) =>
    [createdBy.id, updatedBy.id].includes(field.type),
  );
  const referenceFields = fields.filter((field) => onlyReferenceField.includes(field.type));

  if (belongsToFields && belongsToFields.length > 0) {
    belongsToFields.forEach((field) => {
      const { refCollection, fieldName } = field;
      let refCollectionName = refCollection ? refCollection.collectionName : null;
      if (refCollectionName) {
        query.push({
          $lookup: {
            from: refCollectionName,
            localField: fieldName,
            foreignField: 'uuid',
            as: fieldName,
          },
        });
      }
    });
  }
  if (userGeneratedFields && userGeneratedFields.length > 0) {
    userGeneratedFields.forEach((field) => {
      const { fieldName } = field;
      query.push({
        $lookup: {
          from: 'user',
          let: { [`${fieldName}`]: `$${fieldName}` },
          pipeline: [
            { $match: { $expr: { $eq: ['$uuid', `$$${fieldName}`] } } },
            { $project: { _id: 0, password: 0 } },
          ],
          as: fieldName,
        },
      });
    });
  }
  if (referenceFields && referenceFields.length > 0) {
    await Promise.all(
      referenceFields.map(async (field) => {
        const { fieldName, refCollection } = field;
        let refCollectionName = refCollection ? refCollection.collectionName : null;
        if (refCollectionName) {
          let lookupPipeline = [
            {
              $match: {
                $expr: {
                  $in: [
                    '$uuid',
                    {
                      $cond: {
                        if: { $isArray: `$$${fieldName}` },
                        then: { $ifNull: [`$$${fieldName}`, []] },
                        else: { $ifNull: [[`$$${fieldName}`], []] },
                      },
                    },
                  ],
                },
              },
            },
          ];
          if (collectionName === 'user') {
            const level2Coll = await findOneService(builderDB, {
              collectionName: refCollectionName,
              projectId,
            });

            if (level2Coll) {
              const level2CollFields = level2Coll.fields;
              if (level2CollFields && level2CollFields.length > 0) {
                let thirdLevelQuery = await getThirdLevelCollectionQuery(level2CollFields);
                lookupPipeline.push(...thirdLevelQuery);
              }
            }
          }

          lookupPipeline.push({
            $lookup: {
              from: userCollectionName,
              let: { createdBy: '$createdBy' },
              pipeline: [
                { $match: { $expr: { $eq: ['$uuid', '$$createdBy'] } } },
                { $project: { _id: 0, password: 0 } },
              ],
              as: 'createdBy',
            },
          });
          lookupPipeline.push({
            $lookup: {
              from: userCollectionName,
              let: { updatedBy: '$updatedBy' },
              pipeline: [
                { $match: { $expr: { $eq: ['$uuid', '$$updatedBy'] } } },
                { $project: { _id: 0, password: 0 } },
              ],
              as: 'updatedBy',
            },
          });

          query.push({
            $lookup: {
              from: refCollectionName,
              let: { [`${field.fieldName}`]: `$${field.fieldName}` },
              pipeline: lookupPipeline,
              as: field.fieldName,
            },
          });
        }
      }),
    );
  }
  let dbCollection = await dbConnection.collection(collectionName);
  let result = await dbCollection.aggregate(query).toArray();
  if (!result.length) {
    return { code: 404, message: 'Item not found with provided id' };
  }
  return { code: 200, message: 'success', data: result[0] };
};

const getThirdLevelCollectionQuery = async (fields) => {
  let query = [];
  const referenceFields = fields.filter((field) => onlyReferenceField.includes(field.type));
  if (!referenceFields || referenceFields.length == 0) {
    return [];
  }
  await Promise.all(
    referenceFields.map(async (field) => {
      const { refCollection, fieldName } = field;
      let refCollectionName = refCollection ? refCollection.collectionName : null;
      if (refCollectionName) {
        query.push({
          $lookup: {
            from: refCollectionName,
            let: { [`${fieldName}`]: `$${fieldName}` },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: [
                      '$uuid',
                      {
                        $cond: {
                          if: { $isArray: `$$${fieldName}` },
                          then: { $ifNull: [`$$${fieldName}`, []] },
                          else: { $ifNull: [[`$$${fieldName}`], []] },
                        },
                      },
                    ],
                  },
                },
              },
            ],
            as: fieldName,
          },
        });
      }
    }),
  );
  return query;
};

export const findOneItemByQuery = async (dbConnection, collectionName, query) => {
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  const res = await dbCollection.findOne(query);
  return res;
};

export const findOneItemByQueryC = async (dbCollection, collectionName, query) => {
  const res = await dbCollection.findOne(query);
  return res;
};

const findLastItem = async (dbConnection, collectionName) => {
  let dbCollection = await dbConnection.collection(collectionName);
  let res = await dbCollection.find().sort({ _id: -1 }).limit(1).toArray();
  return res[0];
};

const validateCompositeKeyData = async (dbConnection, collection, itemData, itemId) => {
  let errorJson = {};
  const { fields, constraints } = collection;
  const constraintsFields = constraints.find(
    (constraint) => constraint.constraintType === 'COMPOSITE',
  );
  if (constraintsFields) {
    const compositeFieldName = constraintsFields.fields.map((field) => field.value);
    let query = { project: {}, match: {} };
    if (itemId) {
      query.project['uuid'] = '$uuid';
      query.match['uuid'] = { $ne: itemId };
    }
    compositeFieldName.map((fieldName) => {
      const field = fields.find((field) => field.fieldName === fieldName);
      let fieldValue = itemData[fieldName];
      if (SelectOptionFields.includes(field.type)) {
        if (!Array.isArray(fieldValue)) {
          fieldValue = [fieldValue];
        }
        query.project[fieldName] = `$${fieldName}`;
        query.match[fieldName] = { $in: fieldValue ? fieldValue : [] };
      } else {
        // query.project[fieldName] = { $toLower: `$${fieldName}` };
        // query.match[fieldName] = { $eq: fieldValue ? fieldValue.toString() : fieldValue };
        query.project[fieldName] = 1;
        if (field.type === text.id) {
          query.match[fieldName] = { $regex: `^${fieldValue}$`, $options: 'i' }; //Case Insensitive
        } else {
          query.match[fieldName] = { $eq: fieldValue };
        }
      }
    });
    try {
      const countResponse = await countByMultipleQuery(
        dbConnection,
        collection.collectionName,
        query,
      );
      console.log('countResponse->>>', countResponse);
      if (countResponse > 0) {
        errorJson['message'] =
          'Already present data of these ' +
          constraintsFields.fields.map((field) => field.label).join(', ') +
          ' fields.';
      }
    } catch (e) {
      console.error('errr', e);
      // next(e)
    }
  }
  return errorJson;
};

export const countByMultipleQuery = async (dbConnection, collectionName, queryData) => {
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);

  let query = [
    {
      $project: queryData.project,
    },
    {
      $match: queryData.match,
    },
    { $group: { _id: null, count: { $sum: 1 } } },
  ];
  let data = await dbCollection.aggregate(query).toArray();
  if (data.length) return data[0].count;
  return;
};

export const countByQueryOther = async (
  dbConnection,
  collectionName,
  fieldName,
  fieldValue,
  itemId,
  isNewPhoneSignUp,
) => {
  if (!fieldValue) return;
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  let match;
  if (typeof fieldValue === 'string' && !isNewPhoneSignUp) {
    match = {
      [fieldName]: {
        $regex: `^${fieldValue}$` || '',
        $options: 'i',
      },
    };
  } else {
    match = {
      [fieldName]: { $eq: fieldValue },
    };
  }
  let query = [
    {
      $project: {
        [fieldName]: { $toLower: `$${fieldName}` },
      },
    },
    {
      $match: match,
    },
    { $group: { _id: null, count: { $sum: 1 } } },
  ];
  if (itemId) {
    match.uuid = { $ne: itemId };
    query = [
      {
        $project: {
          [fieldName]: { $toLower: `$${fieldName}` },
          uuid: '$uuid',
        },
      },
      {
        $match: match,
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ];
  }
  let data = await dbCollection.aggregate(query).toArray();
  if (data.length) return data[0].count;
  return;
};

export const removeItemById = async (
  dbConnection,
  builderDB,
  projectId,
  environment,
  enableAuditTrail,
  collectionName,
  itemId,
) => {
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  const query = { uuid: itemId };
  let result = await dbCollection.deleteOne(query);

  if (!result || (result.result && !result.result.n)) {
    return { code: 404, message: 'Item not found with provided id', data: {} };
  }
  // FINAL: START:Audit Trail
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'delete',
    '',
    collectionName,
    '',
    '',
    false,
    query,
  );
  // END:Audit Trail
  await deleteTypesenseDataService(builderDB, projectId, environment, collectionName, itemId);
  return { code: 200, message: 'Item Deleted Successfully', data: {} };
};

export const findAllItems = async (db, collectionName, data = {}) => {
  collectionName = collectionName.toString().toLowerCase();
  let skip = +data.skip || 0;
  let limit = +data.limit || 100;
  let result;
  let dbCollection = await db.collection(collectionName);

  if (data.sortBy) {
    result = await dbCollection
      .find({}, { _id: 0 })
      .skip(skip)
      .limit(limit)
      .collation({ locale: 'en' })
      .sort({ [data.sortBy]: data.orderBy || 1 })
      .toArray();
  } else {
    result = dbCollection.find({}, { _id: 0 }).skip(skip).limit(limit).toArray();
  }
  let count = await getItemCount(db, collectionName);
  return { code: 200, message: 'success', data: result, totalCount: count.data || 0 };
};

export const getItemCount = async (dbConnection, collectionName, query = {}) => {
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);
  let result = await dbCollection.countDocuments(query);
  return { code: 200, message: 'success', data: result };
};
export const innerFilterResult = async (
  builderDB,
  dbConnection,
  projectId,
  refCollection,
  filterId,
  queryData = {},
  headerToken,
  timezone,
  headers,
  dateFormat,
) => {
  let newQueryData = { ...queryData, pagination: 'false' };
  let collection = await findCollection(builderDB, projectId, refCollection, filterId);
  if (!collection || !collection.length) {
    return [];
  }

  console.log('dbConnection------------', dbConnection);
  const result = await filterItemService(
    builderDB,
    dbConnection,
    projectId,
    collection[0],
    filterId,
    newQueryData,
    headerToken,
    timezone,
    headers,
    0,
    0,
    true,
    dateFormat,
  );
  let value = [];
  if (result && result.code == 200) {
    const { count, result: data } = result;
    if (count) value = [result];
    else value = await data.map(({ uuid }) => uuid);
  }
  return value;
};

export const refCollectionResult = async (
  dbConnection,
  refCollection,
  finder = {},
  queryData = {},
  constants,
  currentUser,
  timezone,
  condition = {},
  refField,
  currentTenant,
  currentUserSettings,
  lookupConfig,
) => {
  if (!condition.query) return [];
  condition.query.field = refField;
  finder = { ...finder };
  finder.conditions = [condition];

  finder.finder = 'FIND_ALL';
  queryData.pagination = 'false';

  try {
    let mongoQuery = await queryParser(
      refCollection,
      finder,
      constants,
      queryData,
      currentUser,
      timezone,
      null,
      null,
      {},
      currentTenant,
      currentUserSettings,
      lookupConfig,
    );

    console.log('Executing query...', JSON.stringify(mongoQuery));

    let dbCollection = dbConnection.collection(refCollection);
    let result = await dbCollection
      .aggregate(JSON.parse(JSON.stringify(mongoQuery)), {
        collation: { locale: 'en' },
        allowDiskUse: true,
      })
      .toArray();

    queryData.pagination = true;
    return await result.map(({ uuid }) => uuid);
  } catch (error) {
    console.error('error refCollectionResult :>> ', error);
    return [];
  }
};

// Authenticate user via token
export const authenticateUser = async (builderDB, dbConnection, projectId, headerToken) => {
  if (!headerToken) return null;
  const isValidToken = await verifyToken(headerToken);
  if (!isValidToken || !isValidToken.sub) return null;

  const query = {
    $or: [
      { email: new RegExp(`^${isValidToken.sub}$`, 'i') },
      { userName: new RegExp(`^${isValidToken.sub}$`, 'i') },
    ],
  };

  const userCollection = await userCollectionService(builderDB, projectId);
  const user = await findItemById(dbConnection, builderDB, projectId, userCollection, null, query);

  return user?.data || null;
};

// Apply Row-Level Security (RLS)
export const applyRowLevelSecurity = async (
  dbConnection,
  builderDB,
  projectId,
  finder,
  rowLevelSecurityFilter,
  context,
) => {
  if (!finder.enableRls) return null;
  const rlsConfig = rowLevelSecurityFilter.find((filter) => filter.uuid === finder.rlsFilter);
  if (rlsConfig?.conditions.length) {
    await Promise.all(
      rlsConfig.conditions.map(async (condition) => {
        await replaceValuesInFilterConditions(
          dbConnection,
          builderDB,
          projectId,
          condition,
          rlsConfig,
          context,
        );
      }),
    );
  }

  return rlsConfig;
};

// Process finder conditions
export const processFinderConditions = async (
  dbConnection,
  builderDB,
  projectId,
  finder,
  context,
) => {
  if (!finder?.conditions.length) return;
  await Promise.all(
    finder.conditions.map(async (condition) => {
      await replaceValuesInFilterConditions(
        dbConnection,
        builderDB,
        projectId,
        condition,
        finder,
        context,
      );
    }),
  );
};

// Generate query dynamically
export const generateQuery = async (
  collectionName,
  finder,
  constants,
  queryData,
  currentUser,
  timezone,
  searchObj,
  refCollectionFields,
  searchQueryTypeObj,
  lookupConfig,
  rlsConfig,
  currentTenant,
  currentUserSettings,
) => {
  if (['SUM', 'AVG', 'MIN', 'MAX'].includes(finder.finder)) {
    return queryParserNew(
      collectionName,
      finder,
      constants,
      queryData,
      currentUser,
      timezone,
      searchObj,
      refCollectionFields,
      searchQueryTypeObj,
      lookupConfig,
    );
  } else {
    return queryParser(
      collectionName,
      finder,
      constants,
      queryData,
      currentUser,
      timezone,
      searchObj,
      refCollectionFields,
      searchQueryTypeObj,
      currentTenant,
      currentUserSettings,
      lookupConfig,
      rlsConfig,
    );
  }
};

export const filterItemService = async (
  builderDB,
  dbConnection,
  projectId,
  collection,
  filterId,
  queryData = {},
  headerToken,
  timezone,
  headers,
  count = 0,
  search = 0,
  stopNestedFilter = false,
  dateFormat,
  currentTenant,
) => {
  console.log('Starting filterItemService...');

  // Format date fields
  formatDateFields(queryData, dateFormat);
  const { collectionName, constants, finder, fields, lookups, enableLookup, noOfExternalParams } =
    collection;
  let { isPrivate, externalParams, refCollectionFields, rowLevelSecurityFilter } = collection;
  const lookupConfig = { enableLookup, lookups };
  console.log('lookupConfig filterItemService', lookupConfig);

  let currentUser = null;
  isPrivate = `${isPrivate}`;
  if (isPrivate === 'true') {
    currentUser = await authenticateUser(builderDB, dbConnection, projectId, headerToken);
    if (!currentUser)
      return { code: 401, message: 'Unauthorized', result: count ? '0' : [], count };
  }

  if (stopNestedFilter) finder.fieldsInclude = ['uuid']; // select uuid field from inner filter query

  if (noOfExternalParams != 0) {
    const result = checkParams(externalParams, queryData);
    if (!result) {
      return {
        code: 422,
        message: `External params should be in [${externalParams}]`,
        result: [],
        count,
      };
    }
  }
  // Handle search filters
  const { searchObj, searchQueryTypeObj } = processSearch(
    queryData,
    fields,
    externalParams,
    search,
  );

  const currentUserSettings = extractUserSettingFromUserAndTenant(currentUser, currentTenant);
  const commonSetting = {
    stopNestedFilter,
    queryData,
    searchObj,
    headers,
    currentUser,
    currentTenant,
    headerToken,
    timezone,
    dateFormat,
    lookupConfig,
    constants,
    currentUserSettings,
  };
  // Apply Row-Level Security (RLS)
  let rlsConfig = await applyRowLevelSecurity(
    dbConnection,
    builderDB,
    projectId,
    finder,
    rowLevelSecurityFilter,
    commonSetting,
  );
  // Process finder conditions
  await processFinderConditions(dbConnection, builderDB, projectId, finder, commonSetting);

  if (count) finder.finder = 'COUNT';
  console.log(')))))))))))))))))))))))))))))))))');

  try {
    console.log('Generating query...');
    const query = await generateQuery(
      collectionName,
      finder,
      constants,
      queryData,
      currentUser,
      timezone,
      searchObj,
      refCollectionFields,
      searchQueryTypeObj,
      lookupConfig,
      rlsConfig,
      currentTenant,
      currentUserSettings,
    );

    console.log('Executing query...', JSON.stringify(query));
    let dbCollection = dbConnection.collection(collectionName);
    let result = await dbCollection
      .aggregate(JSON.parse(JSON.stringify(query)), {
        collation: { locale: 'en' },
        allowDiskUse: true,
      })
      .toArray();

    // Process results based on finder type
    result = processQueryResult(finder.finder, result, queryData);

    result = processFieldsInclude(finder, result, currentUser);
    return { code: 200, message: 'success', result, count };
  } catch (error) {
    console.log('error filterItemService :>> ', error);
    return { code: 400, message: error.message };
  }
};
/*
export const filterItemServiceOld = async (
  builderDB,
  dbConnection,
  projectId,
  collection,
  filterId,
  queryData = {},
  headerToken,
  timezone,
  headers,
  count = 0,
  search = 0,
  stopNestedFilter = false,
  dateFormat,
  currentTenant,
) => {
  console.log('****** $$$$$$$ %%%%%%%%% $$$$$$$$$ ********');
  Object.keys(queryData).forEach((key) => {
    if ((key.startsWith('start_') || key.startsWith('end_')) && queryData[key].length <= 10) {
      queryData[key] = moment(queryData[key], dateFormat).format('YYYY-MM-DD');
    }
  });
  const { collectionName } = collection;
  let {
    isPrivate,
    constants,
    externalParams,
    finder,
    noOfExternalParams,
    refCollectionFields,
    fields,
    enableLookup,
    lookups,
    rowLevelSecurityFilter,
  } = collection;
  let req = null;
  const lookupConfig = { enableLookup, lookups };
  console.log('lookupConfig filterItemService', lookupConfig);
  //Don't remove eval will use this
  // eslint-disable-next-line no-unused-vars
  req = { db: dbConnection };

  let currentUser;
  isPrivate = `${isPrivate}`;
  console.log('filterItemService 3');
  console.log(`Current User checking 3 ${moment.now()}`);
  if (isPrivate == 'true') {
    if (!headerToken)
      return { code: 401, message: 'No Token Provided', result: count ? '0' : [], count };
    const isValidToken = await verifyToken(headerToken);
    if (
      !isValidToken ||
      Object.keys(isValidToken).length === 0 ||
      !Object.keys(isValidToken).includes('sub')
    ) {
      return { code: 401, message: 'Invalid Token', result: count ? '0' : [], count };
    }
    const emailQuery = { email: { $regex: `^${isValidToken.sub}$`, $options: 'i' } };
    const usernameQuery = { userName: { $regex: `^${isValidToken.sub}$`, $options: 'i' } };
    const query = { $or: [emailQuery, usernameQuery] };

    const userCollection = await userCollectionService(builderDB, projectId);
    currentUser = await findItemById(
      dbConnection,
      builderDB,
      projectId,
      userCollection,
      null,
      query,
    );

    currentUser = currentUser.data;
    if (!currentUser)
      return { code: 401, message: 'Invalid Token', result: count ? '0' : [], count };
  }
  if (stopNestedFilter) finder.fieldsInclude = ['uuid']; // select uuid field from inner filter query
  if (count) finder.finder = 'COUNT';
  if (noOfExternalParams != 0) {
    externalParams = externalParams.map((extParam) => extParam.split('---'));
    externalParams = externalParams.flat();
    const reqQueryParams = Object.keys(queryData);
    if (!externalParams.every((param) => reqQueryParams.includes(param))) {
      return {
        code: 422,
        message: `External params should be in [${externalParams}]`,
        result: [],
        count,
      };
    }
  }
  let searchObj = null;
  let searchQueryTypeObj = {};
  const currentUserSettings = extractUserSettingFromUserAndTenant(currentUser, currentTenant);
  console.log('filterItemService 6');
  if (search) {
    searchObj = Object.assign({}, queryData);
    delete searchObj.offset;
    delete searchObj.limit;
    if (externalParams.length) {
      externalParams.forEach((param) => {
        delete searchObj[param];
      });
    }
    Object.keys(searchObj).forEach((field) => {
      let isExist = fields.find((x) => {
        if (x.fieldName === field) {
          return x;
        }
        if (field.startsWith('start_') || field.startsWith('end_')) {
          let extractField = field.replace('start_', '');
          extractField = extractField.replace('end_', '');
          if (extractField === x.fieldName) {
            return x;
          }
        }
      });
      if (!isExist) delete searchObj[field];
      if (isExist) searchQueryTypeObj[field] = isExist.type;
    });
  }
  console.log(`Finder Calculation 4 ${moment.now()}`);
  const commonSetting = {
    stopNestedFilter,
    queryData,
    searchObj,
    headers,
    currentUser,
    currentTenant,
    headerToken,
    timezone,
    dateFormat,
    lookupConfig,
    constants,
    currentUserSettings,
  };
  let rlsConfig;
  if (finder.enableRls) {
    rlsConfig = rowLevelSecurityFilter.find((filter) => filter.uuid === finder.rlsFilter);
    if (rlsConfig && rlsConfig.conditions.length) {
      await Promise.all(
        rlsConfig.conditions.map(async (condition) => {
          await replaceValuesInFilterConditions(
            dbConnection,
            builderDB,
            projectId,
            condition,
            rlsConfig,
            commonSetting,
          );
        }),
      );
    }
  }
  if (finder && finder.conditions.length) {
    await Promise.all(
      finder.conditions.map(async (condition) => {
        await replaceValuesInFilterConditions(
          dbConnection,
          builderDB,
          projectId,
          condition,
          finder,
          commonSetting,
        );
      }),
    );
  }
  if (count) finder.finder = 'COUNT';
  console.log(')))))))))))))))))))))))))))))))))');
  try {
    let refCollectionFieldsInItems =
      refCollectionFields && refCollectionFields.length ? refCollectionFields : null;
    console.log('>>>>>>>>>> searchObj 5 :>> ', searchObj, moment.now());
    let query = '';
    console.log('lookupConfig just', lookupConfig);
    if (['SUM', 'AVG', 'MIN', 'MAX'].includes(finder.finder)) {
      query = await queryParserNew(
        collectionName,
        finder,
        constants,
        queryData,
        currentUser,
        timezone,
        searchObj,
        refCollectionFieldsInItems,
        searchQueryTypeObj,
        lookupConfig,
      );
    } else {
      query = await queryParser(
        collectionName,
        finder,
        constants,
        queryData,
        currentUser,
        timezone,
        searchObj,
        refCollectionFieldsInItems,
        searchQueryTypeObj,
        currentTenant,
        currentUserSettings,
        lookupConfig,
        rlsConfig,
      );
    }
    console.log(`query $$$$$$$$$$$`, query);
    let result = await eval(query);
    console.log(':::::::::result');
    if (finder.finder == 'COUNT') {
      result = `${result && result.length ? result[0].count : 0}`;
    } else if (finder.finder == 'SUM') {
      result = `${result && result.length ? result[0].total : 0}`;
    } else if (finder.finder == 'AVG') {
      result = `${result && result.length ? result[0].average : 0}`;
    } else if (finder.finder == 'MIN') {
      result = `${result && result.length ? result[0].minimum : 0}`;
    } else if (finder.finder == 'MAX') {
      result = `${result && result.length ? result[0].maximum : 0}`;
    }
    result = processFieldsInclude(finder, result, currentUser);
    return { code: 200, message: 'success', result, count };
  } catch (error) {
    console.log('error filterItemService :>> ', error);
    return { code: 400, message: error.message };
  }
};
*/
export const addItemToField = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  collection,
  itemData,
) => {
  const refFields = collection.fields.filter((field) => field.type === reference.id);
  const collectionName = collection.collectionName;

  return await Promise.all(
    refFields.map(async (field) => {
      const collectionField = field.fieldName;
      const refItemIds = itemData[field.fieldName];
      if (refItemIds) {
        refItemIds.map(async (refItemId) => {
          const updateItem = await addItemToReferenceItemField(
            builderDB,
            dbConnection,
            projectId,
            enableAuditTrail,
            itemData.itemId,
            refItemId,
            collectionName,
            collectionField,
          );
          return updateItem;
        });
      }
    }),
  );
};

export const addToCollectionItem = async (
  builderDB,
  dbConnection,
  projectId,
  environment,
  enableAuditTrail,
  collectionName,
  itemId,
  itemFieldId,
  itemData,
  currentUser = {},
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  delete itemData.uuid; // if user is trying to pass uuid for update;
  itemData = await convertPasswordTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    itemData,
    itemId,
  );
  itemData = await convertStringDataToObject(collectionData, itemData);
  itemData = await convertSingleItemToList(collectionData, itemData);
  itemData.updatedAt = new Date();
  if (!itemData.createdBy && currentUser) {
    itemData.createdBy = currentUser.uuid;
  }
  if (currentUser) itemData['updatedBy'] = currentUser.uuid;
  //TODO: need to check if we need to add version here
  /* save refs to field flow*/
  const refsResult = await addItemToField(
    builderDB,
    dbConnection,
    projectId,
    enableAuditTrail,
    collectionData,
    itemData,
    itemFieldId,
    itemId,
  );
  if (refsResult && refsResult[0] && refsResult[0].value === null) {
    await removeItemById(
      dbConnection,
      builderDB,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      itemFieldId,
    );
    return {
      code: 400,
      message: `Can't save more than one if refrence field is not multi selectd`,
      data: `Can't save more than one item if Child Of field Reference field is not multi select`,
    };
  }
  /*end save refs to field flow */
  //fetch update item data
  const collection = await findOneService(builderDB, {
    projectId,
    collectionName,
  });
  const updatedItemData = await findItemById(
    dbConnection,
    builderDB,
    projectId,
    collection,
    itemId,
    null,
  );
  if (updatedItemData.code === 200) {
    itemData.itemData = updatedItemData.data;
  }
  itemData.uuid = itemId;
  return { code: 200, message: 'Added Successfully', data: itemData };
};

export const addToItemFieldById = async (
  builderDB,
  dbConnection,
  projectId,
  environment,
  enableAuditTrail,
  collectionName,
  itemId,
  itemFieldId,
  itemData,
  currentUser = {},
) => {
  if (itemData && !itemData.dataItemId) {
    return { code: 404, data: { error: `Collection item not found!` } };
  }

  return await addToCollectionItem(
    builderDB,
    dbConnection,
    projectId,
    environment,
    enableAuditTrail,
    collectionName,
    itemId,
    itemFieldId,
    itemData,
    currentUser,
  );
};

export const removeItemFromField = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  collection,
  itemData,
) => {
  const refFields = collection.fields.filter((field) => field.type === reference.id);
  return await Promise.all(
    refFields.map(async (field) => {
      const { fieldName } = field;
      const refItemIds = itemData[fieldName];
      if (refItemIds) {
        refItemIds.map(async (refItemId) => {
          const updateItem = await removeItemFromReferenceItemField(
            builderDB,
            dbConnection,
            projectId,
            enableAuditTrail,
            itemData.itemId,
            refItemId,
            collection,
            fieldName,
          );
          return updateItem;
        });
      }
    }),
  );
};

const getItemForUpdate = (item, keysToExcludeOnUpsert) => {
  delete item[keysToExcludeOnUpsert];
  return item;
};

export const updateBulkData = async (
  builderDB,
  db,
  projectId,
  environment,
  enableAuditTrail,
  collectionName,
  selectedItemsIdsArr,
  body,
  user,
  headers,
  decrypt,
) => {
  let errorResponse = null;
  let responseData = {};

  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return {
      success: false,
      errorResponse: { code: 404, data: `Collection not found with provided name` },
    };
  }
  //Encryption
  let APP_ENV = process.env.APP_ENV;
  const { enableEncryption, encryptions, dateFormat } = await findProjectByQuery(builderDB, {
    uuid: projectId,
  });
  let encryption = null;
  if (enableEncryption && encryptions) {
    encryption = encryptions.find((enc) => enc.envType.toLowerCase() === APP_ENV.toLowerCase());
    if (encryption) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        console.log('result.status', result.status);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
        } else {
          return result;
        }
      }
      //Now generate client's private key
      const { awsConfig, encryptionType, dataKey } = encryption;
      if (encryptionType === 'KMS') {
        const { accessKeyId, secretAccessKey, region } = awsConfig;
        const config = {
          region,
          accessKeyId,
          secretAccessKey,
        };
        const plainTextData = await processKMSDecryption(config, dataKey, {});
        if (plainTextData.status === 'FAILED') {
          return plainTextData;
        }
        encryption.dataKey = plainTextData.data;
      }
    }
  }
  let { fields } = collectionData;
  fields = fields.filter((field) => field.type !== 'file');

  if (enableEncryption && encryption) {
    console.log('::>> I am going to check encryption');
    const cryptResponse = await processItemEncryptDecrypt(body, fields, encryption, false);
    body = cryptResponse;
  }

  body = formatProjectDates(body, dateFormat, fields, true);
  body = formatFieldsOfItem(body, fields);

  await Promise.all(
    selectedItemsIdsArr.map(async (itemId) => {
      if (!errorResponse) {
        const response = await updateItemById(
          builderDB,
          db,
          projectId,
          environment,
          enableAuditTrail,
          collectionData,
          itemId,
          body,
          user,
          headers,
          decrypt,
        );
        if (response.code === 200) {
          responseData[itemId] = response.data;
        } else {
          errorResponse = response;
        }
      }
    }),
  );
  if (errorResponse) {
    return { success: false, errorResponse };
  }
  return { success: true, responseData };
};

export const saveBulkDataFromDeveloperAPI = async (
  builderDB,
  dbConnection,
  projectId,
  collectionName,
  items,
  primaryKey,
) => {
  let APP_ENV = process.env.APP_ENV;
  const { enableEncryption, encryptions, dateFormat } = await findProjectByQuery(builderDB, {
    uuid: projectId,
  });
  let primeDbConnection = await dbConnection.collection(collectionName);
  let bulk = primeDbConnection.initializeUnorderedBulkOp();
  const collection = await findOneService(builderDB, { projectId, collectionName });
  let { fields } = collection;
  let encryption = null;
  if (enableEncryption && encryptions) {
    encryption = encryptions.find((enc) => enc.envType.toLowerCase() === APP_ENV.toLowerCase());
    if (encryption) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        console.log('result.status', result.status);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
        } else {
          return result;
        }
      }
      //Now generate client's private key
      const { awsConfig, encryptionType, dataKey } = encryption;
      if (encryptionType === 'KMS') {
        const { accessKeyId, secretAccessKey, region } = awsConfig;
        const config = {
          region,
          accessKeyId,
          secretAccessKey,
        };
        const plainTextData = await processKMSDecryption(config, dataKey, {});
        if (plainTextData.status === 'FAILED') {
          return plainTextData;
        }
        encryption.dataKey = plainTextData.data;
      }
    }
  }
  fields = fields.filter((field) => field.type !== 'file');
  const finalFindQuery = [];
  for (let item of items) {
    if (enableEncryption && encryption) {
      const cryptResponse = await processItemEncryptDecrypt(item, fields, encryption, false);
      item = cryptResponse;
    }
    const itemUuid = item.uuid ? item.uuid : uuidv4();
    console.log('itemUuid', itemUuid);
    item[primaryKey] = item[primaryKey] ? item[primaryKey] : uuidv4();

    item = formatProjectDates(item, dateFormat, fields, true);
    item = formatFieldsOfItem(item, fields);
    item.createdAt = new Date();
    item.updatedAt = new Date();
    item.version = 0;
    const findQuery = { [primaryKey]: item[primaryKey] };
    finalFindQuery.push(findQuery[primaryKey]);
    console.log('***********************************');
    console.log('###################################');
    bulk
      .find(findQuery)
      .upsert()
      .updateOne({
        $set: item,
        $setOnInsert: { uuid: itemUuid },
      });
  }
  let result = [];
  if (BulkHasOperations(bulk)) {
    await bulk.execute();
    console.log('finalFindQuery', finalFindQuery);
    result = await primeDbConnection.find({ [primaryKey]: { $in: finalFindQuery } }).toArray();
    result = result.map((item) => item.uuid);
  } else {
    console.log("I don't have bulk");
  }
  return result;
};

export const saveBulkDataInDb = async (dbConnection, connectorData, data = []) => {
  const { collectionName, connectorType, customPrimaryKey } = connectorData;
  console.log('**************************************');
  console.log('*****************saveBulkDataInDb******START***************');
  console.log('**************************************');
  console.log('customPrimaryKey', customPrimaryKey);
  let primaryKey = customPrimaryKey
    ? customPrimaryKey
    : getPrimaryFieldNameOfDataSource(connectorType);
  if (!Array.isArray(data)) data = [data];
  let primeDbConnection = await dbConnection.collection(collectionName);

  let bulk = primeDbConnection.initializeUnorderedBulkOp();
  console.log('primaryKey', primaryKey);
  const finalFindQuery = [];
  const itemsPrimaryKeyValues = data.map((item) => {
    const itemUuid = item.uuid ? item.uuid : uuidv4();
    console.log('itemUuid', itemUuid);
    item[primaryKey] = item[primaryKey] ? item[primaryKey] : uuidv4();
    console.log('item[primaryKey]', item[primaryKey]);
    const findQuery = getFindQuery(connectorType, item, customPrimaryKey);
    console.log('findQuery', findQuery);
    finalFindQuery.push(findQuery[primaryKey]);
    console.log('finalFindQuery', finalFindQuery);
    const itemsToUpdate = getItemForUpdate(item, 'uuid');
    console.log('itemsToUpdate', itemsToUpdate);
    bulk
      .find(findQuery)
      .upsert()
      .updateOne({
        $set: itemsToUpdate,
        $setOnInsert: { uuid: itemUuid },
      });
    return item[primaryKey];
  });
  let result = [];
  if (BulkHasOperations(bulk)) {
    await bulk.execute();
    result = await primeDbConnection.find({ [primaryKey]: { $in: finalFindQuery } }).toArray();
    result = result.map((item) => item.uuid);
  }

  console.log('**************************************');
  console.log('*****************saveBulkDataInDb******END***************');
  console.log('**************************************');
  return { primaryKey, itemsPrimaryKeyValues, itemsUuid: result };
};

const removeItemFromReferenceItemField = async (
  builderDB,
  db,
  projectId,
  enableAuditTrail,
  belongsToItemId,
  recordId,
  collection,
  field,
) => {
  if (!collection) {
    return { code: 422, data: { error: `Collection not found with provided name` } };
  }
  let { fields, collectionName } = collection;
  const refFieldOfBelongsTo = fields.find((e) => e.fieldName === field);

  collectionName = collectionName.toString();
  let dbCollection = await db.collection(collectionName);

  const query = { uuid: belongsToItemId };
  if (refFieldOfBelongsTo.isMultiSelect) {
    query[field] = { $size: 0 };
  }
  // FINAL: START:Audit Trail
  const collItem = await dbCollection.findOne(query);
  const newData = removeItemFromArray(collItem);
  createAuditTrail(
    db,
    enableAuditTrail,
    'NORMAL',
    'update',
    '',
    collectionName,
    { [field]: newData },
    {
      [field]: collItem[field],
    },
  );
  // END:Audit Trail

  const updatedRecord = await dbCollection.findOneAndUpdate(query, {
    $pull: {
      [field]: recordId,
    },
  });
  return updatedRecord;
};

export const findOneByEqualFieldValueAndUpdate = async (
  dbConnection,
  enableAuditTrail,
  collectionName,
  query,
  referenceField,
  childFieldValue,
) => {
  const dbCollection = dbConnection.collection(collectionName);
  // FINAL: START:Audit Trail
  const collItem = await dbCollection.find(query);
  const newValue = collItem[referenceField];
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'update',
    '',
    collectionName,
    { [referenceField]: newValue.push(childFieldValue) },
    { [referenceField]: collItem[referenceField] },
  );
  // END:Audit Trail
  return await dbCollection.findOneAndUpdate(
    query,
    { $push: { [referenceField]: childFieldValue } },
    isNew,
  );
};

export const removeFromItemFieldById = async (
  builderDB,
  dbConnection,
  projectId,
  environment,
  enableAuditTrail,
  collectionName,
  itemId,
  itemFieldId,
  itemData,
  currentUser = {},
) => {
  if (itemData && !itemData.dataItemId) {
    return { code: 404, data: { error: `Collection item not found!` } };
  }

  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 404, data: { error: `Collection not found with provided name` } };
  }
  delete itemData.uuid; // if user is trying to pass uuid for update;
  itemData = await convertPasswordTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    itemData,
    itemId,
  );
  itemData = await convertStringDataToObject(collectionData, itemData);
  itemData = await convertSingleItemToList(collectionData, itemData);
  itemData.updatedAt = new Date();
  if (!itemData.createdBy && currentUser) {
    itemData.createdBy = currentUser.uuid;
  }
  if (itemData['updatedBy'] && currentUser) itemData['updatedBy'] = currentUser.uuid;
  //TODO: need to check if we need to add version here
  /* save refs to field flow*/
  const refsResult = await removeItemFromField(
    builderDB,
    dbConnection,
    projectId,
    enableAuditTrail,
    collectionData,
    itemData,
  );
  if (refsResult && refsResult[0] && refsResult[0].value === null) {
    await removeItemById(
      dbConnection,
      builderDB,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      itemFieldId,
    );
    return {
      code: 400,
      message: `Can't save more than one if reference field is not multi selected`,
      data: `Can't save more than one item if Child Of field Reference field is not multi select`,
    };
  }
  // We already getting collection info above
  // So commenting this
  // const collection = await findOneService(builderDB, {
  //   projectId,
  //   collectionName,
  // });
  const updatedItemData = await findItemById(
    dbConnection,
    builderDB,
    projectId,
    collectionData,
    itemId,
    null,
  );
  if (updatedItemData.code === 200) {
    itemData.itemData = updatedItemData.data;
  }
  itemData.uuid = itemId;
  return { code: 200, message: 'Removed Successfully', data: itemData };
};

export const getItemsByQueryWithPagination = async (
  builderDB,
  dbConnection,
  collectionName,
  projectId,
  initialQuery,
  page,
  size,
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  let query = [{ $match: initialQuery ? initialQuery : {} }];
  const { fields } = collectionData;
  if (fields.length) {
    await Promise.all(
      fields.map((field) => {
        if (onlyReferenceField.includes(field.type)) {
          let collectionName = field.refCollection ? field.refCollection.collectionName : null;
          if (collectionName) {
            query.push({
              $lookup: {
                from: `${collectionName}`,
                let: { [`${field.fieldName}`]: `$${field.fieldName}` },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $in: [
                          '$uuid',
                          {
                            $cond: {
                              if: { $in: [`$$${field.fieldName}`, ['', null]] },
                              then: [],
                              else: { $ifNull: [`$$${field.fieldName}`, []] },
                            },
                          },
                        ],
                      },
                    },
                  },
                  {
                    $lookup: {
                      from: userCollectionName,
                      let: { createdBy: '$createdBy' },
                      pipeline: [
                        { $match: { $expr: { $eq: ['$uuid', '$$createdBy'] } } },
                        { $project: { _id: 0, password: 0 } },
                      ],
                      as: 'createdBy',
                    },
                  },
                  {
                    $lookup: {
                      from: userCollectionName,
                      let: { updatedBy: '$updatedBy' },
                      pipeline: [
                        { $match: { $expr: { $eq: ['$uuid', '$$updatedBy'] } } },
                        { $project: { _id: 0, password: 0 } },
                      ],
                      as: 'updatedBy',
                    },
                  },
                ],
                as: field.fieldName,
              },
            });
          }
        }
        if (field.type === belongsTo.id) {
          let collectionName = field.refCollection ? field.refCollection.collectionName : null;
          if (collectionName) {
            query.push({
              $lookup: {
                from: `${collectionName}`,
                localField: field.fieldName,
                foreignField: 'uuid',
                as: field.fieldName,
              },
            });
          }
        }
        if ([createdBy.id, updatedBy.id].includes(field.type))
          query.push({
            $lookup: {
              from: `user`,
              let: { [`${field.fieldName}`]: `$${field.fieldName}` },
              pipeline: [
                { $match: { $expr: { $eq: ['$uuid', `$$${field.fieldName}`] } } },
                { $project: { _id: 0, password: 0 } },
              ],
              as: field.fieldName,
            },
          });
      }),
    );
  }
  collectionName = collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);

  if (page && size) {
    query.push({ $sort: { _id: -1 } });
    query.push({ $skip: size * page }, { $limit: +size });
  }
  let result = await dbCollection.aggregate(query).toArray();
  if (!result.length) {
    return { code: 404, message: 'Item not found with provided id' };
  }
  return { code: 200, message: 'success', data: result };
};

export const importItemFromCSV = async (
  builderDB,
  db,
  projectId,
  collectionName,
  user = {},
  body,
  tenant = {},
) => {
  let { fields, items } = body;
  const collectionData = await checkCollectionByName(builderDB, projectId, collectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }
  let { fields: collectionFields } = collectionData;
  collectionFields = filterFieldsForCSVImport(collectionFields);
  let allowedCollectionFieldList = collectionFields.map((element) => element.fieldName);
  if (fields.length > allowedCollectionFieldList.length) {
    allowedCollectionFieldList = allowedCollectionFieldList.filter((key) => fields.includes(key));
  } else {
    allowedCollectionFieldList = fields.filter((key) => allowedCollectionFieldList.includes(key));
  }

  //Intersection of field from collection and CSV
  console.log('allowedCollectionFieldList', allowedCollectionFieldList);
  const finalItems = items.map((record) => {
    const item = {};
    allowedCollectionFieldList.forEach((key) => (item[key] = record[key]));
    return item;
  });
  let savedItems = [];
  let errors = [];
  for (let item of finalItems) {
    if (collectionName === 'user') {
      if (!item.password) {
        item.password = uuidv4();
      }
    }
    const processedItem = await prepareCSVItem(
      builderDB,
      db,
      projectId,
      collectionData,
      item,
      user,
      tenant,
    );
    if (processedItem.error) {
      errors.push(processedItem.message);
    } else {
      if (processedItem.itemData && Object.keys(processedItem.itemData).length > 0) {
        savedItems.push(processedItem.itemData);
      }
    }
  }
  if (errors && errors.length > 0) {
    errors = [].concat(...errors);
    errors = errors.filter((el, i) => errors.indexOf(el) === i);
    console.error('errors', errors);
  }

  if (savedItems.length > 0) {
    console.log('finalItems', finalItems);
    let dbCollection = await db.collection(collectionName);
    const savedRecords = await dbCollection.insertMany(finalItems);
    return { status: 200, data: savedRecords, errors };
  } else {
    return {
      status: 422,
      msg: `Failed to import CSV`,
      errors,
    };
  }
};

const prepareCSVItem = async (
  builderDB,
  dbConnection,
  projectId,
  collection,
  item,
  user = {},
  tenant = {},
) => {
  let itemData = await convertSingleItemToList(collection, item);
  const errorJson = await validateItemCollection(dbConnection, collection, itemData);
  if (Object.keys(errorJson).length !== 0) {
    const message = Object.keys(errorJson).map((key) => `${key}:${errorJson[key]}`);
    return { error: true, message };
  }
  itemData = await convertStringDataToObject(collection, itemData);
  itemData = await convertPasswordTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collection,
    itemData,
  );
  itemData.createdAt = new Date();
  itemData.updatedAt = new Date();
  itemData.uuid = uuidv4();
  itemData.version = 0;
  itemData = addUserAndTenantFieldsInItem(itemData, user, tenant);
  return { error: false, itemData };
};

export const addUserAndTenantFieldsInItem = (itemData, user, tenant) => {
  if (!itemData.tenantId || (Array.isArray(itemData.tenantId) && itemData.tenantId.length === 0))
    itemData.tenantId = tenant?.uuid ? [tenant.uuid] : [];
  if (!itemData.createdBy || (Array.isArray(itemData.createdBy) && itemData.createdBy.length === 0))
    itemData.createdBy = user?.uuid ? user.uuid : '';
  if (!itemData.updatedBy || (Array.isArray(itemData.updatedBy) && itemData.updatedBy.length === 0))
    itemData.updatedBy = user?.uuid ? user.uuid : '';
  return itemData;
};

const filterFieldsToBeSaved = (collection, itemData) => {
  let { fields } = collection;
  let arr = Object.keys(itemData);
  const fieldsToBeDeleted = {};

  for (let obj of arr) {
    let find = fields.find((field) => field.fieldName === obj);
    if (!find && obj !== 'isDraft') {
      fieldsToBeDeleted[obj] = 1;
    }
  }

  if (Object.keys(fieldsToBeDeleted).length > 0) {
    for (let field in fieldsToBeDeleted) {
      delete itemData[field];
    }
  }
  return { fieldsToBeDeleted, itemData };
};

export const downloadPDF = async (key, builderDB, projectId, isEncrypted, environment) => {
  try {
    const pdfBufferData = await privateUrl(key, builderDB, projectId, isEncrypted, environment);
    if (!pdfBufferData) {
      console.log('error while fetching pdfBufferData');
    }
    const tempDir = os.tmpdir();
    const pdf_uuid = uuidv4();
    const pdfPath = path.join(tempDir, `${pdf_uuid}.pdf`);
    fs.writeFileSync(pdfPath, pdfBufferData);
    return pdfPath;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
};

// Function to extract text from a PDF file
export const extractTextFromPDF = async (pdfPath) => {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const text = await PdfParse(dataBuffer);
    fs.unlinkSync(pdfPath);
    return text.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return error;
  }
};

export const dataViewLogs = async (req) => {
  try {
    const {
      builderDB,
      db,
      params,
      headers,
      projectId,
      protocol,
      originalUrl,
      enableAuditTrail,
      environment,
    } = req;
    const { collectionName, filterId = '', itemId = '' } = params;
    const { authorization } = headers;
    const collectionData = await checkCollectionByName(
      builderDB,
      projectId,
      'data_view_activity_tracker',
    );
    if (!collectionData) {
      console.log('Data View Tracker Plugin not Installed');
      return;
    }
    const url = `${protocol}://${req.get('host')}${originalUrl}`;
    let currentUser;
    const isValidToken = await verifyToken(authorization);
    const emailQuery = { email: { $regex: `^${isValidToken.sub}$`, $options: 'i' } };
    const usernameQuery = { userName: { $regex: `^${isValidToken.sub}$`, $options: 'i' } };
    const query = { $or: [emailQuery, usernameQuery] };
    const userCollection = await userCollectionService(builderDB, projectId);
    currentUser = await findItemById(db, builderDB, projectId, userCollection, null, query);

    currentUser = currentUser.data;
    const ipAddress = headers['x-user-ip'];
    const data = {
      collName: collectionName,
      userName: currentUser.userName,
      filterId: filterId,
      url: url,
      ipAddress: ipAddress,
      itemId: itemId,
    };
    const saveItemResponse = await saveCollectionItem(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      collectionData,
      data,
      currentUser,
      headers,
      environment,
    );
    return saveItemResponse;
  } catch (error) {
    console.error('Error adding data view logs:', error);
    return error;
  }
};

export const replaceValuesInFilterConditions = async (
  dbConnection,
  builderDB,
  projectId,
  condition,
  finder,
  context,
) => {
  const {
    stopNestedFilter,
    queryData,
    searchObj,
    headers,
    currentUser,
    currentTenant,
    headerToken,
    timezone,
    dateFormat,
    lookupConfig,
    constants,
    currentUserSettings,
  } = context;
  if (!condition.query) return;
  let {
    fieldType,
    refCollection,
    refField,
    isFilter,
    field,
    value: innerFilterId,
  } = condition.query;
  if ([reference.id, belongsTo.id].includes(fieldType)) {
    if (!refCollection) return;
    let value = [];
    if (isFilter && !stopNestedFilter) {
      value = await innerFilterResult(
        builderDB,
        dbConnection,
        projectId,
        refCollection,
        innerFilterId,
        queryData,
        headerToken,
        timezone,
        headers,
        dateFormat,
      );
    } else {
      if (refCollection === 'CURRENT_USER') {
        console.log('>>>>>>>>>>>>CURRENT_USER>>>>>>>>>>>>>>');
        console.log('refField', refField);

        const tenantId = headers['x-tenant-id'];
        value =
          refField && refField === 'tenantId' && tenantId
            ? tenantId
            : currentUser[refField] && currentUser[refField].length
            ? currentUser[refField][0].uuid
            : '';
        console.log('item.service.js ~ finder.conditions.map ~ value#1:', value);
        //Fallback to get Current User Id
        if (currentUser && !value && _.get(currentUser, refField)) {
          value = currentUser.uuid;
          console.log('item.service.js ~ finder.conditions.map ~ value#2:', value);
        }
      } else if (refCollection === 'CURRENT_TENANT') {
        if (currentTenant && currentTenant[refField]) {
          const refFieldData = currentTenant[refField];
          if (Array.isArray(refFieldData) && refFieldData.length) {
            value = refFieldData[0]?.uuid ? refFieldData[0].uuid : refFieldData[0];
          } else value = refFieldData;
        }
        console.log('item.service.js~ finder.conditions.map ~ value#3:', value);
      } else if (refCollection === 'CURRENT_SETTINGS') {
        if (currentUserSettings && currentUserSettings[refField]) {
          const refFieldData = currentUserSettings[refField];
          if (Array.isArray(refFieldData) && refFieldData.length) {
            value = refFieldData[0]?.uuid ? refFieldData[0].uuid : refFieldData[0];
          } else {
            value = refFieldData;
          }
        }
        console.log('item.service.js~ finder.conditions.map settings ~ value#4:', value);
      } else {
        if (isEntityInCondition(innerFilterId)) {
          const key = innerFilterId.replace('ENTITY::', '');
          condition.query.value = queryData[key] ? queryData[key] : '';
          delete searchObj[key];
        }
        value = await refCollectionResult(
          dbConnection,
          refCollection,
          finder,
          queryData,
          constants,
          currentUser,
          timezone,
          condition,
          refField,
          currentTenant,
          currentUserSettings,
          lookupConfig,
        );
      }
      condition.query.field = field;
    }
    console.log('🚀 ~ file: item.service.js:1364 ~ finder.conditions.map ~ value:', value);
    if (['undefined', 'null', null, undefined, ''].includes(value)) {
      /*NOTE: In case field is not present in old record then fieldValue is undefined
        we assign some random string to avoid resulting all values
        This is use case in Spot Factor Project, where a new user with blank value able to see all records
      */
      value = `random_string_since_field_not_present_${moment(1318874398806).valueOf()}`;
      condition.query.value = value;
    }
    //NOTE: Reassign value if condition meet
    if (
      (Array.isArray(value) && value.length) ||
      (!Array.isArray(value) && !value.startsWith('random_string_since_field_not_present_'))
    ) {
      condition.query.value = value;
      condition.requiredExternal = false;
    }
  } else if (fieldType === dynamic_option.id) {
    if (!refCollection) return;
    let value = [];
    if (isFilter && !stopNestedFilter) {
      value = await innerFilterResult(
        builderDB,
        dbConnection,
        projectId,
        refCollection,
        innerFilterId,
        queryData,
        headerToken,
        timezone,
        headers,
        dateFormat,
      );
    } else {
      console.log('refField', refField);
      if (refCollection === 'CURRENT_USER') {
        console.log('>>>>>>>>>>>>CURRENT_USER>>>>>>>>>>>>>>');
        value = currentUser && currentUser[refField] ? currentUser[refField] : '';
        console.log('item.service.js ~ finder.conditions.map ~ value#1:', value);
      } else if (refCollection === 'CURRENT_TENANT') {
        console.log('>>>>>>>>>>>>CURRENT_TENANT>>>>>>>>>>>>>>');
        value = currentTenant && currentTenant[refField] ? currentTenant[refField] : '';
        console.log('item.service.js~ finder.conditions.map ~ value#2:', value);
      } else if (refCollection === 'CURRENT_SETTINGS') {
        console.log('>>>>>>>>>>>>CURRENT_SETTINGS>>>>>>>>>>>>>>');
        value =
          currentUserSettings && currentUserSettings[refField] ? currentUserSettings[refField] : '';
        console.log('item.service.js~ finder.conditions.map settings ~ value#3:', value);
      }
    }
    console.log('🚀 ~ file: item.service.js:1364 ~ finder.conditions.map ~ value:', value);
    if (['undefined', 'null', null, undefined, ''].includes(value)) {
      /*NOTE: In case field is not present in old record then fieldValue is undefined
        we assign some random string to avoid resulting all values
        This is use case in Spot Factor Project, where a new user with blank value able to see all records
      */
      value = `random_string_since_field_not_present_${moment(1318874398806).valueOf()}`;
    }
    console.log('item.service.js~ finder.conditions.map settings ~ value#4:', value);
    //NOTE: Reassign value if condition meet
    if (
      (Array.isArray(value) && value.length) ||
      (!Array.isArray(value) && !value.startsWith('random_string_since_field_not_present_'))
    ) {
      condition.query.value = value;
      condition.requiredExternal = false;
    }
  }
};

export const getItemToPurchase = async (
  builderDB,
  dbConnection,
  projectId,
  collectionName,
  itemId,
) => {
  const collection = await findOneService(builderDB, {
    projectId,
    collectionName,
  });

  const productData = await findItemById(
    dbConnection,
    builderDB,
    projectId,
    collection,
    itemId,
    null,
  );
  if (!productData) {
    return { code: 400, message: 'No Products found', status: 'failed' };
  }
  let product = productData.data;
  // Decrypting Data for Imagine Pay, BNG Payment, Stripe, Fluid
  let encryptedResponse;
  if (product) {
    encryptedResponse = await cryptService(
      product,
      builderDB,
      projectId,
      collection,
      true,
      false,
      true,
    );
  }
  if (encryptedResponse) {
    if (encryptedResponse.status === 'FAILED') {
      return { code: 400, message: encryptedResponse.message, status: 'failed' };
    } else {
      product = encryptedResponse;
    }
  }

  return product;
};
export const getReferenceCollectionFieldData = async (
  fullNameParts,
  selectedCollectionData,
  productToPurchase,
) => {
  console.log('==> STRIPE CONNECT processCheckout has REFERENCE :>> ', fullNameParts);
  let refFieldName = fullNameParts[0];
  let refCollectionData = selectedCollectionData
    ? JSON.parse(selectedCollectionData).filter((cd) => cd.fieldName === refFieldName)[0]
    : '';
  console.log('==> STRIPE CONNECT processCheckout has REFERENCE refCollectionData :>> ');
  const refCollectionName = refCollectionData ? refCollectionData.refCollection.collectionName : '';
  let refCollectionField = fullNameParts[1];
  if (!refCollectionField) {
    refCollectionField = refCollectionData ? refCollectionData.refCollection.collectionField : '';
  }
  const refCollectionValue = productToPurchase[refFieldName][0];

  console.log(
    '==> STRIPE CONNECT processCheckout has REFERENCE refCollectionName :>> ',
    refCollectionName,
    '==> refCollectionField :>> ',
    refCollectionField,
    '==> refCollectionValue :>> ',
    refCollectionValue,
  );

  if (!refCollectionValue) {
    return { code: 400, message: 'Reference Collection Item not found', status: 'failed' };
  }
  console.log('==> STRIPE CONNECT processCheckout refCollectionValue :>> ');
  return refCollectionValue[refCollectionField];
};

export const downloadFile = async (document, builderDB, environment) => {
  try {
    const { key, originalName, mimeType, size, isEncrypted, projectId } = document;
    const fileBufferData = await privateUrl(key, builderDB, projectId, isEncrypted, environment);
    if (!fileBufferData) {
      console.log('Error while fetching fileBufferData');
      throw new Error('No data returned from privateUrl');
    }
    const extension = path.extname(originalName) || '';
    const baseName = path.basename(originalName, extension);
    const uniqueFileName = `${baseName}-${uuidv4()}${extension}`;
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, uniqueFileName);
    fs.writeFileSync(filePath, fileBufferData);
    return {
      fieldname: '',
      originalname: originalName,
      encoding: 'binary',
      mimetype: mimeType || 'application/octet-stream',
      destination: tempDir,
      filename: uniqueFileName,
      path: filePath,
      size: size,
    };
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
};

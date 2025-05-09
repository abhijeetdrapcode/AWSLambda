import { restructureData } from 'drapcode-utility';
import {
  getFileObjectList,
  getMappingObjKey,
  getItemDataForArrayFields,
  getPrimaryFieldNameOfDataSource,
} from 'external-api-util';
import {
  FieldTypes,
  AIRTABLE,
  StringFields,
  mixedField,
  OptionTypeFields,
} from 'drapcode-constant';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import _ from 'lodash';
import { findOneService } from '../collection/collection.service';
import {
  findOneByEqualFieldValueAndUpdate,
  findOneItemByQuery,
  saveBulkDataInDb,
} from '../item/item.service';
import { logger } from 'drapcode-logger';
import { createAuditTrail } from '../logs/audit/audit.service';

const { reference, date, belongsTo, file } = FieldTypes;

const transformData = async (
  dbConnection,
  projectId,
  enableAuditTrail,
  item,
  dataSourceItemKey,
  mappingObjKey,
  collectionMappingFieldsDataType,
  collectionMapping = {},
  itemUuid,
  sessionValue = {},
) => {
  const collectionMappingObj = collectionMappingFieldsDataType[mappingObjKey];
  if (
    !collectionMappingObj ||
    collectionMappingObj === 'undefined' ||
    Object.keys(collectionMappingObj).length === 0
  ) {
    return _.get(item, dataSourceItemKey);
  }
  const { type, extraFieldSetting, validation, refCollection } = collectionMappingObj;
  if ([...StringFields, ...mixedField].includes(type)) {
    if (dataSourceItemKey.includes('current_session.')) {
      dataSourceItemKey = dataSourceItemKey.replace('current_session.', '');
      console.log('dataSourceItemKey current_session', dataSourceItemKey);
      return _.get(sessionValue, dataSourceItemKey);
    }
    return _.get(item, dataSourceItemKey);
  }
  if (OptionTypeFields.includes(type)) {
    return getItemDataForArrayFields(item, dataSourceItemKey);
  }
  if (reference.id === type) {
    //Find value form refernece filed collection
    let itemFieldData = getItemDataForArrayFields(item, dataSourceItemKey);
    const { refCollectionField } = collectionMapping[mappingObjKey];
    if (!refCollectionField) {
      return itemFieldData;
    }
    const referenceRecordsUuids = await Promise.all(
      itemFieldData.map(async (e) => {
        const matchingValueRecord = await findOneItemByQuery(
          dbConnection,
          refCollection.collectionName,
          { [refCollectionField]: { $eq: e } },
        );
        return matchingValueRecord ? matchingValueRecord.uuid : '';
      }),
    );
    return referenceRecordsUuids;
  }
  if (belongsTo.id === type) {
    let itemFieldData = _.get(item, dataSourceItemKey);
    itemFieldData = itemFieldData
      ? Array.isArray(itemFieldData)
        ? itemFieldData[0]
        : itemFieldData
      : '';

    const { refCollectionField } = collectionMapping[mappingObjKey];
    if (!refCollectionField || !itemFieldData) {
      return itemFieldData;
    }
    const matchingValueRecord = await findOneByEqualFieldValueAndUpdate(
      dbConnection,
      enableAuditTrail,
      refCollection.collectionName,
      { [refCollectionField]: { $eq: itemFieldData } },
      refCollection.parentCollectionField,
      itemUuid,
    );
    return matchingValueRecord && matchingValueRecord.value ? matchingValueRecord.value.uuid : '';
  }
  if (date.id === type) {
    const itemFieldData = _.get(item, dataSourceItemKey);
    return itemFieldData
      ? extraFieldSetting && extraFieldSetting.dateDisplayType === 'date'
        ? moment(itemFieldData).format('YYYY-MM-DD')
        : moment.utc(itemFieldData).format()
      : '';
  }
  if (file.id === type) {
    const itemFieldData = _.get(item, dataSourceItemKey);
    const fileUrls = itemFieldData
      ? Array.isArray(itemFieldData)
        ? itemFieldData.length > 0 && typeof itemFieldData[0] === 'object'
          ? itemFieldData.map((e) => e.url)
          : itemFieldData
        : [itemFieldData]
      : [];

    if (fileUrls.length < 1) {
      return '';
    }

    const result = getFileObjectList(fileUrls, projectId);
    return validation.noAllowedFiles && validation.noAllowedFiles === 1 ? result[0] : result;
  }
  return _.get(item, dataSourceItemKey);
};

const changeKeyOfDataSourceObjects = async (
  dbConnection,
  projectId,
  enableAuditTrail,
  dataArr = [],
  collectionMapping = {},
  refKeyMapping,
  collectionMappingFieldsDataType = {},
  refCollection,
  referenceFieldsData,
  connectorType,
  addOnDataForItems = {},
  sessionValue = {},
  isUpdate = false,
) => {
  let result = [];
  const finalMappingOfKeyForRef = {};
  for (const refCollectionKey in refKeyMapping) {
    finalMappingOfKeyForRef[refCollectionKey] = {};
  }
  await Promise.all(
    dataArr.map(async (item) => {
      let finalItemUuidToSave = null;
      if (Object.keys(refKeyMapping).length > 0) {
        const primaryKey = getPrimaryFieldNameOfDataSource(connectorType);
        finalItemUuidToSave = await processRefDataForCollection(
          dbConnection,
          projectId,
          enableAuditTrail,
          item,
          refKeyMapping,
          refCollection,
          connectorType,
          primaryKey,
          finalMappingOfKeyForRef,
          sessionValue,
        );
      }

      let newItem = {};
      let isNewItemEmpty = true;
      let itemUuid = uuidv4();
      if (connectorType === AIRTABLE) {
        itemUuid = item['_airtableRecordId'];
      }
      await Promise.all(
        Object.keys(collectionMapping).map(async (fieldName) => {
          let dataSourceItemKey = getMappingObjKey(collectionMapping, fieldName);
          if (dataSourceItemKey) {
            newItem[fieldName] = await transformData(
              dbConnection,
              projectId,
              enableAuditTrail,
              item,
              dataSourceItemKey,
              fieldName,
              collectionMappingFieldsDataType,
              collectionMapping,
              itemUuid,
              sessionValue,
            );
            isNewItemEmpty = false;
          }
        }),
      );
      for (const fieldRefKey in finalItemUuidToSave) {
        newItem[fieldRefKey] = Array.isArray(finalItemUuidToSave[fieldRefKey])
          ? finalItemUuidToSave[fieldRefKey]
          : [finalItemUuidToSave[fieldRefKey]];
      }
      if (!isNewItemEmpty) {
        if (!isUpdate) newItem.createdAt = new Date();
        newItem.updatedAt = new Date();
        newItem.uuid = item.uuid ? item.uuid : itemUuid;
      }
      newItem = { ...newItem, ...referenceFieldsData, ...addOnDataForItems };
      result.push(newItem);
    }),
  );
  return result;
};

const processRefDataForCollection = async (
  dbConnection,
  projectId,
  enableAuditTrail,
  item,
  refKeyMapping,
  refCollection,
  connectorType,
  primaryKey,
  finalMappingOfKeyForRef,
  sessionValue = {},
) => {
  const finalItemUuidToSave = {};
  for (const refCollectionKey in refKeyMapping) {
    const refCollectionMapping = refKeyMapping[refCollectionKey];
    if (Object.keys(refCollectionMapping).length > 0) {
      const refCollectionField = Object.keys(refCollectionMapping)[0].split('.')[0];
      const selectedCollection = refCollection[refCollectionKey];
      let refCollectionMappingFieldsDataType = {};
      const { fields, collectionName } = selectedCollection;
      for (let key in refCollectionMapping) {
        key = key.replace(`${refCollectionKey}.`, '');
        const field = fields.find((e) => e.fieldName === key);
        field ? (refCollectionMappingFieldsDataType[field.fieldName] = field) : '';
      }
      let refData = item[refCollectionMapping[`${refCollectionField}.itemsPath`]];
      const extractRefFromMapping = {};
      for (let key in refCollectionMapping) {
        if (key !== `${refCollectionField}.itemsPath`) {
          let extractRefValueKey = refCollectionMapping[key].split('.');
          extractRefValueKey.shift();
          extractRefFromMapping[key.split('.')[1]] = extractRefValueKey.join('.');
        }
      }
      if (refData) {
        if (!Array.isArray(refData)) refData = [refData];
        const refCollectionItem = await extractRefItemAndSave(
          dbConnection,
          projectId,
          enableAuditTrail,
          connectorType,
          refData,
          extractRefFromMapping,
          refCollectionMappingFieldsDataType,
          collectionName,
          refCollectionKey,
          primaryKey,
          finalMappingOfKeyForRef,
          sessionValue,
        );
        finalItemUuidToSave[refCollectionKey] = refCollectionItem;
      }
    }
  }
  return finalItemUuidToSave;
};

const extractRefItemAndSave = async (
  dbConnection,
  projectId,
  enableAuditTrail,
  connectorType,
  dataArr = [],
  collectionMapping,
  collectionMappingFieldsDataType,
  collectionName,
  refCollectionKey,
  primaryKey,
  finalMappingOfKeyForRef,
  sessionValue = {},
) => {
  let result = [];
  let refResultUuid = finalMappingOfKeyForRef[refCollectionKey];
  await Promise.all(
    dataArr.map(async (item) => {
      let newItem = {};
      let isNewItemEmpty = true;
      await Promise.all(
        Object.keys(collectionMapping).map(async (fieldName) => {
          let dataSourceItemKey = getMappingObjKey(collectionMapping, fieldName);
          if (dataSourceItemKey) {
            newItem[fieldName] = await transformData(
              dbConnection,
              projectId,
              enableAuditTrail,
              item,
              dataSourceItemKey,
              fieldName,
              collectionMappingFieldsDataType,
              collectionMapping,
              itemUuid,
              sessionValue,
            );
            isNewItemEmpty = false;
          }
        }),
      );
      let itemUuid;
      if (refResultUuid[newItem[primaryKey]]) {
        itemUuid = refResultUuid[newItem[primaryKey]];
      } else {
        itemUuid = uuidv4();
        if (connectorType === AIRTABLE) {
          itemUuid = item['_airtableRecordId'];
        }
        refResultUuid[newItem[primaryKey]] = itemUuid;
      }

      if (!isNewItemEmpty) {
        newItem.createdAt = new Date();
        newItem.updatedAt = new Date();
        newItem.uuid = item.uuid ? item.uuid : itemUuid;
      }
      result.push(newItem);
    }),
  );
  const primaryKeyQuery = await saveBulkDataInDb(
    dbConnection,
    { collectionName, connectorType, customPrimaryKey: '' },
    result,
  );
  return primaryKeyQuery.itemsUuid;
};

const mappingData = async (
  dbConnection,
  projectId,
  enableAuditTrail,
  data,
  collectionMapping,
  refKeyMapping,
  collectionMappingFieldsDataType,
  refCollection,
  connectorType,
  sessionValue = {},
  referenceFieldsData = {},
  addOnDataForItems = {},
  isUpdate = false,
) => {
  if (!data && !sessionValue) return;
  if (!Array.isArray(data)) data = [data];
  const newArray = await changeKeyOfDataSourceObjects(
    dbConnection,
    projectId,
    enableAuditTrail,
    data,
    collectionMapping,
    refKeyMapping,
    collectionMappingFieldsDataType,
    refCollection,
    referenceFieldsData,
    connectorType,
    addOnDataForItems,
    sessionValue,
    isUpdate,
  );
  return newArray.filter((value) => Object.keys(value).length !== 0);
};

export const runConnectorProcess = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  collectionName,
  connectorType,
  collectionMapping,
  itemsPath,
  dataSourceData,
  sessionValue,
  customPrimaryKey = '',
  addOnDataForItems = {},
  isUpdate = false,
) => {
  try {
    const dataSourceCollection = await findOneService(builderDB, {
      collectionName,
      projectId,
    });
    if (!dataSourceCollection) {
      return;
    }
    const { fields } = dataSourceCollection;
    const refTypeFields = fields.filter((field) => field.type === reference.id);
    let refKeyMappingForCollection = {};
    let refKeyMapping = {};
    let refCollection = {};
    if (refTypeFields && refTypeFields.length > 0) {
      refTypeFields.forEach((refField) => {
        const inMapData = {};
        Object.keys(collectionMapping).forEach((colKeyMap) => {
          if (colKeyMap.includes(`${refField.fieldName}.`)) {
            inMapData[colKeyMap] = collectionMapping[colKeyMap];
            delete collectionMapping[colKeyMap];
          }
        });
        refKeyMappingForCollection[refField.fieldName] = refField.refCollection.collectionName;
        refKeyMapping[refField.fieldName] = inMapData;
      });

      if (Object.keys(refKeyMapping).length > 0) {
        for (let key in refKeyMapping) {
          refCollection[key] = await findOneService(builderDB, {
            collectionName: refKeyMappingForCollection[key],
            projectId,
          });
        }
      }
    }

    let collectionMappingFieldsDataType = {};
    let referenceFieldsData = {};
    for (let key in collectionMapping) {
      const field = fields.find((e) => e.fieldName === key);
      if (field) {
        collectionMappingFieldsDataType[field.fieldName] = field;
      }
    }
    logger.info(`itemsPath: ${itemsPath}`, { label: 'EXTERNAL_API' });
    if (itemsPath) {
      dataSourceData = _.get(dataSourceData, itemsPath);
    }
    if (dataSourceData) {
      dataSourceData = restructureData(dataSourceData);
      let replacedData = await mappingData(
        dbConnection,
        projectId,
        enableAuditTrail,
        dataSourceData,
        collectionMapping,
        refKeyMapping,
        collectionMappingFieldsDataType,
        refCollection,
        connectorType,
        sessionValue,
        referenceFieldsData,
        addOnDataForItems,
        isUpdate,
      );
      await checkAndSaveParentRefCollection(
        dbConnection,
        projectId,
        enableAuditTrail,
        collectionName,
        refCollection,
        replacedData,
      );
      //TODO: Need to enable Audit Trail for bulk save
      const primaryKeyQuery = await saveBulkDataInDb(
        dbConnection,
        { collectionName, connectorType, customPrimaryKey },
        replacedData,
      );
      return primaryKeyQuery;
    }
  } catch (error) {
    console.error(error);
  }
};

const checkAndSaveParentRefCollection = async (
  dbConnection,
  projectId,
  enableAuditTrail,
  mainCollectionName,
  refCollection,
  replacedData,
) => {
  for (const collection in refCollection) {
    const { fields } = refCollection[collection];
    //Will update only one parent relation
    const field = fields.find((field) => {
      return field?.refCollection?.collectionName === mainCollectionName;
    });
    console.log('field', field);
    if (field) {
      await Promise.all(
        replacedData.map(async (item) => {
          const refItemUuids = item[collection];
          if (refItemUuids && refItemUuids !== 'undefined' && refItemUuids.length > 0) {
            await addMultiReference(dbConnection, collection, enableAuditTrail, {
              fieldName: field.fieldName,
              finderItemUuids: refItemUuids,
              isMultiSelect: field.isMultiSelect,
              refItemUuid: item['uuid'],
            });
          }
        }),
      );
    }
  }
};

const addMultiReference = async (db, collectionName, enableAuditTrail, data) => {
  const { fieldName, finderItemUuids, isMultiSelect, refItemUuid } = data;
  let dbCollection = await db.collection(collectionName);
  let res = null;
  const query = { uuid: { $in: finderItemUuids } };

  // FINAL: START:Audit Trail
  createAuditTrail(
    db,
    enableAuditTrail,
    'EXTERNAL',
    'update',
    '',
    collectionName,
    { [fieldName]: refItemUuid },
    { [fieldName]: 'Multiple record may be updated. Please check for query' },
    true,
    query,
    'Multiple record may be updated. Please check for query',
  );
  // END:Audit Trail
  if (isMultiSelect) {
    res = await dbCollection.updateMany(query, {
      $push: {
        [fieldName]: refItemUuid,
      },
    });
  } else {
    res = await dbCollection.updateMany(query, {
      $set: {
        [fieldName]: refItemUuid,
      },
    });
  }
  return res;
};

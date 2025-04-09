import {
  checkCollectionByName,
  findCollection,
  findOneService,
} from '../collection/collection.service';
import {
  findItemById,
  list,
  modifiedList,
  removeItemById,
  saveBulkDataFromDeveloperAPI,
  saveItem,
  updateItemById,
} from '../item/item.service';
import { cryptService } from '../middleware/encryption.middleware';
import { checkPermissionLevelSecurity } from '../item/item.utils';
import { COLLECTION_NOT_EXIST_MSG } from '../utils/appUtils';
import {
  bulkDeleteBuilder,
  dynamicEmailService,
  processItemsByFilter,
  sendEmailService,
  updateFileObjectById,
} from './developer.service';

import { processFileFieldForURL } from '../upload-api/fileUpload.service';
export const createItem = async (req, res, next) => {
  const { builderDB, params, db, body, user, projectId, enableAuditTrail, environment } = req;
  const { constructorId, collectionName } = params;
  try {
    const response = await saveItem(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      body,
      constructorId,
      user,
    );

    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};
export const createBulkItem = async (req, res, next) => {
  const { builderDB, params, db, body, projectId } = req;
  const { collectionName } = params;

  const { items, primaryKey } = body;
  try {
    const results = await saveBulkDataFromDeveloperAPI(
      builderDB,
      db,
      projectId,
      collectionName,
      items,
      primaryKey,
    );
    return res.status(200).send(results);
  } catch (err) {
    next(err);
  }
};
export const findItemsByFilter = async (req, res) => {
  const {
    builderDB,
    params,
    headers,
    query,
    projectId,
    db,
    timezone,
    dateFormat,
    decrypt,
    environment,
    tenant,
  } = req;
  const { collectionName, filterUuid } = params;
  const { authorization } = headers;

  try {
    let collection = await findCollection(builderDB, projectId, collectionName, filterUuid);
    if (!collection || !collection.length) {
      return res.status(404).send('No Collection found');
    }
    collection = collection[0];
    let { code, result, message } = await processItemsByFilter(
      builderDB,
      db,
      projectId,
      collection,
      filterUuid,
      authorization,
      timezone,
      headers,
      query,
      0,
      1,
      false,
      dateFormat,
      tenant,
    );

    if (decrypt) {
      let encryptedResponse;
      if (result) {
        encryptedResponse = await cryptService(
          result,
          builderDB,
          projectId,
          collection,
          true,
          false,
          decrypt,
        );
      }
      if (encryptedResponse) {
        if (encryptedResponse.status === 'FAILED') {
          res.status(400).send({ message: encryptedResponse.message });
        } else {
          result = encryptedResponse;
        }
      }
    }

    const { permissionLevelSecurity = [], fields } = collection;
    result = await processFileFieldForURL(result, builderDB, projectId, environment, fields);
    if (permissionLevelSecurity && permissionLevelSecurity.length) {
      result = await checkPermissionLevelSecurity(
        builderDB,
        db,
        projectId,
        authorization,
        permissionLevelSecurity,
        result,
      );
    }
    let response = code != 200 ? { code, message } : result;
    res.status(code).json(response);
  } catch (error) {
    console.error(error);
    res.status(400).json({ code: 400, message: 'Failed' });
  }
};
export const countItemsByFilter = async (req, res) => {
  const { builderDB, params, headers, query, projectId, db, timezone, dateFormat } = req;
  const { collectionName, filterUuid } = params;
  const { authorization } = headers;
  try {
    let collection = await findCollection(builderDB, projectId, collectionName, filterUuid);
    if (!collection || !collection.length) {
      return res.status(404).send('No Collection found');
    }
    collection = collection[0];

    let { code, result, message } = await processItemsByFilter(
      builderDB,
      db,
      projectId,
      collection,
      filterUuid,
      authorization,
      timezone,
      headers,
      query,
      1,
      1,
      false,
      dateFormat,
    );
    let response = code != 200 ? { code, message } : result;
    res.status(code).json(response);
  } catch (error) {
    console.error('error', error);
    res.status(400).json({ message: 'Failed' });
  }
};
export const findAllItems = async (req, res) => {
  try {
    //TODO: Duplicate Collection finding. Need to fix
    const { builderDB, db, params, projectId, decrypt, headers, environment } = req;
    const ids = req.body.ids || req.query.ids;
    const { collectionName } = params;
    const reqQuery = req.query;
    const { authorization } = headers;

    let result = await list(builderDB, db, projectId, collectionName, ids, reqQuery, decrypt);
    if (!result) {
      res.status(200).send([]);
      return;
    }
    const collection = await findOneService(builderDB, {
      projectId,
      collectionName,
    });
    const { permissionLevelSecurity = [], fields } = collection;
    result = await processFileFieldForURL(result, builderDB, projectId, environment, fields);
    if (permissionLevelSecurity && permissionLevelSecurity.length) {
      result = await checkPermissionLevelSecurity(
        builderDB,
        db,
        projectId,
        authorization,
        permissionLevelSecurity,
        result,
      );
    }
    return res.status(200).send(result);
  } catch (error) {
    res.status(400).json({ message: 'Failed' });
  }
};
export const findAllUpdatedItems = async (req, res) => {
  try {
    const { builderDB, db, params, projectId, decrypt, headers, environment } = req;
    const ids = req.body.ids || req.query.ids;
    const { collectionName } = params;
    const { authorization } = headers;
    let result = await modifiedList(builderDB, db, projectId, collectionName, ids, req.query);
    if (!result) {
      res.status(200).send([]);
      return;
    }
    const collection = await findOneService(builderDB, {
      projectId,
      collectionName,
    });
    if (decrypt) {
      let encryptedResponse;
      if (result) {
        encryptedResponse = await cryptService(
          result,
          builderDB,
          projectId,
          collection,
          true,
          false,
          decrypt,
        );
      }
      if (encryptedResponse) {
        if (encryptedResponse.status === 'FAILED') {
          res.status(400).send({ message: encryptedResponse.message });
        } else {
          result = encryptedResponse;
        }
      }
      const { permissionLevelSecurity = [], fields } = collection;
      result = await processFileFieldForURL(result, builderDB, projectId, environment, fields);
      if (permissionLevelSecurity && permissionLevelSecurity.length) {
        result = await checkPermissionLevelSecurity(
          builderDB,
          db,
          projectId,
          authorization,
          permissionLevelSecurity,
          result,
        );
      }
    }
    return res.status(200).send(result);
  } catch (error) {
    console.error('error', error);
    res.status(400).json({ message: 'Failed' });
  }
};
export const findItemDetail = async (req, res) => {
  try {
    const { builderDB, params, db, projectId, decrypt, headers, environment } = req;
    const { collectionName, itemUuid } = params;
    const { authorization } = headers;
    const collection = await findOneService(builderDB, {
      projectId,
      collectionName,
    });
    const result = await findItemById(db, builderDB, projectId, collection, itemUuid, null);
    if (!result) {
      res.status(404).send({ message: `Record not found with id ${itemUuid}` });
      return;
    }
    if (decrypt) {
      let encryptedResponse;
      if (result && result.data) {
        encryptedResponse = await cryptService(
          result.data,
          builderDB,
          projectId,
          collection,
          true,
          false,
          decrypt,
        );
      }
      if (encryptedResponse) {
        if (encryptedResponse.status === 'FAILED') {
          res.status(400).send({ message: encryptedResponse.message });
        } else {
          result.data = encryptedResponse;
        }
      }
    }
    const { permissionLevelSecurity = [], fields } = collection;
    result.data = await processFileFieldForURL(
      result.data,
      builderDB,
      projectId,
      environment,
      fields,
    );
    if (permissionLevelSecurity && permissionLevelSecurity.length) {
      result.data = await checkPermissionLevelSecurity(
        builderDB,
        db,
        projectId,
        authorization,
        permissionLevelSecurity,
        result.data,
      );
    }
    return res.status(result.code).send(result.data);
  } catch (error) {
    console.log('error :>> ', error);
    res.status(400).json({ message: 'Failed' });
  }
};
export const updateItem = async (req, res) => {
  try {
    const { builderDB, params, body, user, projectId, db, enableAuditTrail, environment } = req;
    const { collectionName, itemUuid } = params;
    const collectionData = await findOneService(builderDB, { projectId, collectionName });
    if (!collectionData) {
      return res.status(404).send('Collection not found with provided name');
    }
    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionData,
      itemUuid,
      body,
      user,
    );
    return res.status(response.code).send(response.data);
  } catch (error) {
    res.status(400).json({ message: 'Failed' });
  }
};
export const deleteItem = async (req, res) => {
  try {
    const { builderDB, db, params, projectId, enableAuditTrail, environment } = req;
    let { itemUuid, collectionName } = params;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);
    let data = await removeItemById(
      db,
      builderDB,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      itemUuid,
    );
    res.status(data.code || 500).send(data);
  } catch (error) {
    res.status(400).json({ message: 'Failed' });
  }
};

export const bulkDelete = async (req, res) => {
  try {
    const { builderDB, db, params, projectId, body } = req;
    let { collectionName } = params;
    const { ids } = body;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);
    if (!ids || !ids.length)
      return res.status(404).send({ code: 404, message: 'Uuids not found in request body' });
    const query = { uuid: { $in: ids } };
    let data = await bulkDeleteBuilder(db, collectionName, query);
    let code = 0;
    let resBody = {};
    if (!data || (data.result && !data.result.n)) {
      code = 404;
      resBody = {
        code: 404,
        message: 'Items not found with provided id',
        deletedCount: data?.deletedCount || 0,
      };
    } else {
      code = 200;
      resBody = { message: 'Items Deleted Successfully', deletedCount: data?.deletedCount || 0 };
    }
    res.status(code).send(resBody);
  } catch (error) {
    console.error('\n error :>> ', error);
    res.status(500).json({ message: 'Failed' });
  }
};

export const sendEmail = async (req, res) => {
  try {
    const response = await sendEmailService(req);
    console.log('\n response sendEmailService :>> ', response);
    res.status(200).send(response);
  } catch (error) {
    console.error('\n error :>> ', error);
    const message = error.message ? error.message : 'Failed';
    res.status(400).json({ message });
  }
};

export const sendDynamicEmail = async (req, res) => {
  try {
    const response = await dynamicEmailService(req);
    console.log('\n response sendDynamicEmail :>> ', response);
    res.status(200).send(response);
  } catch (error) {
    console.error('\n error :>> ', error);
    const message = error.message ? error.message : 'Failed';
    res.status(400).json({ message });
  }
};

export const updateFileObject = async (req, res) => {
  try {
    const { params, body, db, user, enableAuditTrail, query } = req;
    const { collectionName, fileObjectUuid } = params || {};
    const { itemUuid = '', fieldName = '' } = query || {};
    if (!collectionName || !fileObjectUuid) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }
    const response = await updateFileObjectById(
      body,
      db,
      enableAuditTrail,
      user,
      collectionName,
      itemUuid,
      fileObjectUuid,
      fieldName,
    );
    return res.status(response.code).send(response);
  } catch (error) {
    console.error('Error Updating File Object :>>', error);
    return res.status(400).json({ message: error.message ? error.message : 'Failed' });
  }
};

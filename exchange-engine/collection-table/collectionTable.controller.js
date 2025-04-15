import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { existsSync, unlinkSync } from 'fs';
import { findItemById, list, filterItemService, dataViewLogs } from '../item/item.service';
import { findCollection, findOneService } from '../collection/collection.service';
import { checkPermissionLevelSecurity, createCSVFile } from '../item/item.utils';
import { cryptService } from '../middleware/encryption.middleware';
import { createProfilerService, updateProfilerService } from '../profiling/profiler.service';
import { API, COMPUTING } from '../utils/enums/ProfilerType';
const { stringify } = require('csv-stringify');

export const collectionTableItems = async (req, res, next) => {
  try {
    const { builderDB, db, params, projectId, body, query } = req;
    const ids = body.ids || query.ids;
    const reqQuery = query;
    const { collectionName } = params;
    let result = await list(builderDB, db, projectId, collectionName, ids, reqQuery, true);
    if (!result) {
      return res.status(200).send([]);
    }
    return res.status(200).send(result);
  } catch (err) {
    next(err);
  }
};

export const exportFilterItems = async (req, res, next) => {
  try {
    const { builderDB, db, params, headers, query, projectId, timezone, dateFormat, tenant } = req;
    const { collectionName, filterId } = params;
    const { authorization } = headers;
    let collection = await findCollection(builderDB, projectId, collectionName, filterId);
    if (!collection || !collection.length) {
      return res.status(400).send('No Collection found');
    }
    collection = collection[0];
    let { code, result, message } = await filterItemService(
      builderDB,
      db,
      projectId,
      collection,
      filterId,
      query,
      authorization,
      timezone,
      headers,
      0,
      1,
      false,
      dateFormat,
      tenant,
    );
    console.log('####################');
    if (code !== 200) {
      return res.status(code).send(message);
    }
    let fileName = uuidv4();
    let localFilePath = process.env.FILE_UPLOAD_PATH || '/tmp/drapcode-uploads/';
    const exportFileName = `${collectionName}_${fileName}.csv`;
    localFilePath += exportFileName;
    if (existsSync(localFilePath)) {
      unlinkSync(localFilePath);
    }
    let encryptedResponse;
    if (result) {
      encryptedResponse = await cryptService(
        result,
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
        return res.status(422).send(encryptedResponse.message);
      } else {
        result = encryptedResponse;
      }
    }

    const { finalData, headerColumns } = await createCSVFile(collection, localFilePath, result);
    stringify(finalData, { header: true, columns: headerColumns }, (err, str) => {
      res.setHeader('content-type', 'text/csv');
      res.setHeader('content-disposition', `attachment;filename=${encodeURI(exportFileName)}`);
      res.status(200).end(str);
    });
  } catch (err) {
    next(err);
  }
};

export const collectionTableFilterItems = async (req, res, next) => {
  const apiEnterUuid = uuidv4();
  try {
    console.log('******** Collection Items $$$$ ************', moment.now());
    const {
      builderDB,
      db,
      params,
      headers,
      query,
      projectId,
      timezone,
      dateFormat,
      tenant,
      enableProfiling,
    } = req;
    const { collectionName, filterId } = params;
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiEnterUuid,
      API,
      `COLLECTION TABLE -> collectionTableFilterItems`,
      {
        collectionName,
      },
    );
    const { authorization } = headers;
    let collection = await findCollection(builderDB, projectId, collectionName, filterId);
    if (!collection || !collection.length) {
      return res.status(400).send('No Collection found');
    }
    collection = collection[0];
    const { permissionLevelSecurity = [] } = collection;
    let { code, result, message } = await filterItemService(
      builderDB,
      db,
      projectId,
      collection,
      filterId,
      query,
      authorization,
      timezone,
      headers,
      0,
      1,
      false,
      dateFormat,
      tenant,
    );
    console.log('######### Collection Items ###########', moment.now());
    console.log('####################');
    const computingStartUuid = uuidv4();
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      computingStartUuid,
      COMPUTING,
      `COLLECTION TABLE -> collectionTableFilterItems Crypt Service`,
      { collectionName },
    );
    let encryptedResponse;
    if (result) {
      encryptedResponse = await cryptService(
        result,
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
        return res.status(400).send(encryptedResponse.message);
      } else {
        result = encryptedResponse;
      }
    }
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
    updateProfilerService(db, projectId, enableProfiling, computingStartUuid);
    let resp = code != 200 ? message : result;
    updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
    dataViewLogs(req);
    return res.status(code || 500).send(resp || []);
  } catch (err) {
    next(err);
  }
};

export const collectionTableFilterItemCount = async (req, res, next) => {
  console.log('Count 1');
  const apiEnterUuid = uuidv4();
  console.log('Count 2');
  try {
    const {
      builderDB,
      db,
      params,
      headers,
      query,
      projectId,
      timezone,
      dateFormat,
      tenant,
      enableProfiling,
    } = req;
    console.log('Count 3');
    console.log('********************');
    console.log('********* Collection Items Count ***********', moment.now());
    console.log('timezone>>>>>>>>>>>>>>>>', timezone);
    const { collectionName, filterId } = params;
    const { authorization } = headers;
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiEnterUuid,
      API,
      'COLLECTION TABLE -> collectionTableFilterItemCount',
      { collectionName },
    );
    console.log('Count 4');
    let collection = await findCollection(builderDB, projectId, collectionName, filterId);
    if (!collection || !collection.length) {
      return res.status(200).json({ code: 200, message: 'success', result: 0, count: 0 });
    }
    let { code, result, message } = await filterItemService(
      builderDB,
      db,
      projectId,
      collection[0],
      filterId,
      query,
      authorization,
      timezone,
      headers,
      1,
      1,
      false,
      dateFormat,
      tenant,
    );
    console.log('######### Collection Items Count ###########', moment.now());
    console.log('####################');
    let resp = code != 200 ? message : result;
    updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
    res.status(code || 500).send(resp || []);
  } catch (err) {
    next(err);
  }
};

export const findOneItem = async (req, res, next) => {
  const { builderDB, db, params, projectId, enableProfiling, headers } = req;
  const { collectionName, itemId } = params;
  const { authorization } = headers;
  const apiEnterUuid = uuidv4();
  try {
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiEnterUuid,
      API,
      `COLLECTION TABLE -> findOneItem`,
      {
        collectionName,
      },
    );
    const collection = await findOneService(builderDB, {
      projectId,
      collectionName,
    });
    const result = await findItemById(db, builderDB, projectId, collection, itemId, null);
    if (!result) {
      res.status(404).send({ message: `Record not found with id ${req.params.itemId}` });
      return;
    }
    const cryptEnterUuid = uuidv4();
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      cryptEnterUuid,
      COMPUTING,
      `COLLECTION TABLE -> findOneItem Crypt Service`,
      { collectionName },
    );

    const { permissionLevelSecurity = [] } = collection;
    let encryptedResponse;
    if (result && result.data) {
      encryptedResponse = await cryptService(
        result.data,
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
        res.status(400).send({ message: encryptedResponse.message });
      } else {
        result.data = encryptedResponse;
      }
    }
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
    updateProfilerService(db, projectId, enableProfiling, cryptEnterUuid);
    updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
    dataViewLogs(req);
    res.status(result.code).send(result.data);
  } catch (error) {
    next(error);
  }
};

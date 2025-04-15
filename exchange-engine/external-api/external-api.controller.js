import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import axios from 'axios';
import { existsSync, unlinkSync, createReadStream } from 'node:fs';
import FormData from 'form-data';
import { AppError, parseJsonString, restructureData } from 'drapcode-utility';
import { logger } from 'drapcode-logger';
import {
  executeExternalApiAndProcess,
  fetchUserWithRefFields,
  findOneService,
} from './external-api.service';
import { downloadFileFromUrl } from '../upload-api/fileUpload.service';
import { API, COMPUTING } from '../utils/enums/ProfilerType';
import { createProfilerService, updateProfilerService } from '../profiling/profiler.service';
import { findMyText } from '../email/email.service';
import { addHeaderValue, addParams, prepareCurrentUserParamsValue } from '../utils/appUtils';
import { extractUserSettingFromUserAndTenant } from '../middleware/tenant.middleware';
const qs = require('qs');
const path = require('path');
const { stringify } = require('csv-stringify');

export const callExternalApiAndProcess = async (req, res, next) => {
  const {
    builderDB,
    db,
    projectId,
    user,
    body,
    params,
    projectConstants,
    environment,
    enableProfiling,
    headers,
    tenant,
    enableAuditTrail,
  } = req;
  const userSetting = extractUserSettingFromUserAndTenant(user, tenant);
  const { authorization } = headers || '';
  if (authorization) user['TOKEN'] = authorization;
  const apiEnterUuid = uuidv4();
  try {
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiEnterUuid,
      API,
      `EXTERNAL API -> callExternalApiAndProcess`,
    );
    const apiFetchUserUuid = uuidv4();
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiFetchUserUuid,
      API,
      `EXTERNAL API -> fetchUserWithRefFields`,
    );
    await fetchUserWithRefFields(user, builderDB, db, projectId);
    updateProfilerService(db, projectId, enableProfiling, apiFetchUserUuid);
    const { collectionItemId } = params;
    logger.info(`==> callExternalApiAndProcess body :>> ${JSON.stringify(body)}`, {
      label: projectId,
    });
    logger.info(`==> callExternalApiAndProcess collectionItemId :>> ${collectionItemId}`, {
      label: projectId,
    });

    const executeExtApiUuid = uuidv4();
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      executeExtApiUuid,
      COMPUTING,
      `EXTERNAL API -> executeExternalApiAndProcess`,
    );
    const response = await executeExternalApiAndProcess(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      collectionItemId,
      body,
      projectConstants,
      user,
      tenant,
      userSetting,
      environment,
      enableProfiling,
    );
    updateProfilerService(db, projectId, enableProfiling, executeExtApiUuid);
    logger.info('******************** ', { label: projectId });

    let { totalRecords } = response ? response : {};
    if (response.exportFile) {
      const { generateCSV, donotPersistResponseData, headerColumns } = response;
      const exportData = response.body;
      if (!generateCSV || generateCSV === 'DOWNLOAD_FILE_BYTES') {
        Object.keys(response.headers).forEach((key) => {
          let headerValue = response.headers[key];
          if (key.toUpperCase() === 'CONTENT-DISPOSITION') {
            if (!headerValue || headerValue === 'undefined') {
              headerValue = `attachment; filename="${encodeURI(uuidv4())}"`;
            }
          }
          if (headerValue && headerValue !== 'undefined') {
            res.setHeader(key, headerValue);
          }
        });
        exportData.pipe(res);
        return;
      } else if (generateCSV === 'GENERATE_CSV') {
        const fileName = response.exportFileName;
        let fileUuid = uuidv4();
        let localFilePath = process.env.FILE_UPLOAD_PATH || '/tmp/drapcode-uploads/';
        const exportFileName = `${fileUuid}.csv`;
        localFilePath += exportFileName;
        if (existsSync(localFilePath)) {
          unlinkSync(localFilePath);
        }

        if (donotPersistResponseData) {
          stringify(exportData, { header: true, columns: headerColumns }, (err, str) => {
            res.setHeader('content-type', 'text/csv');
            res.setHeader('content-disposition', `attachment; filename="${encodeURI(fileName)}"`);
            res.status(200).end(str);
            if (existsSync(localFilePath)) {
              unlinkSync(localFilePath);
            }
          });
        } else {
          stringify(exportData, (err, str) => {
            res.setHeader('content-type', 'text/csv');
            res.setHeader('content-disposition', `attachment; filename="${encodeURI(fileName)}"`);
            res.status(200).end(str);
            if (existsSync(localFilePath)) {
              unlinkSync(localFilePath);
            }
          });
        }
        return;
      } else if (generateCSV === 'DOWNLOAD_FILE_URL') {
        if (typeof exportData === 'string') {
          if (exportData.startsWith('http:') || exportData.startsWith('https:')) {
            const fileDownloadResponse = await downloadFileFromUrl(exportData);
            const read = createReadStream(fileDownloadResponse);
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${path.basename(
                fileDownloadResponse,
              )}"`,
            });
            read.pipe(res);
            read.on('end', () => unlinkSync(fileDownloadResponse));
            return;
          } else {
            return res.status(response.status || 500).send(exportData);
          }
        } else {
          return res
            .status(500)
            .json({ message: 'URL received from API is not correct. Please check response path.' });
        }
      }
    } else {
      if (totalRecords) {
        updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
        return res.status(response.status).send({ ...response.responseData, totalRecords });
      } else {
        updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
        return res.status(response.status).send(response.responseData);
      }
    }
  } catch (err) {
    logger.error(`::::::::in controller err ${err}`, { label: projectId });
    next(err);
  }
};

export const sendDataOnExternalApi = async (req, res, next) => {
  try {
    //Removed as it was sending data to firebase and airtable
  } catch (error) {
    next(error);
  }
};

export const processDataFromResponseJSON = async (req, res, next) => {
  try {
    const { body } = req;
    const { apiResponseData, itemsPath } = body;
    let extractData = itemsPath ? _.get(apiResponseData, itemsPath) : apiResponseData;
    res.status(200).send(extractData);
    console.log('###==> processDataFromResponseJSON END :>> ');
  } catch (err) {
    console.error('###==> processDataFromResponseJSON ERROR :>> ', err);
    next(err);
  }
};

export const findById = async (req, res, next) => {
  const { builderDB, projectId, params } = req;
  try {
    const { externalApiId } = params;
    const result = await findOneService(builderDB, projectId, externalApiId);
    if (result) {
      return res.send(result);
    } else {
      next(new AppError(`No External API found for ${externalApiId}`, 500));
    }
  } catch (err) {
    next(err);
  }
};

export const traceError = async (req, res) => {
  const { projectId } = req;
  console.log('projectId :>> ', projectId);
  return res
    .status(400)
    .json({ success: false, errors: { mobile: 'Number is incorrect or missing' } });
};

export const processAPIRequest = async (req, res, next) => {
  const { headers } = req;
  const contentType = headers['content-type'];
  const resData = {};
  resData.status = 'SUCCESS';
  if (!(contentType === 'application/json' || contentType.includes('application/json')))
    return res.send('Invalid Content Type');
  const data = req.body;
  let dataBody = data.body;
  let { data: content, type, requestType } = dataBody || '';
  let url = '';
  if (data.url && data.url.replace(/\s/g, '') === '') {
    return res.send('Invalid Url entered');
  }

  if (data.currentUserParams.length > 0 && Object.keys(data.currentUserParamsValue).length > 0) {
    prepareCurrentUserParamsValue(data.currentUserParams, data.currentUserParamsValue);
  }
  url = addParams(data.url, data.params, data.currentUserParams, data.collectionParamsValue);
  const dataArr = {};
  if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      dataArr[content[i].key] = content[i].value;
    }
    content = dataArr;
  }

  if (type === 'RAW_JSON' || requestType === 'CUSTOM') {
    if (data.collectionParamsValue && Array.isArray(data.collectionParamsValue)) {
      let jsonString = JSON.stringify(content);
      data.collectionParamsValue.forEach(([key, value]) => {
        const needle = `{{${key}}}`;
        const dataOfItem = value;
        //Format: {{NEEDLE}},'Value to Replace','JSON String'
        jsonString = findMyText(needle, dataOfItem, jsonString);
      });
      if (jsonString && jsonString.includes("'")) {
        jsonString = jsonString.replaceAll("'", '"');
        jsonString = JSON.stringify(jsonString);
      } else {
        jsonString = JSON.stringify(jsonString);
      }
      content = jsonString ? JSON.parse(parseJsonString(jsonString)) : '';
    } else if (data.collectionParamsValue && Object.keys(data.collectionParamsValue).length > 0) {
      let jsonString = JSON.stringify(content);
      Object.entries(data.collectionParamsValue).forEach(([key, value]) => {
        const needle = `{{${key}}}`;
        const dataOfItem = value;
        //Format: {{NEEDLE}},'Value to Replace','JSON String'
        jsonString = findMyText(needle, dataOfItem, jsonString);
      });
      if (jsonString && jsonString.includes("'")) {
        jsonString = jsonString.replaceAll("'", '"');
        jsonString = JSON.stringify(jsonString);
      } else {
        jsonString = JSON.stringify(jsonString);
      }
      content = jsonString ? JSON.parse(parseJsonString(jsonString)) : '';
    }
  }

  const objHeader = {};
  if (data.headers) {
    addHeaderValue(objHeader, data.headers, data.currentUserParams);
  }
  if (data.authType !== '' && data.accessToken !== '') {
    objHeader.Authorization = `Bearer ${data.accessToken}`;
  }

  try {
    let response = null;
    if (req.body.methodType === 'GET') {
      response = await axios({
        url,
        method: req.body.methodType,
        headers: objHeader,
      });
    } else {
      if (requestType === 'FORM_URL_ENCODED') {
        content = qs.stringify(content);
      } else if (requestType === 'FORM_DATA') {
        const objectArray = Object.entries(content);
        content = new FormData();
        objectArray.forEach(([key, value]) => {
          content.append(key, value);
        });
      }
      response = await axios({
        url,
        method: req.body.methodType,
        data: content,
        headers: objHeader,
      });
    }
    const result = restructureData(response.data);
    return res.status(response.status).send(result);
  } catch (error) {
    next(error);
  }
};

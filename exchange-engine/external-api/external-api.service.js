import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import {
  checkForError,
  replaceDataValueIntoExpression,
  parseValueFromData,
  parseJsonString,
  replaceTransferObjectValueIntoExpression,
  replaceValueFromSource,
  processItemEncryptDecrypt,
  getEncryptedReferenceFieldsQuery,
  AppError,
} from 'drapcode-utility';
import { callCurlRequest, checkFieldValueType, replaceValuesFromObjArr } from 'external-api-util';
import {
  CURRENT_USER_LOWER,
  CURRENT_TENANT_LOWER,
  CURRENT_SESSION,
  REFERENCE_FIELDS,
  DERIVED_FIELDS,
  COLLECTION_CONSTANTS,
  PROJECT_CONSTANTS,
  ENVIRONMENT_VARIABLE,
  FORM_DATA_SESSION,
  REFERENCE_FIELDS_PREFIX,
  DERIVED_FIELDS_PREFIX,
  COLLECTION_CONSTANTS_PREFIX,
  PROJECT_CONSTANTS_PREFIX,
  CURRENT_USER_DERIVED_FIELDS_PREFIX,
  fieldsKeyPrefixMap,
  SUPABASE,
  SESSION_STORAGE,
  LOCAL_STORAGE,
  COOKIES,
  CURRENT_SETTINGS_LOWER,
} from 'drapcode-constant';
import { logger } from 'drapcode-logger';
import {
  DTO_EXTERNAL_API,
  EXTERNAL_DATA_SOURCE_TYPES,
  REQUEST_BODY_JSON_TYPES,
  NOT_FIELD_FOR_EXPORT,
  isJsonStringOfArray,
  prepareFunction,
  replaceNeedleValueForNewData,
  extractNeedlesFromString,
  startsWithOne,
  clearObject,
  populateDataObjWithNewData,
  dataCleanupForNonPersistentCollection,
  isNew,
} from '../utils/appUtils';
import { findMyText } from '../email/email.service';
import { downloadFileContent } from '../upload-api/upload.controller';
import { findItemById } from '../item/item.service';
import { saveExternalApiMiddlewareService } from '../external-api-middleware/external.api.middleware.service';
import { runConnectorProcess } from './dataconnector.service';
import { userCollectionName } from '../loginPlugin/loginUtils';
import { saveUser } from '../loginPlugin/user.service';
import {
  findCollectionsByQuery,
  findOneService as findCollectionService,
  userCollectionService,
} from '../collection/collection.service';
import { createProfilerService, updateProfilerService } from '../profiling/profiler.service';
import { API, COMPUTING } from '../utils/enums/ProfilerType';
import { getProjectEncryption } from '../middleware/encryption.middleware';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { pluginCode } from 'drapcode-constant';
import { compareOldNewValue, createAuditTrail } from '../logs/audit/audit.service';
import { prepareUserQuery } from '../utils/query';

export const executeExternalApiAndProcess = async (
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
  spreadResponse = true,
) => {
  const { externalApiId, data, userRole, sessionValue, sessionFormValue, browserStorageDTO } = body;
  console.log('🚀 ~ file: external-api.service.js:66 ~ sessionValue:', sessionValue);
  console.log('🚀 ~ file: external-api.service.js:66 ~ sessionFormValue:', sessionFormValue);
  console.log('🚀 ~ file: external-api.service.js:66 ~ browserStorageDTO:', browserStorageDTO);
  const browserStorageData = {
    sessionValue,
    sessionFormValue,
    ...browserStorageDTO,
  };
  // console.log('🚀 ~ file: external-api.service.js:87 ~ #1 browserStorageData:', browserStorageData);
  let externalApi = await builderDB
    .collection('externalapis')
    .findOne({ uuid: externalApiId, projectId });

  if (!externalApi) {
    return { status: 400, responseData: { message: 'External API not found.' } };
  }
  const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
  const {
    donotPersistResponseData,
    bodyDataFrom,
    collectionMapping,
    collectionName,
    responseDataMapping,
    externalApiType,
    isUpdateItemWithResponse,
    errors,
    timeout,
    addAwsSignature,
    awsService,
  } = externalApi;
  let { setting } = externalApi;
  let { requestDataJsonType } = externalApi;
  if (addAwsSignature) {
    const awsSignPlugin = await findInstalledPlugin(builderDB, {
      code: pluginCode.AWS_SIGNATURE,
      projectId,
    });
    if (!awsSignPlugin) throw AppError('AWS Signature Plugin is not installed.');
    const { accessKeyId, secretAccessKey, region } = awsSignPlugin.setting;
    setting.awsSignPluginConfig = { accessKeyId, secretAccessKey, region, service: awsService };
  } else setting.awsSignPluginConfig = null;

  let dataToSendToExternalApi = {};
  let nonPersistentDataToSend = {};
  let collectionFields = {};
  let collectionDerivedFields = {};
  let collectionConstants = {};
  let formData = {};
  let collectionItem = {};
  let hasPageCollection = false;
  Object.assign(formData, data);
  let isDownloadBytes = false;
  if (responseDataMapping) {
    const { exportResponse, generateCSV } = responseDataMapping;
    isDownloadBytes = exportResponse && generateCSV === 'DOWNLOAD_FILE_BYTES';
  }
  logger.info(
    `==> collectionName :>> ${collectionName},  bodyDataFrom :>> ${
      bodyDataFrom ? JSON.stringify(bodyDataFrom) : ''
    },  requestDataJsonType :>> ${requestDataJsonType}, External API type: ${externalApiType}`,
    { label: projectId },
  );

  DTO_EXTERNAL_API['dtoExternalApiType'] = externalApiType;
  DTO_EXTERNAL_API['dtoIsExternalSource'] = EXTERNAL_DATA_SOURCE_TYPES.includes(externalApiType);

  if (
    !requestDataJsonType &&
    !['noDynamicData'].includes(bodyDataFrom) &&
    collectionName &&
    collectionMapping &&
    collectionMapping.length
  ) {
    requestDataJsonType = 'DEFAULT';
    externalApi['requestDataJsonType'] = requestDataJsonType;
    console.log('==> Updated JSON Type :>> ', requestDataJsonType);
  }
  if (data && data.externalApiItem) {
    const { externalApiItem } = data ?? '';
    const { pageCollectionName, id } = externalApiItem ?? '';
    hasPageCollection = !!pageCollectionName;

    logger.info(
      `==> pageCollectionName :>> ${pageCollectionName}, hasPageCollection :>> ${hasPageCollection}`,
      { label: projectId },
    );
    if (!collectionItemId && bodyDataFrom !== 'NON_PERSISTENT_COLLECTION') {
      collectionItemId = id;
      console.log('🚀 ~ file: external-api.service.js:143 ~ collectionItemId:', collectionItemId);
    }

    if (
      !hasPageCollection &&
      // eslint-disable-next-line no-prototype-builtins
      !externalApiItem.hasOwnProperty('fromTargetElem') &&
      !externalApiItem['fromTargetElem']
    ) {
      resetExternalApiItemIds(externalApiItem);
      removeObjectProp(externalApiItem, 'fromTargetElem');
    } else {
      removeObjectProp(externalApiItem, 'fromTargetElem');
    }
  }

  logger.info('##############################', { label: projectId });
  const newExternalApi = { ...externalApi };
  newExternalApi.collectionName = 'user';
  const userFields = await getNonPersistentItem(
    builderDB,
    projectId,
    newExternalApi,
    data,
    user,
    envConstants,
    isDownloadBytes,
    projectConstants,
    environment,
    {},
    browserStorageData,
  );
  if (!userFields) {
    return { status: 400, responseData: 'User Collection not found' };
  }
  const currentUserDerivedFields = userFields.derivedFields;
  switch (bodyDataFrom) {
    case 'NON_PERSISTENT_COLLECTION': {
      logger.info('*** Execute ExternalAPI Process for Non Persistent Collection...', {
        label: projectId,
      });

      //eslint-disable-next-line no-prototype-builtins
      if (data && data && !data.hasOwnProperty('uuid')) {
        data['uuid'] =
          // eslint-disable-next-line no-prototype-builtins
          data.externalApiItem && data.externalApiItem.hasOwnProperty('uuid')
            ? data.externalApiItem['uuid']
            : uuidv4();
      }

      const nonPersistUuid = uuidv4();
      createProfilerService(
        db,
        projectId,
        enableProfiling,
        nonPersistUuid,
        COMPUTING,
        `EXTERNAL API -> doProcessForNonPersistentCollection`,
      );
      doProcessForNonPersistentCollection(collectionMapping, data, externalApi, collectionName);
      let nonPersistentCollectionDataToSendOnExternalApi = await getNonPersistentItem(
        builderDB,
        projectId,
        externalApi,
        data,
        user,
        envConstants,
        isDownloadBytes,
        projectConstants,
        environment,
        currentUserDerivedFields,
        browserStorageData,
      );
      if (!nonPersistentCollectionDataToSendOnExternalApi) {
        return { status: 400, responseData: 'Non Persistent Collection item not found' };
      }
      const { sendToExternalApi, derivedFields, constants, fields, collectionDataOfItemId } =
        nonPersistentCollectionDataToSendOnExternalApi;
      nonPersistentDataToSend = sendToExternalApi;
      collectionDerivedFields = derivedFields;
      collectionConstants = constants;
      collectionFields = fields;
      collectionItem = collectionDataOfItemId;
      updateProfilerService(db, projectId, enableProfiling, nonPersistUuid);
      break;
    }
    default:
      logger.info('*** Execute ExternalAPI Process for Collection...', { label: projectId });
      if (collectionItemId) {
        const persistUuid = uuidv4();
        createProfilerService(
          db,
          projectId,
          enableProfiling,
          persistUuid,
          COMPUTING,
          `EXTERNAL API -> doProcessForPersistentCollection`,
        );
        let collectionDataToSendOnExternalApi = await getDataOfToSendToExternalApi(
          builderDB,
          db,
          projectId,
          externalApi,
          collectionItemId,
          projectConstants,
          user,
          environment,
          enableEncryption,
          encryption,
          browserStorageData,
        );
        if (!collectionDataToSendOnExternalApi) {
          return { status: 400, responseData: 'Collection item not found' };
        }
        const {
          dataToSendToExternalApi: sendToExternalApi,
          derivedFields,
          constants,
          fields,
          collectionDataOfItemId,
        } = collectionDataToSendOnExternalApi ? collectionDataToSendOnExternalApi : '';
        dataToSendToExternalApi = sendToExternalApi;
        collectionDerivedFields = derivedFields;
        collectionConstants = constants;
        collectionFields = fields;
        collectionItem = collectionDataOfItemId;

        // console.log(
        //   '🚀 ~ file: external-api.service.js:325 ~ bodyDataFrom:',
        //   bodyDataFrom,
        //   'collectionItem:',
        //   collectionItem,
        // );

        updateProfilerService(db, projectId, enableProfiling, persistUuid);
      }
      break;
  }
  logger.info('##############################', { label: projectId });
  logger.info(`==> externalApi.setting.url #2 :>> ${setting.url}`, { label: projectId });
  logger.info(`==> dataToSendToExternalApi :>> ${dataToSendToExternalApi}`, { label: projectId });

  const headerContentTypeUrlEncoded = setting.headers.find(
    (head) =>
      head.key &&
      head.key.toLowerCase() === 'content-type' &&
      head.value === 'application/x-www-form-urlencoded',
  );
  const isUrlEncoded = !!headerContentTypeUrlEncoded;
  logger.info(`🚀 ~ file: external-api.service.js:234 ~ isUrlEncoded: ${isUrlEncoded}`, {
    label: projectId,
  });
  if (requestDataJsonType === 'FORM_URL_ENCODED' && !isUrlEncoded) {
    setting.headers.push({
      key: 'Content-Type',
      value: 'application/x-www-form-urlencoded',
      id: setting.headers.length + 1,
    });
  }
  logger.info(`🚀 ~ file: external-api.service.js:242 ~ setting.headers: ${setting.headers}`, {
    label: projectId,
  });

  const headerContentTypeMultipart = setting.headers.find(
    (head) =>
      head.key && head.key.toLowerCase() === 'content-type' && head.value === 'multipart/form-data',
  );
  const fileParam = setting.params.find((param) => param.key === 'file');
  const isMultipart = !!headerContentTypeMultipart;
  if (isMultipart) {
    const fileFields = fileParam && fileParam.value ? fileParam.value.split(',') : '';
    setting.isMultipart = isMultipart;
    setting.files = fileFields;
  }

  let nonPersistentResponseExport = false;
  if (data && data.externalApiItem) {
    const { externalApiItem } = data;
    const { exportNonPersistentReponse } = externalApiItem ? externalApiItem : '';
    nonPersistentResponseExport = exportNonPersistentReponse ? exportNonPersistentReponse : false;
  }

  loadPaginationValuesForNonPersistentCollection(externalApi, data);
  loadSearchQueryForNonPersistentCollection(externalApi, data);

  const { externalApiItem } = data ? data : {};
  let { totalRecordsPath } = externalApiItem ? externalApiItem : '';
  totalRecordsPath = totalRecordsPath ? totalRecordsPath.trim() : '';
  const { constants: envConstants } = environment ? environment : '';
  let wrapJsonDataInArray = false;

  const customJsonDataObj = {
    collectionItemId,
    formData,
    dataToSendToExternalApi,
    collectionFields,
    collectionConstants,
    collectionDerivedFields,
    projectConstants,
    environment,
  };
  const dataForUrl = { ...data };
  if (
    bodyDataFrom !== 'RAW_JSON' &&
    requestDataJsonType &&
    REQUEST_BODY_JSON_TYPES.includes(requestDataJsonType)
  ) {
    const processReqBodyJsonUuid = uuidv4();
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      processReqBodyJsonUuid,
      COMPUTING,
      `EXTERNAL API -> processRequestBodyJson`,
    );
    if (EXTERNAL_DATA_SOURCE_TYPES.includes(externalApiType) && requestDataJsonType === 'CUSTOM') {
      //Process Custom Body JSON For External Source
      processCustomJsonForExternalSource(
        projectId,
        data,
        externalApi,
        user,
        tenant,
        userSetting,
        customJsonDataObj,
        requestDataJsonType,
        currentUserDerivedFields,
        browserStorageData,
      );
    } else {
      //Process Custom Body JSON
      processRequestBodyJson(
        data,
        externalApi,
        user,
        tenant,
        userSetting,
        customJsonDataObj,
        requestDataJsonType,
        currentUserDerivedFields,
        browserStorageData,
      );
    }
    updateProfilerService(db, projectId, enableProfiling, processReqBodyJsonUuid);

    if (requestDataJsonType === 'CUSTOM') {
      const { bodyCustomJSON } = externalApi ? externalApi : '';
      wrapJsonDataInArray = isJsonStringOfArray(bodyCustomJSON, wrapJsonDataInArray);
    }
  } else if (bodyDataFrom === 'RAW_JSON') {
    const fixedJsonDataObj = {
      projectConstants,
      environment,
    };
    const processBodyRawJsonUuid = uuidv4();
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      processBodyRawJsonUuid,
      COMPUTING,
      `EXTERNAL API -> processbodyRawJson`,
    );
    //Process Raw Body JSON
    processbodyRawJson(
      data,
      externalApi,
      user,
      tenant,
      userSetting,
      fixedJsonDataObj,
      currentUserDerivedFields,
      browserStorageData,
    );
    updateProfilerService(db, projectId, enableProfiling, processBodyRawJsonUuid);

    const { bodyRawJSON } = externalApi ? externalApi : '';
    wrapJsonDataInArray = isJsonStringOfArray(bodyRawJSON, wrapJsonDataInArray);
  }

  let timeoutLimit = 0;
  let timeoutMessage = '';
  if (timeout && timeout.limit) {
    timeoutLimit = timeout.limit;
    timeoutMessage = timeout.message;
  } else if (responseDataMapping && responseDataMapping.timeoutLimit) {
    //TODO: It will be remove after sometime
    timeoutLimit = responseDataMapping.timeoutLimit;
    timeoutMessage = responseDataMapping.timeoutMsg;
  }
  let collectionData = {};
  dataCleanupForNonPersistentCollection(data);

  const processUrlUuid = uuidv4();
  createProfilerService(
    db,
    projectId,
    enableProfiling,
    processUrlUuid,
    COMPUTING,
    `EXTERNAL API -> processUrl`,
  );
  const dataTransferObject = getDataTransferObject(
    setting,
    collectionItem,
    _.cloneDeep(customJsonDataObj),
    user,
    tenant,
    userSetting,
    currentUserDerivedFields,
    browserStorageData,
  );
  let url = replaceTransferObjectValueIntoExpression(setting.url, dataTransferObject);
  url = processUrl(
    url,
    dataForUrl,
    user,
    tenant,
    userSetting,
    customJsonDataObj,
    currentUserDerivedFields,
    browserStorageData,
  );
  updateProfilerService(db, projectId, enableProfiling, processUrlUuid);
  if (bodyDataFrom !== 'RAW_JSON' && REQUEST_BODY_JSON_TYPES.includes(requestDataJsonType)) {
    collectionData =
      requestDataJsonType === 'DEFAULT_FIELDS'
        ? dataToSendToExternalApi
        : { ...data, ...nonPersistentDataToSend };
    if (dataToSendToExternalApi) {
      let dataObj = { ...dataToSendToExternalApi };
      if (hasPageCollection && collectionItemId) {
        const dataIdObj = { id: collectionItemId, collectionItemId: collectionItemId };
        dataObj = { ...dataIdObj, ...dataObj };
      }
      const replaceDataValueIntoExpUuid = uuidv4();
      createProfilerService(
        db,
        projectId,
        enableProfiling,
        replaceDataValueIntoExpUuid,
        COMPUTING,
        `EXTERNAL API -> replaceDataValueIntoExpression`,
      );
      // console.log(
      //   '🚀 ~ file: external-api.service.js:514 ~ Before replaceDataValueIntoExpression #2 browserStorageData:',
      //   browserStorageData,
      // );
      url = replaceDataValueIntoExpression(
        url,
        dataObj,
        user,
        tenant,
        userSetting,
        sessionValue,
        envConstants,
        sessionFormValue,
        browserStorageData,
      );
      updateProfilerService(db, projectId, enableProfiling, replaceDataValueIntoExpUuid);
    }
  } else {
    collectionData = { ...dataToSendToExternalApi, ...data, ...nonPersistentDataToSend };
  }
  setting.url = url;
  const dataToSend = nonPersistentDataToSend ? { ...data, ...nonPersistentDataToSend } : data;
  let finalDataToSend = collectionItemId ? collectionData : dataToSend;
  logger.info(
    `==> BEFORE CALL Final Data :>> ${finalDataToSend ? JSON.stringify(finalDataToSend) : ''}`,
    { label: projectId },
  );

  logger.info(
    `🚀 ~ file: external-api.service.js:424 ~ wrapJsonDataInArray: ${
      wrapJsonDataInArray ? JSON.stringify(wrapJsonDataInArray) : ''
    }`,
    { label: projectId },
  );
  if (wrapJsonDataInArray) {
    let finalDataToSendArray = [];
    if (Object.keys(finalDataToSend) && Object.keys(finalDataToSend).length) {
      if (Object.keys(finalDataToSend)[0] === '0') {
        Object.keys(finalDataToSend).map((finalDataToSendKey) => {
          finalDataToSendArray.push(finalDataToSend[finalDataToSendKey]);
        });
        finalDataToSend = finalDataToSendArray;
        logger.info(
          `==> BEFORE CALL Final Data Array :>> ${
            finalDataToSend ? JSON.stringify(finalDataToSend) : ''
          }`,
          { label: projectId },
        );
      }
    }
  }

  const callCurlRequestUuid = uuidv4();
  createProfilerService(
    db,
    projectId,
    enableProfiling,
    callCurlRequestUuid,
    API,
    `EXTERNAL API -> callCurlRequest`,
  );
  // console.log(
  //   '🚀 ~ file: external-api.service.js:854 ~ executeExternalApiAndProcess #3 browserStorageData:',
  //   browserStorageData,
  // );
  const result = await callCurlRequest(
    setting,
    user,
    tenant,
    userSetting,
    finalDataToSend,
    timeoutLimit,
    timeoutMessage,
    envConstants,
    isDownloadBytes,
    requestDataJsonType,
    wrapJsonDataInArray,
    projectId,
    dataTransferObject,
    bodyDataFrom === 'RAW_JSON',
    browserStorageData,
  );
  updateProfilerService(db, projectId, enableProfiling, callCurlRequestUuid);
  if (!result || Object.keys(result).length === 0) {
    return { status: 400, responseData: { message: "We did'n receive any response" } };
  }
  const resultData = result.data;
  let resultStatus = result.status ? result.status : 400;
  resultStatus = !result.success ? 400 : resultStatus;
  logger.info(`resultStatus :>> ${resultStatus}`, { label: projectId });
  if (!responseDataMapping) {
    logger.info(`Returning because don't have response data mapping`, { label: projectId });
    return {
      status: result.status ? result.status : 400,
      responseData: resultData,
      collection: { collectionFields, collectionDerivedFields, collectionConstants },
    };
  }
  logger.info(`Checking Error Mapping`, { label: projectId });
  const afterErrorCheck = await checkForError(
    resultData,
    errors,
    responseDataMapping,
    resultStatus,
  );
  console.log('afterErrorCheck', afterErrorCheck);
  if (!afterErrorCheck.noError) {
    logger.info(
      `afterErrorCheck ${afterErrorCheck ? JSON.stringify(afterErrorCheck) : afterErrorCheck}`,
      { label: projectId },
    );
    delete afterErrorCheck['noError'];
    return afterErrorCheck;
  }

  if (!result.success) {
    return {
      status: resultStatus,
      responseData: resultData,
      collection: { collectionFields, collectionDerivedFields, collectionConstants },
    };
  }
  const {
    statusPath,
    selectedCollectionName,
    itemsPath,
    selectedMapping,
    customPrimaryKey,
    currentUserItemsPath,
    enableAuthorization,
    currentUserSelectedMapping,
    currentUserPrimaryKey,
    exportFileName,
    exportResponse,
    exportItemsPath,
    generateCSV,
  } = responseDataMapping;

  let externalApiMiddlewareId = '';
  if (selectedCollectionName && selectedMapping) {
    const addOnDataForItems = {};
    if (user) {
      addOnDataForItems.createdBy = user.uuid;
    }
    if (!donotPersistResponseData) {
      const isUpdate = collectionName && isUpdateItemWithResponse;
      if (user && isUpdate) {
        delete addOnDataForItems.createdBy;
        addOnDataForItems.updatedBy = user.uuid;
      }
      const primaryKeyQuery = await runConnectorProcess(
        builderDB,
        db,
        projectId,
        enableAuditTrail,
        selectedCollectionName,
        externalApiType,
        selectedMapping,
        itemsPath,
        isUpdateItemWithResponse ? { ...resultData, uuid: collectionItemId } : resultData,
        sessionValue,
        isUpdateItemWithResponse ? 'uuid' : customPrimaryKey,
        addOnDataForItems,
        isUpdate,
      );
      logger.info(
        `primaryKeyQuery executeExternalApiAndProcess ${
          primaryKeyQuery ? JSON.stringify(primaryKeyQuery) : ''
        }`,
        { label: projectId },
      );
      externalApiMiddlewareId = (
        await saveExternalApiMiddlewareService(db, {
          query: primaryKeyQuery,
          collectionName: selectedCollectionName,
        })
      ).uuid;
    }
  }
  let newUserCreate = false;
  if (enableAuthorization) {
    logger.info(`executeExternalApiAndProcess 8 ${currentUserItemsPath}`, { label: projectId });
    let dataSourceData = currentUserItemsPath
      ? _.get(result.data, currentUserItemsPath)
      : result.data;
    if (dataSourceData) {
      let defaultIdKey = null;
      switch (externalApiType) {
        case SUPABASE:
          defaultIdKey = 'id';
          break;
        default:
          break;
      }

      let primaryKeyValue = null;
      logger.info(`executeExternalApiAndProcess 101 ${currentUserPrimaryKey}`, {
        label: projectId,
      });
      if (currentUserPrimaryKey) {
        primaryKeyValue = _.get(dataSourceData, currentUserPrimaryKey);
      }
      logger.info(`executeExternalApiAndProcess 12 ${primaryKeyValue}`, { label: projectId });
      if (primaryKeyValue) {
        const userCollection = await userCollectionService(builderDB, projectId);
        const { data: existUsers } = await findItemById(
          db,
          builderDB,
          projectId,
          userCollection,
          null,
          {
            userName: primaryKeyValue,
          },
        );
        logger.info(`executeExternalApiAndProcess existUsers ${existUsers}`, { label: projectId });
        if (!existUsers || existUsers.length === 0) {
          console.log('executeExternalApiAndProcess 13');
          newUserCreate = true;
          const itemData = {};
          if (currentUserSelectedMapping && Object.keys(currentUserSelectedMapping).length > 0) {
            Object.keys(currentUserSelectedMapping).map((key) => {
              itemData[key] = dataSourceData[currentUserSelectedMapping[key]];
            });
          }

          itemData.userName = primaryKeyValue;
          itemData.userRoles = userRole;
          if (defaultIdKey) {
            let defaultIdKeyValue = _.get(dataSourceData, defaultIdKey);
            if (defaultIdKeyValue) {
              itemData.uuid = defaultIdKeyValue;
            }
          }
          const savedUser = await saveUser(builderDB, db, projectId, enableAuditTrail, itemData);
          if (savedUser && savedUser.code === 201) {
            user = savedUser.data;
          }
          logger.info(`user ${user ? JSON.stringify(user) : ''}`, { label: projectId });
        } else {
          user = existUsers;
        }
      }
    }
  }
  if (!newUserCreate) {
    const response = await processUpdateCurrentUser(
      db,
      builderDB,
      projectId,
      user,
      enableAuditTrail,
      currentUserSelectedMapping,
      currentUserItemsPath,
      result.data,
    );
    logger.info(
      `response After updating current user ${response ? JSON.stringify(response) : ''}`,
      { label: projectId },
    );
    if (response) {
      user = response;
    }
  }
  if (enableAuthorization) {
    logger.info('I am authorization', { label: projectId });
    return {
      status: user ? 200 : 401,
      responseData: user,
      success: !user || Object.keys(user).length > 0,
      collection: { collectionFields, collectionDerivedFields, collectionConstants },
    };
  }
  logger.info(`result :>> ${Object.keys(result)}`, { label: projectId });
  const status = statusPath ? _.get(result, statusPath) : result.status;
  let responseData = itemsPath ? _.get(result.data, itemsPath) : result.data;
  //TODO: Refactor for Spreading of Array type Response {...[]}
  responseData = spreadResponse ? { ...responseData, externalApiMiddlewareId } : responseData;
  const totalRecords = totalRecordsPath ? _.get(result.data, totalRecordsPath) : '';

  if (exportResponse) {
    if (donotPersistResponseData) {
      if (nonPersistentResponseExport) {
        let dataSourceData = exportItemsPath ? _.get(result.data, exportItemsPath) : result.data;
        const { finalData, headerColumns } = await createCSVObjectForNonPersistentData(
          selectedCollectionName,
          selectedMapping,
          dataSourceData,
          builderDB,
          projectId,
        );
        return {
          body: finalData,
          exportFile: exportResponse,
          exportFileName,
          generateCSV,
          headerColumns,
          donotPersistResponseData,
          collection: { collectionFields, collectionDerivedFields, collectionConstants },
        };
      } else if (totalRecords) {
        return {
          responseData,
          status,
          donotPersistResponseData,
          totalRecords,
          collection: { collectionFields, collectionDerivedFields, collectionConstants },
        };
      } else {
        return {
          responseData,
          status,
          donotPersistResponseData,
          collection: { collectionFields, collectionDerivedFields, collectionConstants },
        };
      }
    } else {
      if (!generateCSV || generateCSV === 'DOWNLOAD_FILE_BYTES') {
        let headers = result.headers;
        if (Object.keys(headers).length > 0) {
          headers = {
            'content-type': headers['content-type'],
            'content-disposition': headers['content-disposition'],
          };
        }
        return {
          body: result.data,
          headers,
          success: result.success,
          generateCSV,
          exportFile: exportResponse,
          exportFileName,
          collection: { collectionFields, collectionDerivedFields, collectionConstants },
        };
      }
      let dataSourceData = exportItemsPath ? _.get(result.data, exportItemsPath) : result.data;
      return {
        body: dataSourceData,
        exportFile: exportResponse,
        exportFileName,
        generateCSV,
        collection: { collectionFields, collectionDerivedFields, collectionConstants },
      };
    }
  } else if (totalRecords) {
    return {
      responseData,
      status,
      donotPersistResponseData,
      totalRecords,
      collection: { collectionFields, collectionDerivedFields, collectionConstants },
    };
  } else {
    return {
      responseData,
      status,
      donotPersistResponseData,
      collection: { collectionFields, collectionDerivedFields, collectionConstants },
    };
  }
};

const processUpdateCurrentUser = async (
  db,
  builderDB,
  projectId,
  user,
  enableAuditTrail,
  currentUserSelectedMapping,
  currentUserItemsPath,
  data,
) => {
  if (
    user &&
    currentUserSelectedMapping &&
    Object.keys(user).length > 0 &&
    Object.keys(currentUserSelectedMapping).length > 0
  ) {
    const mappingKey = Object.keys(currentUserSelectedMapping);
    let dataSourceData = null;
    const userId = user.uuid;
    if (currentUserItemsPath) {
      dataSourceData = _.get(data, currentUserItemsPath);
    }
    const itemData = {};
    if (dataSourceData) {
      mappingKey.map((key) => {
        itemData[key] = dataSourceData[currentUserSelectedMapping[key]];
      });
      const query = { uuid: userId };
      const newValues = { $set: itemData };
      let dbCollection = await db.collection(userCollectionName);

      // FINAL: START:Audit Trail
      // No Encryption/Decryption required, No data is encrypted before updating record in user
      // User field is changed. Need to check collection detail
      const { oldValues, newValues: nValues } = await compareOldNewValue(
        builderDB,
        projectId,
        user,
        itemData,
        null,
      );
      createAuditTrail(
        db,
        enableAuditTrail,
        'EXTERNAL',
        'update',
        user,
        userCollectionName,
        nValues,
        oldValues,
      );
      // END:Audit Trail

      let data = await dbCollection.findOneAndUpdate(query, newValues, isNew);
      if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
        return null;
      }
      return data.value;
    }
  }
};

const getDataOfToSendToExternalApi = async (
  builderDB,
  dbConnection,
  projectId,
  externalApi,
  itemId,
  projectConstants,
  user,
  environment,
  enableEncryption,
  encryption,
  browserStorageData = {},
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:910 ~ getDataOfToSendToExternalApi #4 browserStorageData:',
  //   browserStorageData,
  // );
  const { collectionName, collectionMapping, bodyDataFrom, requestDataJsonType } = externalApi;
  const collectionSchema = await findCollectionService(builderDB, {
    projectId,
    collectionName,
  });
  const collectionItemIdRecord = await findItemById(
    dbConnection,
    builderDB,
    projectId,
    collectionSchema,
    itemId,
    null,
  );
  if (!collectionItemIdRecord || !collectionItemIdRecord.data) return;
  let collectionDataOfItemId = collectionItemIdRecord.data;
  const derivedFields = collectionSchema ? collectionSchema.utilities : null;
  const fields = collectionSchema ? collectionSchema.fields : null;
  const constants = collectionSchema ? collectionSchema.constants : null;
  const { constants: envConstants } = environment ? environment : '';

  if (enableEncryption && encryption) {
    const query = getEncryptedReferenceFieldsQuery(fields, projectId);
    const encrypedRefCollections = await findCollectionsByQuery(builderDB, query);
    const cryptResponse = await processItemEncryptDecrypt(
      collectionDataOfItemId,
      fields,
      encryption,
      true,
      encrypedRefCollections,
    );
    collectionDataOfItemId = cryptResponse;
  }

  const dataToSendToExternalApi =
    bodyDataFrom !== 'RAW_JSON' &&
    requestDataJsonType &&
    !REQUEST_BODY_JSON_TYPES.includes(requestDataJsonType)
      ? await transformMappingData(
          builderDB,
          projectId,
          environment,
          collectionDataOfItemId,
          collectionMapping,
          derivedFields,
          fields,
          constants,
          projectConstants,
          user,
          envConstants,
          browserStorageData,
        )
      : collectionDataOfItemId;
  return { dataToSendToExternalApi, collectionDataOfItemId, derivedFields, constants, fields };
};

const transformMappingData = async (
  builderDB,
  projectId,
  environment,
  collectionData = {},
  mappingArray = [],
  derivedFields = [],
  collectionFields = [],
  constants = [],
  projectConstants = [],
  user = {},
  envConstants = [],
  browserStorageData = {},
) => {
  const imgUP = process.env.AWS_S3_IMAGE_URL_PREFIX;
  let newItem = {};
  if (!mappingArray.length) {
    delete collectionData._id;
    return collectionData;
  }
  await Promise.all(
    mappingArray.map(async (mappingObj) => {
      const { type, value, key } = mappingObj;
      if (type === 'reference-field') {
        const referenceFieldValue = parseValueFromData(collectionData, value);
        console.log('referenceFieldValue', referenceFieldValue);
        newItem[key] = Array.isArray(referenceFieldValue)
          ? referenceFieldValue.join(',')
          : referenceFieldValue;
        return;
      }
      if (type === 'derived-field') {
        let driveField = derivedFields.find((field) => field.name === value);
        if (driveField)
          return (newItem[key] = prepareFunction(
            driveField,
            collectionData,
            user,
            envConstants,
            browserStorageData,
          ));
      }
      if (type === 'collection-constant') {
        const constant = constants.find((field) => field.name === value);
        if (constant) return (newItem[key] = constant.value);
      }
      if (type === 'project-constant') {
        let projectConstant = projectConstants.find((field) => field.name === value);
        if (projectConstant) return (newItem[key] = projectConstant.value);
      }
      if (type === 'collection-field') {
        let fieldSchema = collectionFields.find((e) => e.fieldName === value) || {};
        if (fieldSchema.type === 'image' || fieldSchema.type === 'file') {
          let imageUrl = collectionData[value].key;
          if (imageUrl) {
            const filePath = await downloadFileContent(
              builderDB,
              projectId,
              environment,
              collectionData[value].originalName,
              imageUrl,
            );
            if (filePath) {
              newItem[key] = filePath;
            }
            newItem[`${key}_url`] = `${imgUP}${imageUrl}`;
          }
          return;
        }
        if (fieldSchema.type === 'multi_image') {
          let imageUrls = collectionData[value].map((e) => `${imgUP}${e.key}`);
          if (imageUrls) newItem[key] = imageUrls;
          return;
        }
        if (['reference', 'belongsTo'].includes(fieldSchema.type)) {
          const uuidsOfReferenceItems =
            collectionData[value] && collectionData[value].length > 0
              ? collectionData[value].map((e) => e.uuid)
              : [];
          newItem[key] = uuidsOfReferenceItems;
          return;
        }

        if (['static_option', 'reference', 'dynamic_option'].includes(fieldSchema.type)) {
          newItem[key] =
            collectionData[value] && collectionData[value].length === 1
              ? collectionData[value][0]
              : collectionData[value];
          return;
        }
        if (collectionData[value]) newItem[key] = collectionData[value];
        return;
      } else {
        return (newItem[key] = value);
      }
    }),
  );
  return newItem;
};

export const findOneService = async (builderDB, projectId, externalApiId) => {
  let result = await builderDB
    .collection('externalapis')
    .findOne({ uuid: externalApiId, projectId });

  if (!result) {
    return { status: 400, data: { message: 'External API not found.' } };
  }

  return result;
};

const doProcessForNonPersistentCollection = (
  collectionMapping,
  data,
  externalApi,
  collectionName,
) => {
  if (data && data.externalApiItem) {
    if (externalApi.setting.url.includes('{{')) {
      let needlesArr = [];

      if (collectionName && collectionMapping && collectionMapping.length) {
        collectionMapping.forEach((collectionFieldMap) => {
          const needleKey = `{{${collectionFieldMap.key}}}`;
          let needleValue = '';
          if (['_data_source_rest_api_primary_id', 'uuid'].includes(collectionFieldMap.value)) {
            needleValue = data.externalApiItem[collectionFieldMap.key];
          } else {
            needleValue = data[collectionFieldMap.value];
          }
          const needle = { key: needleKey, value: needleValue };
          needlesArr.push(needle);
        });
      }

      let needle = {};
      // eslint-disable-next-line no-prototype-builtins
      if (data.externalApiItem.hasOwnProperty('uniqueKey') && data.externalApiItem.uniqueKey) {
        needle = {
          key: `{{${data.externalApiItem.uniqueKey}}}`,
          value: data.externalApiItem.id,
        };
        needlesArr.push(needle);
        // eslint-disable-next-line no-prototype-builtins
      } else if (data.externalApiItem.hasOwnProperty('id') && data.externalApiItem.id) {
        needle = {
          key: `{{id}}`,
          value: data.externalApiItem.id,
        };
        needlesArr.push(needle);
      }
      if (
        // eslint-disable-next-line no-prototype-builtins
        data.externalApiItem.hasOwnProperty('_data_source_rest_api_primary_id') &&
        data.externalApiItem['_data_source_rest_api_primary_id']
      ) {
        needlesArr.push({
          key: `{{_data_source_rest_api_primary_id}}`,
          value: data.externalApiItem._data_source_rest_api_primary_id,
        });
      }

      console.log('==> doProcessForNonPersistentCollection needlesArr :>> ', needlesArr);
      needlesArr.forEach((needleObj) => {
        const match = new RegExp(needleObj.key, 'ig');
        const replacement = needleObj.value ? needleObj.value : '';
        externalApi.setting.url = externalApi.setting.url.replace(match, replacement);
      });
    }
  }
  //Transform Mapping Data
  transformMappingDataForNonPersistentCollection(
    collectionName,
    collectionMapping,
    data,
    externalApi,
  );
};

const loadSearchQueryForNonPersistentCollection = (externalApi, data) => {
  if (data && data.externalApiItem) {
    const { externalApiItem } = data;
    const { setting } = externalApi ? externalApi : '';

    if (externalApiItem && externalApiItem.searchString) {
      if (setting.url.includes('?')) {
        setting.url += `&${externalApiItem.searchString}`;
      } else {
        setting.url += `?${externalApiItem.searchString}`;
      }
    }
  }
};

const loadPaginationValuesForNonPersistentCollection = (externalApi, data) => {
  if (data && data.externalApiItem) {
    const { externalApiItem } = data;
    const { recordsLimit, recordsOffset, pageOffset, dataSource } = externalApiItem
      ? externalApiItem
      : '';
    console.log(
      '🚀 ~ file: external-api.service.js:1109 ~ loadPaginationValuesForNonPersistentCollection ~ dataSource:',
      dataSource,
    );
    const { limitKey, limitValue } = recordsLimit ? recordsLimit : '';
    const { setting } = externalApi ? externalApi : {};
    const { methodType, params, headers } = setting ? setting : {};

    if (limitKey && limitValue) {
      const { offsetKey, offsetValue } = recordsOffset ? recordsOffset : '';
      if (offsetKey && offsetValue && offsetValue >= 0) {
        data[offsetKey] = offsetValue;
        //TODO: Ali -> Need to refactor this condition. It will not work in case there're any params.
        addPaginationParamsInURL(dataSource, params, methodType, setting, offsetKey, offsetValue);
      }
      const { pageOffsetKey, pageOffsetValue } = pageOffset ? pageOffset : '';
      if (pageOffsetKey && pageOffsetValue && pageOffsetValue >= 0) {
        data[pageOffsetKey] = pageOffsetValue;
        //TODO: Ali -> Need to refactor this condition. It will not work in case there're any params.
        addPaginationParamsInURL(
          dataSource,
          params,
          methodType,
          setting,
          pageOffsetKey,
          pageOffsetValue,
        );
      }
      data[limitKey] = limitValue;
      console.log(
        '🚀 ~ file: external-api.service.js:1164 ~ loadPaginationValuesForNonPersistentCollection ~ data:',
        data,
      );
      //TODO: Ali -> Need to refactor this condition. It will not work in case there're any params.
      addPaginationParamsInURL(dataSource, params, methodType, setting, limitKey, limitValue);

      //Handle pagination needle keys in the URL
      replacePaginationParamsInURL(dataSource, methodType, setting, offsetKey, offsetValue);
      replacePaginationParamsInURL(dataSource, methodType, setting, pageOffsetKey, pageOffsetValue);
      replacePaginationParamsInURL(dataSource, methodType, setting, limitKey, limitValue);
      //TODO: Need to Handle pagination key (needles) in params.

      //Handle pagination keys/needles in the Headers
      processPaginationPropInHeader(
        dataSource,
        headers,
        data,
        offsetKey,
        pageOffsetValue,
        limitKey,
      );
    }
  }
};

const transformMappingDataForNonPersistentCollection = (
  collectionName,
  collectionMapping,
  data,
  externalApi,
) => {
  const { sendFormData } = externalApi ? externalApi : '';
  let requestMapArr = [];

  if (collectionName && collectionMapping && collectionMapping.length) {
    collectionMapping.forEach((collectionFieldMap) => {
      const { key, value } = collectionFieldMap;
      // eslint-disable-next-line no-prototype-builtins
      if (data && data.hasOwnProperty(value)) {
        const dataKeyValue = data[value];
        data[key] = dataKeyValue;
        requestMapArr.push(key);
      }
    });

    if (!sendFormData) {
      if (data && Object.keys(data).length > 0) {
        Object.keys(data).map((key) => {
          if (!requestMapArr.includes(key)) {
            if (key !== 'externalApiItem') delete data[key];
          }
        });
      }
    }
  } else if (!sendFormData) {
    if (data && Object.keys(data).length > 0) {
      Object.keys(data).map((key) => {
        if (key !== 'externalApiItem') {
          delete data[key];
        }
      });
    }
  }
};

export const createCSVObjectForNonPersistentData = async (
  collectionName,
  collectionFieldMapping,
  items,
  builderDB,
  projectId,
) => {
  let headerColumns = [];
  let itemColumns = [];

  if (items && !Array.isArray(items)) {
    items = [items];
  }

  await loadHeaderAndItemColumns(
    collectionFieldMapping,
    builderDB,
    collectionName,
    projectId,
    headerColumns,
    itemColumns,
  );

  const finalData = [];
  items &&
    items.forEach((item) => {
      const preparedItem = {};
      itemColumns.forEach((itemCol) => {
        const { key, fieldName } = itemCol;
        let itemFieldData = item[key];
        if (itemFieldData && itemFieldData !== 'undefined') {
          preparedItem[fieldName] = itemFieldData;
        } else {
          preparedItem[fieldName] = '';
        }
      });
      finalData.push(preparedItem);
    });
  return { finalData, headerColumns };
};

const loadHeaderAndItemColumns = async (
  collectionFieldMapping,
  builderDB,
  collectionName,
  projectId,
  headerColumns,
  itemColumns,
) => {
  if (collectionFieldMapping && Object.keys(collectionFieldMapping).length >= 0) {
    const responseDataMapCollection = await findCollectionService(builderDB, {
      collectionName,
      projectId,
    });
    const { fields } = responseDataMapCollection ? responseDataMapCollection : '';
    Object.keys(collectionFieldMapping).map(async (fieldName) => {
      let externalApiItemKey = fieldName;
      let externalApiItemValue = _.get(collectionFieldMapping, fieldName);

      if (!NOT_FIELD_FOR_EXPORT.includes(externalApiItemKey)) {
        const selectedField = fields
          ? fields.find((field) => field.fieldName === externalApiItemKey)
          : '';
        const { fieldTitle } = selectedField ? selectedField : '';

        headerColumns.push({
          key: externalApiItemKey,
          header: fieldTitle ? fieldTitle.en : externalApiItemKey,
        });
        itemColumns.push({
          key: externalApiItemValue,
          fieldName: externalApiItemKey,
        });
      }
    });
  }
};

const processbodyRawJson = (
  data,
  externalApi,
  user,
  tenant,
  userSetting,
  fixedJsonDataObj,
  currentUserDerivedFields = {},
  browserStorageData = {},
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:1345 ~ processbodyRawJson #5 browserStorageData:',
  //   browserStorageData,
  // );
  const { sessionValue, sessionFormValue, sessionStorageData, localStorageData, cookiesData } =
    browserStorageData || {};
  const { externalApiItem } = data ? data : {};
  dataCleanupForNonPersistentCollection(data);
  const { projectConstants, environment } = fixedJsonDataObj ? fixedJsonDataObj : '';
  const { bodyRawJSON } = externalApi ? externalApi : '';
  let rawBodyJsonString = '';
  console.log('==> processbodyRawJson bodyRawJSON :>> ', bodyRawJSON);
  const sessionData = sessionValue ? { current_session: sessionValue } : '';
  console.log('==> processbodyRawJson sessionData :>> ', sessionData);
  const currentFormSession = sessionFormValue ? { form_data_session: sessionFormValue } : '';
  console.log('==> processbodyRawJson currentFormSession :>> ', currentFormSession);
  const sessionStorageContent = sessionStorageData ? { SESSION_STORAGE: sessionStorageData } : '';
  console.log('==> processbodyRawJson sessionStorageContent :>> ', sessionStorageContent);
  const localStorageContent = localStorageData ? { LOCAL_STORAGE: localStorageData } : '';
  console.log('==> processbodyRawJson localStorageContent :>> ', localStorageContent);
  const cookiesContent = cookiesData ? { COOKIES: cookiesData } : '';
  console.log('==> processbodyRawJson cookiesContent :>> ', cookiesContent);
  const currentUserData = user ? { current_user: user } : '';
  console.log('==> processbodyRawJson currentUserData :>> ', currentUserData);
  const currentTenantData = user ? { current_tenant: tenant } : '';
  logger.info(`==> processbodyRawJson currentTenantData :>> ${currentTenantData}`);
  const currentUserSettingData = userSetting ? { current_settings: userSetting } : '';
  console.log(`==> processbodyRawJson currentUserSettingData :>> ${currentUserSettingData}`);
  if (bodyRawJSON) {
    if (bodyRawJSON && bodyRawJSON.includes("'")) {
      rawBodyJsonString = bodyRawJSON.replaceAll("'", '"');
      rawBodyJsonString = JSON.stringify(rawBodyJsonString);
    } else {
      rawBodyJsonString = JSON.stringify(bodyRawJSON);
    }

    let rawBodyJsonObj = rawBodyJsonString ? parseJsonString(rawBodyJsonString) : '';
    console.log('==> processbodyRawJson rawBodyJsonObj :>> ', rawBodyJsonObj);

    if (rawBodyJsonObj) {
      const needleList = getNeedleList(rawBodyJsonObj);
      console.log('==> processbodyRawJson needleList :>> ', needleList);

      let newData = rawBodyJsonObj;
      let mergeDataAndExternalApiItem = {};

      //TODO: Need to refactor
      if (data && Object.keys(data).length > 0) {
        Object.keys(data).map((key) => {
          mergeDataAndExternalApiItem[key] = data[key];
        });
      }
      if (externalApiItem && Object.keys(externalApiItem).length > 0) {
        Object.keys(externalApiItem).map((key) => {
          mergeDataAndExternalApiItem[key] = externalApiItem[key];
        });
      }
      if (mergeDataAndExternalApiItem && Object.keys(mergeDataAndExternalApiItem).length > 0) {
        needleList?.forEach((prop) => {
          const needle = `{{${prop}}}`;
          const dataOfItem = parseValueFromData(mergeDataAndExternalApiItem, prop);
          //Format: {{NEEDLE}},'Value to Replace','JSON String'
          newData = findMyText(needle, dataOfItem, newData);
        });
      }
      // Handling for Session Data
      newData = processNeedleData(
        rawBodyJsonString,
        sessionData,
        needleList,
        newData,
        CURRENT_SESSION,
      );
      // Handling for Form Data
      newData = processNeedleData(
        rawBodyJsonString,
        currentFormSession,
        needleList,
        newData,
        FORM_DATA_SESSION,
      );
      // Handling for Session Storage Data
      newData = processNeedleData(
        rawBodyJsonString,
        sessionStorageContent,
        needleList,
        newData,
        SESSION_STORAGE,
      );
      // Handling for Local Storage Data
      newData = processNeedleData(
        rawBodyJsonString,
        localStorageContent,
        needleList,
        newData,
        LOCAL_STORAGE,
      );
      // Handling for Cookies Data
      newData = processNeedleData(rawBodyJsonString, cookiesContent, needleList, newData, COOKIES);
      // Handling for Current User Data
      newData = processNeedleData(
        rawBodyJsonString,
        currentUserData,
        needleList,
        newData,
        CURRENT_USER_LOWER,
        currentUserDerivedFields,
        sessionData,
        currentFormSession,
      );
      // Handling for Current Tenant Data
      newData = processNeedleData(
        rawBodyJsonString,
        currentTenantData,
        needleList,
        newData,
        CURRENT_TENANT_LOWER,
        currentUserDerivedFields,
        sessionData,
        currentFormSession,
      );
      // Handling for Current User Settings Data
      newData = processNeedleData(
        rawBodyJsonString,
        currentUserSettingData,
        needleList,
        newData,
        CURRENT_SETTINGS_LOWER,
        currentUserDerivedFields,
        sessionData,
        currentFormSession,
      );
      // Handling for Project Constants Data
      newData = processNeedleDataForConstants(
        projectConstants,
        needleList,
        newData,
        PROJECT_CONSTANTS,
      );
      // Handling for Environment Variable Data
      newData = processNeedleData(
        rawBodyJsonString,
        environment,
        needleList,
        newData,
        ENVIRONMENT_VARIABLE,
      );

      let newDataJSON = newData ? parseJsonString(newData) : {};
      // Empty data JSON Obj
      clearObject(data);
      // Populate data JSON with newDataJSON
      populateDataObjWithNewData(newDataJSON, data);
    }
  }
};

const processRequestBodyJson = (
  data,
  externalApi,
  user,
  tenant,
  userSetting,
  customJsonDataObj,
  requestDataType,
  currentUserDerivedFields = {},
  browserStorageData = {},
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:1472 ~ processRequestBodyJson #6 browserStorageData:',
  //   browserStorageData,
  // );
  const { externalApiItem } = data ? data : {};
  dataCleanupForNonPersistentCollection(data);
  const {
    collectionItemId,
    formData,
    dataToSendToExternalApi,
    collectionFields,
    collectionConstants,
    collectionDerivedFields,
    projectConstants,
    environment,
  } = customJsonDataObj ? customJsonDataObj : '';
  const { constants: envConstants } = environment ? environment : '';

  // eslint-disable-next-line no-prototype-builtins
  if (formData.hasOwnProperty('externalApiItem')) {
    delete formData['externalApiItem'];
  }
  let jsonString = '';
  const { bodyDataFrom } = externalApi ? externalApi : '';

  console.log(
    '🚀 ~ file: external-api.service.js:1198 ~ processRequestBodyJson requestDataType:',
    requestDataType,
  );
  if (requestDataType === 'CUSTOM') {
    const { bodyCustomJSON } = externalApi ? externalApi : '';
    jsonString = bodyCustomJSON ?? '';
  } else if (['FORM_DATA', 'FORM_URL_ENCODED'].includes(requestDataType)) {
    const { bodyCollectionMapping } = externalApi ? externalApi : '';
    let bodyCollectionMappingJson = {};

    if (bodyCollectionMapping && bodyCollectionMapping.length) {
      bodyCollectionMapping.map((obj) => {
        bodyCollectionMappingJson[obj.key] = obj.value;
      });
      jsonString = bodyCollectionMappingJson ? JSON.stringify(bodyCollectionMappingJson) : '';
    }
  }
  console.log('🚀 ~ file: external-api.service.js:1215 ~ jsonString:', jsonString);

  let customBodyJsonString = '';

  const { sessionValue, sessionFormValue, sessionStorageData, localStorageData, cookiesData } =
    browserStorageData || {};

  const sessionData = sessionValue ? { current_session: sessionValue } : '';
  console.log('==> processRequestBodyJson sessionData :>> ', sessionData);
  const currentFormSession = sessionFormValue ? { form_data_session: sessionFormValue } : '';
  console.log('==> processRequestBodyJson currentFormSession :>> ', currentFormSession);
  const sessionStorageContent = sessionStorageData ? { SESSION_STORAGE: sessionStorageData } : '';
  console.log('==> processRequestBodyJson sessionStorageContent :>> ', sessionStorageContent);
  const localStorageContent = localStorageData ? { LOCAL_STORAGE: localStorageData } : '';
  console.log('==> processRequestBodyJson localStorageContent :>> ', localStorageContent);
  const cookiesContent = cookiesData ? { COOKIES: cookiesData } : '';
  console.log('==> processRequestBodyJson cookiesContent :>> ', cookiesContent);
  const currentUserData = user ? { current_user: user } : '';
  console.log('==> processRequestBodyJson currentUserData :>> ', currentUserData);
  const currentTenantData = user ? { current_tenant: tenant } : '';
  logger.info(`==> processRequestBodyJson currentTenantData :>> ${currentTenantData}`);
  const currentUserSettingData = userSetting ? { current_settings: userSetting } : '';
  console.log(`==> processRequestBodyJson currentUserSettingData :>> ${currentUserSettingData}`);

  if (jsonString) {
    if (jsonString && jsonString.includes("'")) {
      customBodyJsonString = jsonString.replaceAll("'", '"');
      customBodyJsonString = JSON.stringify(customBodyJsonString);
    } else {
      customBodyJsonString = JSON.stringify(jsonString);
    }

    let nonStringNeedles = [];
    if (customBodyJsonString) {
      nonStringNeedles = extractNeedlesFromString(customBodyJsonString, true);
    }
    console.log('🚀 ~ processRequestBodyJson ~ nonStringNeedles:', nonStringNeedles);

    if (nonStringNeedles && nonStringNeedles.length) {
      DTO_EXTERNAL_API['dtoNonStringNeedles'] = [...nonStringNeedles];
    }

    let customBodyJsonObj = customBodyJsonString ? parseJsonString(customBodyJsonString) : '';
    console.log('==> processRequestBodyJson customBodyJsonObj :>> ', customBodyJsonObj);

    if (customBodyJsonObj) {
      const needleList = getNeedleList(customBodyJsonObj);
      console.log('==> processRequestBodyJson needleList :>> ', needleList);

      let newData = customBodyJsonObj;
      let mergeDataAndExternalApiItem = {};

      //TODO: Need to refactor
      if (data && Object.keys(data).length > 0) {
        Object.keys(data).map((key) => {
          mergeDataAndExternalApiItem[key] = data[key];
        });
      }
      if (externalApiItem && Object.keys(externalApiItem).length > 0) {
        Object.keys(externalApiItem).map((key) => {
          mergeDataAndExternalApiItem[key] = externalApiItem[key];
          if (key === 'id') {
            mergeDataAndExternalApiItem['uuid'] = externalApiItem[key];
          }
        });
        if (formData) {
          Object.assign(mergeDataAndExternalApiItem, formData);
        }
      }

      if (collectionItemId) {
        if (dataToSendToExternalApi) {
          Object.assign(mergeDataAndExternalApiItem, dataToSendToExternalApi);
        }
      }

      if (mergeDataAndExternalApiItem && Object.keys(mergeDataAndExternalApiItem).length > 0) {
        if (needleList) {
          // Handling for Collection Fields Data
          newData = processNeedleDataForCollectionFields(
            mergeDataAndExternalApiItem,
            collectionFields,
            needleList,
            newData,
          );

          if (bodyDataFrom !== 'NON_PERSISTENT_COLLECTION') {
            // Handling for Reference Fields Data
            newData = processNeedleDataForReferenceFields(
              mergeDataAndExternalApiItem,
              needleList,
              newData,
              REFERENCE_FIELDS,
            );
          }

          // Handling for Collection Derived Fields Data
          newData = processNeedleDataForDerivedFields(
            collectionDerivedFields,
            mergeDataAndExternalApiItem,
            user,
            envConstants,
            needleList,
            newData,
            DERIVED_FIELDS,
            browserStorageData,
          );
        }
      }

      // Handling for Collection Constants Data
      newData = processNeedleDataForConstants(
        collectionConstants,
        needleList,
        newData,
        COLLECTION_CONSTANTS,
      );
      // Handling for Project Constants Data
      newData = processNeedleDataForConstants(
        projectConstants,
        needleList,
        newData,
        PROJECT_CONSTANTS,
      );
      // Handling for Session Data
      newData = processNeedleData(
        customBodyJsonString,
        sessionData,
        needleList,
        newData,
        CURRENT_SESSION,
      );
      // Handling for Form Data
      newData = processNeedleData(
        customBodyJsonString,
        currentFormSession,
        needleList,
        newData,
        FORM_DATA_SESSION,
      );
      // Handling for Session Storage Data
      newData = processNeedleData(
        customBodyJsonString,
        sessionStorageContent,
        needleList,
        newData,
        SESSION_STORAGE,
      );
      // Handling for Local Storage Data
      newData = processNeedleData(
        customBodyJsonString,
        localStorageContent,
        needleList,
        newData,
        LOCAL_STORAGE,
      );
      // Handling for Cookies Data
      newData = processNeedleData(
        customBodyJsonString,
        cookiesContent,
        needleList,
        newData,
        COOKIES,
      );
      // Handling for Current User Data
      newData = processNeedleData(
        customBodyJsonString,
        currentUserData,
        needleList,
        newData,
        CURRENT_USER_LOWER,
        currentUserDerivedFields,
        browserStorageData,
      );
      // Handling for Current Tenant Data
      newData = processNeedleData(
        customBodyJsonString,
        currentTenantData,
        needleList,
        newData,
        CURRENT_TENANT_LOWER,
        currentUserDerivedFields,
        browserStorageData,
      );
      // Handling for Current User Setting Data
      newData = processNeedleData(
        customBodyJsonString,
        currentUserSettingData,
        needleList,
        newData,
        CURRENT_SETTINGS_LOWER,
        currentUserDerivedFields,
        browserStorageData,
      );
      // Handling for Environment Variable Data
      newData = processNeedleData(
        customBodyJsonString,
        environment,
        needleList,
        newData,
        ENVIRONMENT_VARIABLE,
      );
      let newDataJSON = newData ? parseJsonString(newData) : {};
      // Empty data JSON Obj
      clearObject(data);
      // Populate data JSON with newDataJSON
      populateDataObjWithNewData(newDataJSON, data);
    }
  }
};

/**
 * ?INFO: Duplicate of processRequestBodyJson to create separate flow
 * ?INFO: for External API DataSource
 */
//TODO: Refactor after implementation of External API DataSource
const processCustomJsonForExternalSource = (
  projectId,
  data,
  externalApi,
  user,
  tenant,
  userSetting,
  customJsonDataObj,
  requestDataType,
  currentUserDerivedFields = {},
  browserStorageData = {},
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:1697 ~ processCustomJsonForExternalSource #7 browserStorageData:',
  //   browserStorageData,
  // );
  const { externalApiItem } = data ? data : {};
  dataCleanupForNonPersistentCollection(data);
  const {
    collectionItemId,
    formData,
    dataToSendToExternalApi,
    collectionFields,
    collectionConstants,
    collectionDerivedFields,
    projectConstants,
    environment,
  } = customJsonDataObj ? customJsonDataObj : '';
  const { constants: envConstants } = environment ? environment : '';

  // eslint-disable-next-line no-prototype-builtins
  if (formData.hasOwnProperty('externalApiItem')) {
    delete formData['externalApiItem'];
  }
  let jsonString = '';
  logger.info(`🚀 ==> processCustomJsonForExternalSource requestDataType: ${requestDataType}`, {
    label: projectId,
  });

  const { bodyCustomJSON } = externalApi ? externalApi : '';
  jsonString = bodyCustomJSON ?? '';
  logger.info(`🚀 ==> processCustomJsonForExternalSource jsonString: ${jsonString}`, {
    label: projectId,
  });

  let customBodyJsonString = '';
  const { sessionValue, sessionFormValue, sessionStorageData, localStorageData, cookiesData } =
    browserStorageData || {};
  const sessionData = sessionValue ? { current_session: sessionValue } : '';
  logger.info(`==> processCustomJsonForExternalSource sessionData :>> ${sessionData}`, {
    label: projectId,
  });
  const currentFormSession = sessionFormValue ? { form_data_session: sessionFormValue } : '';
  logger.info(
    `==> processCustomJsonForExternalSource currentFormSession :>> ${currentFormSession}`,
    {
      label: projectId,
    },
  );
  const sessionStorageContent = sessionStorageData ? { SESSION_STORAGE: sessionStorageData } : '';
  console.log(
    '==> processCustomJsonForExternalSource sessionStorageContent :>> ',
    sessionStorageContent,
  );
  const localStorageContent = localStorageData ? { LOCAL_STORAGE: localStorageData } : '';
  console.log(
    '==> processCustomJsonForExternalSource localStorageContent :>> ',
    localStorageContent,
  );
  const cookiesContent = cookiesData ? { COOKIES: cookiesData } : '';
  console.log('==> processCustomJsonForExternalSource cookiesContent :>> ', cookiesContent);
  const currentUserData = user ? { current_user: user } : '';
  logger.info(`==> processCustomJsonForExternalSource currentUserData :>> ${currentUserData}`, {
    label: projectId,
  });
  const currentTenantData = user ? { current_tenant: tenant } : '';
  logger.info(`==> processCustomJsonForExternalSource currentTenantData :>> ${currentTenantData}`, {
    label: projectId,
  });
  const currentUserSettingData = userSetting ? { current_settings: userSetting } : '';
  console.log(
    `==> processCustomJsonForExternalSource currentUserSettingData :>> ${currentUserSettingData}`,
    {
      label: projectId,
    },
  );

  if (jsonString) {
    if (jsonString && jsonString.includes("'")) {
      customBodyJsonString = jsonString.replaceAll("'", '"');
      customBodyJsonString = JSON.stringify(customBodyJsonString);
    } else {
      customBodyJsonString = JSON.stringify(jsonString);
    }

    let nonStringNeedles = [];
    if (customBodyJsonString) {
      nonStringNeedles = extractNeedlesFromString(customBodyJsonString, true);
    }
    console.log('🚀 ~ processCustomJsonForExternalSource ~ nonStringNeedles:', nonStringNeedles);

    if (nonStringNeedles && nonStringNeedles.length) {
      DTO_EXTERNAL_API['dtoNonStringNeedles'] = [...nonStringNeedles];
    }

    let customBodyJsonObj = customBodyJsonString ? parseJsonString(customBodyJsonString) : '';
    logger.info(
      `==> processCustomJsonForExternalSource customBodyJsonObj :>> ${customBodyJsonObj}`,
      {
        label: projectId,
      },
    );

    if (customBodyJsonObj) {
      const needleList = getNeedleList(customBodyJsonObj);
      logger.info(`==> processCustomJsonForExternalSource needleList :>> ${needleList}`, {
        label: projectId,
      });

      let newData = customBodyJsonObj;
      let mergeDataAndExternalApiItem = {};

      if (data && Object.keys(data).length > 0) {
        Object.keys(data).map((key) => {
          mergeDataAndExternalApiItem[key] = data[key];
        });
      }
      if (externalApiItem && Object.keys(externalApiItem).length > 0) {
        Object.keys(externalApiItem).map((key) => {
          mergeDataAndExternalApiItem[key] = externalApiItem[key];
          if (key === 'id') {
            mergeDataAndExternalApiItem['uuid'] = externalApiItem[key];
          }
        });
        if (formData) {
          Object.assign(mergeDataAndExternalApiItem, formData);
        }
      }

      if (collectionItemId) {
        if (dataToSendToExternalApi) {
          Object.assign(mergeDataAndExternalApiItem, dataToSendToExternalApi);
        }
      }

      if (mergeDataAndExternalApiItem && Object.keys(mergeDataAndExternalApiItem).length > 0) {
        if (needleList) {
          // Handling for Collection Fields Data
          newData = processNeedleDataForCollectionFields(
            mergeDataAndExternalApiItem,
            collectionFields,
            needleList,
            newData,
          );

          // Handling for Collection Derived Fields Data
          newData = processNeedleDataForDerivedFields(
            collectionDerivedFields,
            mergeDataAndExternalApiItem,
            user,
            envConstants,
            needleList,
            newData,
            DERIVED_FIELDS,
            browserStorageData,
          );
        }
      }

      // Handling for Collection Constants Data
      newData = processNeedleDataForConstants(
        collectionConstants,
        needleList,
        newData,
        COLLECTION_CONSTANTS,
      );
      // Handling for Project Constants Data
      newData = processNeedleDataForConstants(
        projectConstants,
        needleList,
        newData,
        PROJECT_CONSTANTS,
      );
      // Handling for Session Data
      newData = processNeedleData(
        customBodyJsonString,
        sessionData,
        needleList,
        newData,
        CURRENT_SESSION,
      );
      // Handling for Current Form Data
      newData = processNeedleData(
        customBodyJsonString,
        currentFormSession,
        needleList,
        newData,
        FORM_DATA_SESSION,
      );
      // Handling for Current User Data
      newData = processNeedleData(
        customBodyJsonString,
        currentUserData,
        needleList,
        newData,
        CURRENT_USER_LOWER,
        currentUserDerivedFields,
        browserStorageData,
      );
      // Handling for Current Tenant Data
      newData = processNeedleData(
        customBodyJsonString,
        currentTenantData,
        needleList,
        newData,
        CURRENT_TENANT_LOWER,
        currentUserDerivedFields,
        browserStorageData,
      );
      // Handling for Current User Setting Data
      newData = processNeedleData(
        customBodyJsonString,
        currentUserSettingData,
        needleList,
        newData,
        CURRENT_SETTINGS_LOWER,
        currentUserDerivedFields,
        browserStorageData,
      );
      // Handling for Environment Variable Data
      newData = processNeedleData(
        customBodyJsonString,
        environment,
        needleList,
        newData,
        ENVIRONMENT_VARIABLE,
      );

      console.log('🚀 ==> processCustomJsonForExternalSource ~ newData:', newData);
      let newDataJSON = newData ? parseJsonString(newData) : {};
      // Empty data JSON Obj
      clearObject(data);
      // Populate data JSON with newDataJSON
      populateDataObjWithNewData(newDataJSON, data, DTO_EXTERNAL_API['dtoIsExternalSource']);
    }
  }
};

export const processUrl = (
  url,
  data,
  user,
  tenant,
  userSetting,
  customJsonDataObj,
  currentUserDerivedFields = {},
  browserStorageData = {},
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:1932 ~ processUrl #8 browserStorageData:',
  //   browserStorageData,
  // );
  let newUrl = url;
  const { externalApiItem } = data ? data : {};
  const {
    collectionItemId,
    formData,
    dataToSendToExternalApi,
    collectionFields,
    collectionConstants,
    collectionDerivedFields,
    projectConstants,
    environment,
  } = customJsonDataObj ? customJsonDataObj : '';

  const { sessionValue, sessionFormValue, sessionStorageData, localStorageData, cookiesData } =
    browserStorageData || {};

  const sessionData = sessionValue ? { current_session: sessionValue } : '';
  // console.log('==> processUrl sessionData :>> ', sessionData);
  const currentFormSession = sessionFormValue ? { form_data_session: sessionFormValue } : '';
  // console.log('==> processUrl currentFormSession :>> ', currentFormSession);
  const currentUserData = user ? { current_user: user } : '';
  // console.log('==> processUrl currentUserData :>> ', currentUserData);
  const currentTenantData = user ? { current_tenant: tenant } : '';
  // console.log('==> processUrl currentTenantData:', currentTenantData);
  const currentUserSettingData = userSetting ? { current_settings: userSetting } : '';
  // console.log('==> processUrl currentUserSettingData:', currentUserSettingData);
  const sessionStorageContent = sessionStorageData ? { SESSION_STORAGE: sessionStorageData } : '';
  // console.log('==> processUrl sessionStorageContent:', sessionStorageContent);
  const localStorageContent = localStorageData ? { LOCAL_STORAGE: localStorageData } : '';
  // console.log('==> processUrl localStorageContent:', localStorageContent);
  const cookiesContent = cookiesData ? { COOKIES: cookiesData } : '';
  // console.log('==> processUrl cookiesContent:', cookiesContent);

  const needleList = url.match(/{{(.*?)}}/g)?.map((b) => b.replace(/{{(.*?)}}/g, '$1'));
  console.log('==> processRequestBodyJson needleList :>> ', needleList);

  let mergeDataAndExternalApiItem = {};

  if (data && Object.keys(data).length > 0) {
    Object.keys(data).map((key) => {
      mergeDataAndExternalApiItem[key] = data[key];
    });
  }
  if (externalApiItem && Object.keys(externalApiItem).length > 0) {
    Object.keys(externalApiItem).map((key) => {
      mergeDataAndExternalApiItem[key] = externalApiItem[key];
      if (key === 'id') {
        mergeDataAndExternalApiItem['uuid'] = externalApiItem[key];
      }
    });
    if (formData) {
      Object.assign(mergeDataAndExternalApiItem, formData);
    }
  }
  if (collectionItemId) {
    if (dataToSendToExternalApi) {
      Object.assign(mergeDataAndExternalApiItem, dataToSendToExternalApi);
    }
  }

  if (mergeDataAndExternalApiItem && Object.keys(mergeDataAndExternalApiItem).length > 0) {
    if (needleList) {
      // Handling for Collection Fields Data
      newUrl = processNeedleDataForCollectionFields(
        mergeDataAndExternalApiItem,
        collectionFields,
        needleList,
        newUrl,
        undefined,
        true,
      );

      // Handling for Reference Fields Data
      newUrl = processNeedleDataForReferenceFields(
        mergeDataAndExternalApiItem,
        needleList,
        newUrl,
        REFERENCE_FIELDS,
      );

      // Handling for Collection Derived Fields Data
      newUrl = processNeedleDataForDerivedFields(
        collectionDerivedFields,
        mergeDataAndExternalApiItem,
        user,
        environment.constants,
        needleList,
        newUrl,
        DERIVED_FIELDS,
        browserStorageData,
      );
    }
  }

  // Handling for Collection Constants Data
  newUrl = processNeedleDataForConstants(
    collectionConstants,
    needleList,
    newUrl,
    COLLECTION_CONSTANTS,
  );
  // Handling for Project Constants Data
  newUrl = processNeedleDataForConstants(projectConstants, needleList, newUrl, PROJECT_CONSTANTS);
  // Handling for Session Data
  newUrl = processNeedleData(newUrl, sessionData, needleList, newUrl, CURRENT_SESSION);
  // Handling for Current Form Data
  newUrl = processNeedleData(newUrl, currentFormSession, needleList, newUrl, FORM_DATA_SESSION);
  // Handling for Session Storage Data
  newUrl = processNeedleData(newUrl, sessionStorageContent, needleList, newUrl, SESSION_STORAGE);
  // Handling for Local Storage Data
  newUrl = processNeedleData(newUrl, localStorageContent, needleList, newUrl, LOCAL_STORAGE);
  // Handling for Cookies Data
  newUrl = processNeedleData(newUrl, cookiesContent, needleList, newUrl, COOKIES);
  // Handling for Current User Data
  newUrl = processNeedleData(
    newUrl,
    currentUserData,
    needleList,
    newUrl,
    CURRENT_USER_LOWER,
    currentUserDerivedFields,
    browserStorageData,
  );
  // Handling for Current Tenant Data
  newUrl = processNeedleData(
    newUrl,
    currentTenantData,
    needleList,
    newUrl,
    CURRENT_TENANT_LOWER,
    currentUserDerivedFields,
    browserStorageData,
  );
  // Handling for Current User Settings Data
  newUrl = processNeedleData(
    newUrl,
    currentUserSettingData,
    needleList,
    newUrl,
    CURRENT_SETTINGS_LOWER,
    currentUserDerivedFields,
    browserStorageData,
  );
  // Handling for Environment Variable Data
  newUrl = processNeedleData(newUrl, environment, needleList, newUrl, ENVIRONMENT_VARIABLE);
  return newUrl;
};

const processNeedleData = (
  jsonString,
  currentDataObj,
  needleList,
  newData,
  currentDataKey,
  currentUserDerivedFields = {},
  browserStorageData = {},
) => {
  if (jsonString.includes(currentDataKey)) {
    if (currentDataObj && Object.keys(currentDataObj).length > 0) {
      let allowedNeedles = [];
      switch (currentDataKey) {
        case CURRENT_SESSION:
          allowedNeedles = [CURRENT_SESSION];
          break;
        case FORM_DATA_SESSION:
          allowedNeedles = [FORM_DATA_SESSION];
          break;
        case SESSION_STORAGE:
          allowedNeedles = [SESSION_STORAGE];
          break;
        case LOCAL_STORAGE:
          allowedNeedles = [LOCAL_STORAGE];
          break;
        case COOKIES:
          allowedNeedles = [COOKIES];
          break;
        case CURRENT_USER_LOWER:
          allowedNeedles = [CURRENT_USER_LOWER];
          break;
        case CURRENT_TENANT_LOWER:
          allowedNeedles = [CURRENT_TENANT_LOWER];
          break;
        case CURRENT_SETTINGS_LOWER:
          allowedNeedles = [CURRENT_SETTINGS_LOWER];
          break;
        case ENVIRONMENT_VARIABLE:
          allowedNeedles = [ENVIRONMENT_VARIABLE];
          break;
        default:
          break;
      }

      needleList &&
        needleList
          ?.filter((needle) => startsWithOne(needle, allowedNeedles))
          ?.forEach((prop) => {
            if (prop.startsWith(currentDataKey)) {
              const needle = `{{${prop}}}`;
              newData = getNewData(
                currentDataKey,
                prop,
                needle,
                currentDataObj,
                newData,
                currentUserDerivedFields,
                needleList,
                browserStorageData,
              );
            }
          });
    }
  }
  return newData;
};

const getNewData = (
  currentDataKey,
  prop,
  needle,
  currentDataObj,
  newData,
  currentUserDerivedFields,
  needleList,
  browserStorageData = {},
) => {
  if (needle.includes(CURRENT_USER_DERIVED_FIELDS_PREFIX)) {
    newData = newData.replace(CURRENT_USER_DERIVED_FIELDS_PREFIX, DERIVED_FIELDS_PREFIX);
    needleList = needleList.map((needle) => {
      if (needle.includes(CURRENT_USER_DERIVED_FIELDS_PREFIX))
        needle = needle.replace(CURRENT_USER_DERIVED_FIELDS_PREFIX, DERIVED_FIELDS_PREFIX);
      return needle;
    });
    newData = processNeedleDataForDerivedFields(
      currentUserDerivedFields,
      currentDataObj.current_user,
      currentDataObj.current_user,
      {},
      needleList,
      newData,
      DERIVED_FIELDS,
      browserStorageData,
    );
  } else {
    let dataOfItem =
      currentDataKey === ENVIRONMENT_VARIABLE
        ? replaceValueFromSource(prop, currentDataObj, null)
        : _.get(currentDataObj, prop);
    dataOfItem = Array.isArray(dataOfItem) ? dataOfItem.join(',') : dataOfItem;
    newData = replaceNeedleValueForNewData(needle, newData, dataOfItem);
  }
  return newData;
};

const processNeedleDataForReferenceFields = (
  currentDataObj,
  needleList,
  newData,
  currentDataKey,
) => {
  if (currentDataObj && Object.keys(currentDataObj).length > 0) {
    if (needleList) {
      console.log(`==> processNeedleDataForReferenceFields :>> `, currentDataKey);
      needleList
        ?.filter((needle) => startsWithOne(needle, [REFERENCE_FIELDS_PREFIX]))
        ?.forEach((prop) => {
          if (prop.startsWith(REFERENCE_FIELDS_PREFIX)) {
            const cleanProp = prop.replace(REFERENCE_FIELDS_PREFIX, '');
            const needle = `{{${prop}}}`;
            //If we are getting array value then convert it to string comma separated.
            let dataOfItem = parseValueFromData(currentDataObj, cleanProp);
            dataOfItem = Array.isArray(dataOfItem) ? dataOfItem.join(',') : dataOfItem;
            //Format: {{NEEDLE}},'Value to Replace','JSON String'
            newData = findMyText(needle, dataOfItem ? dataOfItem.toString() : '', newData);
          }
        });
    }
  }
  return newData;
};

const processNeedleDataForCollectionFields = (
  currentDataObj,
  collectionFields,
  needleList,
  newData,
  currentDataKey,
  isUrl = false,
) => {
  const imgUP = process.env.AWS_S3_IMAGE_URL_PREFIX;
  if (currentDataObj && Object.keys(currentDataObj).length > 0) {
    console.log('==> processNeedleDataForCollectionFields currentDataKey :>> ', currentDataKey);

    console.log('##################################');
    console.log('🚀 processNeedleDataForCollectionFields DTO_EXTERNAL_API:', DTO_EXTERNAL_API);
    console.log('##################################');

    if (needleList) {
      needleList
        ?.filter(
          (needle) =>
            !startsWithOne(needle, [
              CURRENT_USER_LOWER,
              CURRENT_TENANT_LOWER,
              CURRENT_SESSION,
              FORM_DATA_SESSION,
              ENVIRONMENT_VARIABLE,
              REFERENCE_FIELDS_PREFIX,
              DERIVED_FIELDS_PREFIX,
              COLLECTION_CONSTANTS_PREFIX,
              PROJECT_CONSTANTS_PREFIX,
              SESSION_STORAGE,
              LOCAL_STORAGE,
              COOKIES,
              CURRENT_SETTINGS_LOWER,
            ]),
        )
        ?.forEach((prop) => {
          const needle = `{{${prop}}}`;
          let fieldSchema =
            (collectionFields &&
              Object.keys(collectionFields).length > 0 &&
              collectionFields.find((e) => e.fieldName === prop)) ||
            {};
          let dataOfItem = '';

          if (fieldSchema) {
            switch (fieldSchema.type) {
              case 'image':
              case 'file':
                // eslint-disable-next-line no-case-declarations
                let imageUrl = currentDataObj[prop] ? currentDataObj[prop].key : '';
                if (imageUrl) {
                  dataOfItem = `${imgUP}${imageUrl}`;
                }
                break;
              case 'multi_image':
                // eslint-disable-next-line no-case-declarations
                let imageUrls =
                  currentDataObj[prop] && currentDataObj[prop].length
                    ? currentDataObj[prop].map((e) => `${imgUP}${e.key}`)
                    : [];
                if (imageUrls) {
                  dataOfItem = imageUrls;
                }
                break;
              case 'boolean':
                dataOfItem = _.get(currentDataObj, prop);
                if (!dataOfItem) {
                  dataOfItem = false;
                }
                break;
              case 'number':
                dataOfItem = _.get(currentDataObj, prop);
                if (!dataOfItem) {
                  dataOfItem = null;
                }
                break;
              case 'date':
                dataOfItem = _.get(currentDataObj, prop);
                if (!dataOfItem && DTO_EXTERNAL_API['dtoIsExternalSource']) {
                  dataOfItem = null;
                }
                break;
              default:
                dataOfItem = _.get(currentDataObj, prop);
                break;
            }
          }

          //Set Default Field Value
          if (!dataOfItem) {
            const { extraFieldSetting } = fieldSchema || {};
            const { defaultValue } = extraFieldSetting || {};
            if (defaultValue) {
              dataOfItem = defaultValue;
            }
          }

          if (isUrl && !dataOfItem) dataOfItem = needle;
          newData = replaceNeedleValueForNewData(needle, newData, dataOfItem);
        });
    }
  }
  return newData;
};

const processNeedleDataForDerivedFields = (
  currentDataObj,
  mergeDataAndExternalApiItem,
  user,
  envConstants,
  needleList,
  newData,
  currentDataKey,
  browserStorageData,
) => {
  if (currentDataObj && Object.keys(currentDataObj).length > 0) {
    console.log('==> processNeedleDataForDerivedFields currentDataKey :>> ', currentDataKey);

    if (needleList) {
      needleList
        ?.filter((needle) => startsWithOne(needle, [DERIVED_FIELDS_PREFIX]))
        ?.forEach((prop) => {
          const needle = `{{${prop}}}`;
          const cleanProp = prop.replace(DERIVED_FIELDS_PREFIX, '');
          let dataOfItem = '';
          let driveField = currentDataObj.find((field) => field.name === cleanProp);
          if (driveField) {
            dataOfItem = prepareFunction(
              driveField,
              mergeDataAndExternalApiItem,
              user,
              envConstants,
              browserStorageData,
            );
          }
          //Format: {{NEEDLE}},'Value to Replace','JSON String'
          newData = findMyText(needle, dataOfItem ? dataOfItem.toString() : '', newData);
        });
    }
  }
  return newData;
};

const processNeedleDataForConstants = (currentDataObj, needleList, newData, currentDataKey) => {
  if (currentDataObj && Object.keys(currentDataObj).length > 0) {
    console.log('==> processNeedleDataForConstants currentDataKey :>> ', currentDataKey);
    const dataKey = fieldsKeyPrefixMap.find((dataKey) => dataKey.key === currentDataKey);
    const dataKeyPrefix = dataKey ? dataKey.prefix : '';

    let allowedNeedles = [];
    switch (currentDataKey) {
      case COLLECTION_CONSTANTS:
        allowedNeedles = [dataKeyPrefix];
        break;
      case PROJECT_CONSTANTS:
        allowedNeedles = [dataKeyPrefix];
        break;
      default:
        break;
    }

    if (needleList) {
      needleList
        ?.filter((needle) => startsWithOne(needle, allowedNeedles))
        ?.forEach((prop) => {
          const needle = `{{${prop}}}`;
          const cleanProp = prop.replace(dataKeyPrefix, '');
          let dataOfItem = '';
          let constant = currentDataObj.find((field) => field.name === cleanProp);
          if (constant) {
            dataOfItem = constant.value;
          }
          newData = replaceNeedleValueForNewData(needle, newData, dataOfItem);
        });
    }
  }
  return newData;
};

const getNonPersistentItem = async (
  builderDB,
  projectId,
  externalApi,
  data,
  user,
  envConstants,
  isDownloadBytes,
  projectConstants,
  environment,
  currentUserDerivedFields = {},
  browserStorageData = {},
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:2387 ~ getNonPersistentItem #9 browserStorageData:',
  //   browserStorageData,
  // );
  const { collectionName } = externalApi;
  let sendToExternalApi = {};
  let collectionDataOfItemId = {};
  let collectionSchema = await builderDB
    .collection('collections')
    .findOne({ collectionName, projectId });

  const derivedFields = collectionSchema ? collectionSchema.utilities : null;
  const fields = collectionSchema ? collectionSchema.fields : null;
  const constants = collectionSchema ? collectionSchema.constants : null;

  let { pageCollectionName } = data && data.externalApiItem ? data.externalApiItem : '';
  console.log(
    '🚀 ~ file: external-api.service.js:2408 ~ getNonPersistentItem pageCollectionName:',
    pageCollectionName,
  );

  /**
   * Process if the page is a Details Page
   */
  if (pageCollectionName) {
    let requestDataForDetailsPage = await processNonPersistentRequestDataForDetailsPage(
      builderDB,
      projectId,
      sendToExternalApi,
      collectionSchema,
      externalApi,
      data,
      user,
      envConstants,
      isDownloadBytes,
      projectConstants,
      environment,
      browserStorageData,
      currentUserDerivedFields,
    );
    let { sendToExternalApi: requestDataToSend, collectionDataOfItemId: collectionData } =
      requestDataForDetailsPage ?? '';
    return {
      derivedFields,
      fields,
      constants,
      sendToExternalApi: requestDataToSend,
      collectionDataOfItemId: collectionData,
    };
  } else {
    return { derivedFields, fields, constants, sendToExternalApi, collectionDataOfItemId };
  }
};

const nonPersistentDataCallRequest = (externalApi) => {
  const { setting, bodyCustomJSON, collectionMapping, requestDataJsonType } = externalApi;
  const { params, headers } = setting;

  /**
   * Scoped Fields are Dynamic fields '{{field}}' like: Id, Current User
   * Fields, Constants, Session Values
   * isOnlyScopedFields checks whether all the dynamic fields are Scoped Fields
   * or not.
   */
  const headerHasOnlyScopedFields = isOnlyScopedFields(headers);
  console.log(
    '==> nonPersistentDataCallRequest headerHasOnlyScopedFields :>> ',
    headerHasOnlyScopedFields,
  );
  const paramHasOnlyScopedFields = isOnlyScopedFields(params);
  console.log(
    '==> nonPersistentDataCallRequest paramHasOnlyScopedFields :>> ',
    paramHasOnlyScopedFields,
  );
  const collectionDataMappingHasOnlyScopedFields =
    requestDataJsonType === 'CUSTOM'
      ? isOnlyScopedFields(bodyCustomJSON)
      : isOnlyScopedFields(collectionMapping);
  console.log(
    '==> nonPersistentDataCallRequest collectionDataMappingHasOnlyScopedFields :>> ',
    collectionDataMappingHasOnlyScopedFields,
  );

  return (
    headerHasOnlyScopedFields &&
    paramHasOnlyScopedFields &&
    collectionDataMappingHasOnlyScopedFields
  );
};

//TODO: Need to refactor
const isOnlyScopedFields = (data) => {
  let result = true;
  const isArray = Array.isArray(data) && data.length > 0;
  const isObject =
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data !== null &&
    Object.keys(data).length > 0;
  const isString = typeof data === 'string';
  if (isArray) {
    const allIdKeys = data.map((dataObj) => {
      let valueArr = dataObj.value.split(/{{(.*?)}}/g);
      valueArr = valueArr && valueArr.filter((valObj) => !!valObj);
      let filteredValueArr =
        valueArr &&
        valueArr.filter(
          (valObj) =>
            ['_data_source_rest_api_primary_id', 'id'].includes(valObj) ||
            checkFieldValueType(valObj),
        );
      if (filteredValueArr && filteredValueArr.length > 0) {
        return filteredValueArr.every(
          (valueArrObj) =>
            valueArrObj.startsWith('_data_source_rest_api_primary_id') ||
            valueArrObj.startsWith('id') ||
            checkFieldValueType(valueArrObj),
        );
      } else {
        return false;
      }
    });
    if (allIdKeys && !allIdKeys.every((allIdKey) => !!allIdKey)) {
      result = false;
    }
  } else if (isObject) {
    const allIdKeys = Object.keys(data).map((key) => {
      let valueArr =
        data[key] && typeof data[key] === 'string' ? data[key].split(/{{(.*?)}}/g) : '';
      valueArr = valueArr && valueArr.filter((valObj) => !!valObj);
      let filteredValueArr =
        valueArr &&
        valueArr.filter(
          (valObj) =>
            ['_data_source_rest_api_primary_id', 'id'].includes(valObj) ||
            checkFieldValueType(valObj),
        );
      if (filteredValueArr && filteredValueArr.length > 0) {
        return filteredValueArr.every(
          (valueArrObj) =>
            valueArrObj.startsWith('_data_source_rest_api_primary_id') ||
            valueArrObj.startsWith('id') ||
            checkFieldValueType(valueArrObj),
        );
      } else {
        return false;
      }
    });
    if (allIdKeys && !allIdKeys.every((allIdKey) => !!allIdKey)) {
      result = false;
    }
  } else if (isString) {
    const allIdKeys = data.match(/{{(.*?)}}/g)?.map((key) => {
      let valueArr = key.split(/{{(.*?)}}/g);
      valueArr = valueArr && valueArr.filter((valObj) => !!valObj);
      let filteredValueArr =
        valueArr &&
        valueArr.filter(
          (valObj) =>
            ['_data_source_rest_api_primary_id', 'id'].includes(valObj) ||
            checkFieldValueType(valObj),
        );
      if (filteredValueArr && filteredValueArr.length > 0) {
        return filteredValueArr.every(
          (valueArrObj) =>
            valueArrObj.startsWith('_data_source_rest_api_primary_id') ||
            valueArrObj.startsWith('id') ||
            checkFieldValueType(valueArrObj),
        );
      } else {
        return false;
      }
    });
    if (allIdKeys && !allIdKeys.every((allIdKey) => !!allIdKey)) {
      result = false;
    }
  }
  return result;
};

const processNonPersistentRequestDataForDetailsPage = async (
  builderDB,
  projectId,
  sendToExternalApi,
  collectionSchema,
  externalApi,
  data,
  user,
  envConstants,
  isDownloadBytes,
  projectConstants,
  environment,
  browserStorageData,
  currentUserDerivedFields = {},
  collectionDataOfItemId = {},
) => {
  const { setting, collectionMapping, bodyDataFrom } = externalApi;

  let { externalApiItem } = data;
  const derivedFields = collectionSchema ? collectionSchema.utilities : null;
  const fields = collectionSchema ? collectionSchema.fields : null;
  const constants = collectionSchema ? collectionSchema.constants : null;

  const hasNonPersistentDataToReplace = nonPersistentDataCallRequest(externalApi);
  console.log(
    '==> processNonPersistentRequestDataForDetailsPage hasNonPersistentDataToReplace :>> ',
    hasNonPersistentDataToReplace,
  );

  /**
   * hasNonPersistentDataToReplace checks whether all the dynamic fields are
   * replaceable with the existing data or not.
   * When hasNonPersistentDataToReplace TRUE -> Don't make initial External
   * API call to build request body.
   * When hasNonPersistentDataToReplace FALSE -> Should make initial External
   * API call to build request body.
   */
  if (hasNonPersistentDataToReplace) {
    setting.params = replaceValuesFromObjArr(setting.params, [externalApiItem]);
    setting.headers = replaceValuesFromObjArr(setting.headers, [externalApiItem]);
    if (collectionMapping && collectionMapping.length > 0) {
      sendToExternalApi = await transformMappingData(
        builderDB,
        projectId,
        environment,
        externalApiItem,
        collectionMapping,
        derivedFields,
        fields,
        constants,
        projectConstants,
        user,
        envConstants,
        browserStorageData,
      );
      collectionDataOfItemId = externalApiItem;
    } else if (bodyDataFrom === 'RAW_JSON') {
      const fixedJsonDataObj = {
        projectConstants,
        environment,
      };
      const collectionData = { ...data };
      collectionDataOfItemId = { ...data };
      //Process Raw Body JSON
      processbodyRawJson(
        collectionData,
        externalApi,
        user,
        {},
        fixedJsonDataObj,
        currentUserDerivedFields,
        browserStorageData,
      );
      sendToExternalApi = { ...collectionData };
    }

    return { derivedFields, fields, constants, sendToExternalApi, collectionDataOfItemId };
  } else {
    console.log(
      '==> processNonPersistentRequestDataForDetailsPage ELSE hasNonPersistentDataToReplace :>> ',
      hasNonPersistentDataToReplace,
    );
    return { derivedFields, fields, constants, sendToExternalApi, collectionDataOfItemId };
  }
};

const resetExternalApiItemIds = (externalApiItem) => {
  // eslint-disable-next-line no-prototype-builtins
  if (externalApiItem.hasOwnProperty('id') && externalApiItem['id']) {
    externalApiItem['id'] = '';
  }
  if (
    // eslint-disable-next-line no-prototype-builtins
    externalApiItem.hasOwnProperty('_data_source_rest_api_primary_id') &&
    externalApiItem['_data_source_rest_api_primary_id']
  ) {
    externalApiItem['_data_source_rest_api_primary_id'] = '';
  }
  if (
    // eslint-disable-next-line no-prototype-builtins
    externalApiItem.hasOwnProperty('nonPersistentCollectionItemId') &&
    externalApiItem['nonPersistentCollectionItemId']
  ) {
    externalApiItem['nonPersistentCollectionItemId'] = '';
  }
};

const removeObjectProp = (sourceObj, propName) => {
  // eslint-disable-next-line no-prototype-builtins
  if (sourceObj && sourceObj.hasOwnProperty(propName)) {
    delete sourceObj[propName];
    console.log('==> resetExternalApiItemIds sourceObj :>> ', sourceObj);
  }
};

export const getDataTransferObject = (
  setting,
  collectionItem,
  customJsonDataObj,
  user,
  tenant,
  userSetting,
  currentUserDerivedFields,
  browserStorageData,
) => {
  // console.log(
  //   '🚀 ~ file: external-api.service.js:2724 ~ getDataTransferObject #10 browserStorageData:',
  //   browserStorageData,
  // );
  const { url, params, headers } = setting;
  const dataTransferObject = {};
  customJsonDataObj.dataToSendToExternalApi = collectionItem;
  //For Url
  console.log('\n url :>> ', url);
  const urlNeedleList = getNeedleList(url);
  console.log('\n urlNeedleList :>> ', urlNeedleList);
  urlNeedleList?.forEach((neddle) => {
    dataTransferObject[neddle] = processUrl(
      `{{${neddle}}}`,
      collectionItem,
      user,
      tenant,
      userSetting,
      customJsonDataObj,
      currentUserDerivedFields,
      browserStorageData,
    );
  });
  // For Headers
  console.log('\n headers :>> ', headers);
  headers.map((header) => {
    const neddleList = getNeedleList(header.value);
    console.log('\n neddleList :>> ', neddleList);
    neddleList?.forEach((prop) => {
      if (!dataTransferObject?.[prop]) {
        dataTransferObject[prop] = processUrl(
          `{{${prop}}}`,
          collectionItem,
          user,
          tenant,
          userSetting,
          customJsonDataObj,
          currentUserDerivedFields,
          browserStorageData,
        );
      }
    });
  });
  // For Params
  console.log('\n params :>> ', params);
  params.map((param) => {
    const neddleList = getNeedleList(param.value);
    console.log('\n neddleList :>> ', neddleList);
    neddleList?.forEach((prop) => {
      if (!dataTransferObject?.[prop]) {
        dataTransferObject[prop] = processUrl(
          `{{${prop}}}`,
          collectionItem,
          user,
          tenant,
          userSetting,
          customJsonDataObj,
          currentUserDerivedFields,
          browserStorageData,
        );
      }
    });
  });
  console.log('\n dataTransferObject :>> ', dataTransferObject);
  return dataTransferObject;
};

export const getNeedleList = (expression) => {
  return expression.match(/{{(.*?)}}/g)?.map((b) => b.replace(/{{(.*?)}}/g, '$1')) || [];
};

function processPaginationPropInHeader(
  dataSource,
  headers,
  data,
  offsetKey,
  pageOffsetValue,
  limitKey,
) {
  if (dataSource === 'SUPABASE') {
    const rangeHeader = headers && headers.find((header) => header.key.toLowerCase() === 'range');
    const hasRangeHeader = !!rangeHeader;
    console.log('🚀 ~ file: external-api.service.js:2714 ~ rangeHeader:', rangeHeader);
    console.log('🚀 ~ file: external-api.service.js:2714 ~ hasRangeHeader:', hasRangeHeader);

    /**
     * Compute pagination range values:
     * data[limitKey]: = 10
     * data[offsetKey] = 0 -> 10
     * pageOffsetValue: = 0 -> 1
     * startRange: = 0 -> 10
     * endRange:
     * ** If data[limitKey] = 10 then, 0 - 10 range will return 11 records,
     * ** To adjust limit of records to 10; decrease the endRange value by 1
     * rangeValue: 0-9 (10-1) -> 10-19 (20-1)
     */
    let startRange = data[offsetKey] || 0;
    let endRange = pageOffsetValue
      ? (pageOffsetValue + 1) * data[limitKey] - 1
      : data[limitKey] - 1;
    let rangeValue = `${startRange}-${endRange}`;

    //Handle pagination needle keys in the Header
    if (hasRangeHeader) {
      rangeHeader.value = rangeValue;
      const headersWithoutRange = headers.filter(
        (header) => !(header.key.toLowerCase() === 'range'),
      );

      if (rangeHeader.value.includes(`{{${offsetKey}}}`)) {
        if (startRange) {
          rangeHeader.value = rangeHeader.value.replaceAll(`{{${offsetKey}}}`, `${startRange}`);
        } else {
          rangeHeader.value = rangeHeader.value.replaceAll(`{{${offsetKey}}}`, ``);
        }
      }
      if (rangeHeader.value.includes(`{{${limitKey}}}`)) {
        if (endRange) {
          rangeHeader.value = rangeHeader.value.replaceAll(`{{${limitKey}}}`, `${endRange}`);
        } else {
          rangeHeader.value = rangeHeader.value.replaceAll(`{{${limitKey}}}`, ``);
        }
      }

      headers = [...headersWithoutRange, rangeHeader];
    } else {
      headers.push({
        id: headers.length + 1,
        key: 'Range',
        value: rangeValue,
      });
    }
    console.log('🚀 ~ file: external-api.service.js:2736 ~ headers:', headers);
  }
}

function addPaginationParamsInURL(dataSource, params, methodType, setting, key, value) {
  if (!dataSource || dataSource !== 'SUPABASE') {
    if (params.length < 1 && methodType === 'GET') {
      if (!setting.url.includes(`{{${key}}}`)) {
        if (setting.url.includes('?')) {
          setting.url += `&${key}=${value}`;
        } else {
          setting.url += `?${key}=${value}`;
        }
      }
    }
  }
}

function replacePaginationParamsInURL(dataSource, methodType, setting, key, value) {
  if (!dataSource || dataSource !== 'SUPABASE') {
    if (methodType === 'GET') {
      if (setting.url.includes(`{{${key}}}`)) {
        if (value) {
          setting.url = setting.url.replaceAll(`{{${key}}}`, `${value}`);
        } else {
          setting.url = setting.url.replaceAll(`{{${key}}}`, ``);
        }
      }
    }
  }
}

export const fetchUserWithRefFields = async (user, builderDB, db, projectId) => {
  if (user) {
    //Fetch User along with Reference objects
    try {
      let query = prepareUserQuery(user);
      const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
      const userCollection = await userCollectionService(builderDB, projectId);
      let { data: userObj } = await findItemById(
        db,
        builderDB,
        projectId,
        userCollection,
        null,
        query,
      );
      if (enableEncryption && encryption) {
        const userCollectionFields = userCollection ? userCollection.fields : [];
        const query = getEncryptedReferenceFieldsQuery(userCollectionFields, projectId);
        const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
        const cryptResponse = await processItemEncryptDecrypt(
          userObj,
          userCollectionFields,
          encryption,
          true,
          encryptedRefCollections,
        );
        userObj = cryptResponse;
      }
      Object.assign(user, userObj);
      delete user.password;
      delete user._id;
    } catch (error) {
      logger.error(`::::::::fetchUserWithRefFields err ${error.message}`, { label: projectId });
    }
  }
};

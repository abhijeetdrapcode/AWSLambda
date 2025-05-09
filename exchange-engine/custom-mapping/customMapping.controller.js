import { AppError } from 'drapcode-utility';
import { findCollection } from '../collection/collection.service';
import { filterItemService } from '../item/item.service';
import { cryptService } from '../middleware/encryption.middleware';
import { executeExternalApiAndProcess } from '../external-api/external-api.service';
import _ from 'lodash';
import { transformDataToMapping } from './customMapping.utils';
import { checkPermissionLevelSecurity } from '../item/item.utils';
import { extractUserSettingFromUserAndTenant } from '../middleware/tenant.middleware';
import { getExchangeRedisKey, PROJECT_CUSTOM_DATA_MAPPINGS } from '../project/build-utils';
import { redis_get_method } from 'drapcode-redis';

//TODO: Ali -> Handle browserStorageData and remove sessionValue,sessionFormValue
export const getCustomDataMapping = async (req, res, next) => {
  try {
    const {
      builderDB,
      db,
      query,
      params,
      headers,
      timezone,
      dateFormat,
      tenant,
      user,
      projectConstants,
      environment,
      enableProfiling,
      body,
      enableAuditTrail,
      projectId,
    } = req;
    const { uuid } = params;
    const { sessionValue, sessionFormValue, browserStorageDTO } = body;
    const { authorization } = headers;
    let customDataMapping = null;
    const REDIS_KEY_PROJECT_CUSTOM_DATA_MAPPINGS = getExchangeRedisKey(
      projectId,
      PROJECT_CUSTOM_DATA_MAPPINGS,
    );
    const redisResult = (await redis_get_method(REDIS_KEY_PROJECT_CUSTOM_DATA_MAPPINGS)) || null;
    let redisCustomDataMapping = null;
    if (redisResult && redisResult.length > 0) {
      redisCustomDataMapping = redisResult.find((item) => item.uuid === uuid);
    }
    if (redisCustomDataMapping) {
      console.log(`*** Found in redis! Returning custom data mapping: ${uuid}`);
      customDataMapping = redisCustomDataMapping;
    } else {
      customDataMapping = await builderDB.collection('customdatamappings').findOne({ uuid });
      if (!customDataMapping) throw AppError('Data Mapping with the id does not exist');
    }
    const {
      type,
      collectionName,
      filter,
      externalApi,
      responsePath,
      mapping,
      decrypted,
      refArrayFormat,
    } = customDataMapping;
    const userSetting = extractUserSettingFromUserAndTenant(user, tenant);
    const browserStorageData = {
      sessionValue,
      sessionFormValue,
      ...browserStorageDTO,
    };
    let finalData = [];
    if (type === 'COLLECTION') {
      let collection = await findCollection(builderDB, projectId, collectionName, filter);
      if (!collection || !collection.length) throw AppError('Collection does not exist');
      collection = collection[0];
      let { result } = await filterItemService(
        builderDB,
        db,
        projectId,
        collection,
        filter,
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
      let encryptedResponse;
      if (result) {
        encryptedResponse = await cryptService(
          result,
          builderDB,
          projectId,
          collection,
          true,
          false,
          decrypted,
        );
      }
      if (encryptedResponse) {
        if (encryptedResponse.status === 'FAILED') {
          return res.status(400).json(encryptedResponse);
        } else {
          result = encryptedResponse;
        }
      }
      const { permissionLevelSecurity = [] } = collection;
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
      let collectionData = await builderDB
        .collection('collections')
        .aggregate([{ $match: { projectId, collectionName } }])
        .project({ utilities: 1, collectionName: 1 })
        .toArray();
      collectionData = collectionData?.[0];
      const collObj = {
        collectionFields: collection.fields,
        collectionDerivedFields: collectionData?.utilities,
        collectionConstants: collection.constants,
      };
      finalData =
        mapping && mapping.length
          ? transformDataToMapping(
              result,
              mapping,
              collObj,
              user,
              tenant,
              userSetting,
              sessionValue,
              sessionFormValue,
              environment,
              projectConstants,
              browserStorageData,
              refArrayFormat,
            )
          : result;
    } else if (type === 'EXTERNAL_API') {
      const bodyData = {
        externalApiId: externalApi,
        data: {},
        userRole: '',
        sessionValue,
        sessionFormValue,
        browserStorageDTO,
      };
      const response = await executeExternalApiAndProcess(
        builderDB,
        db,
        projectId,
        enableAuditTrail,
        '',
        bodyData,
        projectConstants,
        user,
        tenant,
        userSetting,
        environment,
        enableProfiling,
        false,
      );
      const { responseData, collection } = response;
      finalData =
        mapping && mapping.length
          ? transformDataToMapping(
              responseData,
              mapping,
              collection,
              user,
              tenant,
              userSetting,
              sessionValue,
              sessionFormValue,
              environment,
              projectConstants,
              browserStorageData,
            )
          : responseData;
    }
    finalData = responsePath ? _.set({}, responsePath, finalData) : finalData;
    console.log('##### 2 #####');
    res.status(200).send(finalData);
  } catch (error) {
    console.error('get custom data mapping ~ error:', error);
    next(error);
  }
};

import { AppError } from 'drapcode-utility';
import { findCollection } from '../collection/collection.service';
import { filterItemService } from '../item/item.service';
import { cryptService } from '../middleware/encryption.middleware';
import { executeExternalApiAndProcess } from '../external-api/external-api.service';
import _ from 'lodash';
import { transformDataToMapping } from './customMapping.utils';
import { checkPermissionLevelSecurity } from '../item/item.utils';
import { getUserSettingById } from '../middleware/tenant.middleware';

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
      decrypt,
      body,
    } = req;
    const { uuid } = params;
    const { sessionValue, sessionFormValue, browserStorageDTO } = body;
    const { authorization } = headers;
    const customDataMapping = await builderDB.collection('customdatamappings').findOne({ uuid });
    if (!customDataMapping) throw AppError('Data Mapping with the id does not exist');
    const { projectId, type, collectionName, filter, externalApi, responsePath, mapping } =
      customDataMapping;
    let userSetting;
    if (user && user.userSettingId && user.userSettingId.length) {
      const loggedInUserSettings = user.userSettingId;
      const loggedInUserSettingId =
        loggedInUserSettings && loggedInUserSettings.length > 0 ? loggedInUserSettings[0] : '';
      userSetting = await getUserSettingById(builderDB, db, projectId, loggedInUserSettingId);
    }
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
          decrypt,
        );
      }
      if (encryptedResponse) {
        console.log('encryptedResponse', encryptedResponse);
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
            )
          : result;
    } else if (type === 'EXTERNAL_API') {
      const bodyData = {
        externalApiId: externalApi,
        data: {},
        userRole: '',
        sessionValue,
        sessionFormValue,
      };
      const response = await executeExternalApiAndProcess(
        builderDB,
        db,
        projectId,
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

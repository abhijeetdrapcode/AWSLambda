import {
  findCollectionsByQuery,
  multiTenantCollService,
  userSettingCollService,
} from '../collection/collection.service';
import { findItemById } from '../item/item.service';
import { getProjectEncryption } from './encryption.middleware';
import { getEncryptedReferenceFieldsQuery, processItemEncryptDecrypt } from 'drapcode-utility';

export const tenantMiddleware = async (req, res, next) => {
  try {
    const { headers, user, builderDB, db, projectId } = req;
    let tenantId;
    tenantId = headers['x-tenant-id'];
    if (!tenantId) tenantId = extractFirstTenantIdFromUser(user);
    req.tenant = await getTenantById(builderDB, db, projectId, tenantId);
    next();
  } catch (error) {
    console.error('\n error :>> ', error);
  }
};

export const getTenantById = async (builderDB, dbConnection, projectId, tenantId) => {
  let tenant = null;
  if (tenantId) {
    const collectionData = await multiTenantCollService(builderDB, projectId);
    if (collectionData) {
      tenant = await findItemById(
        dbConnection,
        builderDB,
        projectId,
        collectionData,
        tenantId,
        null,
      );
      tenant = tenant && tenant.data ? tenant.data : '';
      const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
      if (enableEncryption && encryption) {
        const collectionDataFields = collectionData ? collectionData.fields : [];
        const query = getEncryptedReferenceFieldsQuery(collectionDataFields, projectId);
        const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
        const cryptResponse = await processItemEncryptDecrypt(
          tenant,
          collectionDataFields,
          encryption,
          true,
          encryptedRefCollections,
        );
        tenant = cryptResponse;
        console.log('*** Decrypted ~ tenant:', tenant);
      }
    }
  }
  console.log('tenant getTenantById', tenant ? tenant.uuid : '');
  return tenant;
};

export const getUserSettingById = async (builderDB, dbConnection, projectId, userSettingId) => {
  let userSetting = null;
  if (userSettingId) {
    const collectionData = await userSettingCollService(builderDB, projectId);
    if (collectionData) {
      userSetting = await findItemById(
        dbConnection,
        builderDB,
        projectId,
        collectionData,
        userSettingId,
        null,
      );
      userSetting = userSetting && userSetting.data ? userSetting.data : '';
      const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
      if (enableEncryption && encryption) {
        const collectionDataFields = collectionData ? collectionData.fields : [];
        const query = getEncryptedReferenceFieldsQuery(collectionDataFields, projectId);
        const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
        const cryptResponse = await processItemEncryptDecrypt(
          userSetting,
          collectionDataFields,
          encryption,
          true,
          encryptedRefCollections,
        );
        userSetting = cryptResponse;
        console.log('*** Decrypted ~ userSetting:', userSetting);
      }
    }
  }
  return userSetting;
};

export const extractFirstTenantIdFromUser = (user) => {
  let tenant = '';
  if (user && user?.tenantId) {
    const { tenantId } = user;
    tenant = tenantId.length && tenantId[0].uuid ? tenantId[0].uuid : '';
  }
  return tenant;
};

export const extractFirstUserSettingIdFromUser = (user) => {
  let userSetting = '';
  if (user && user?.userSettingId) {
    const { userSettingId } = user;
    userSetting = userSettingId.length && userSettingId[0].uuid ? userSettingId[0].uuid : '';
  }
  return userSetting;
};

export const extractUserSettingFromUserAndTenant = (user, currentTenant) => {
  try {
    let userSetting;
    if (user && user.userSettingId) {
      const { userSettingId = [], uuid = '' } = user;
      console.log('userSettingId in user details', userSettingId);
      const { uuid: tenantId = '' } = currentTenant ?? {};
      if (userSettingId && userSettingId.length) {
        const filteredUserSetting = userSettingId.filter((item) => {
          const tenantMatches = item.tenantId.length ? item?.tenantId[0]?.uuid === tenantId : false;
          const userMatches = item.userId.length ? item?.userId[0]?.uuid === uuid : false;
          return tenantMatches && userMatches;
        });
        if (filteredUserSetting && filteredUserSetting.length) {
          userSetting = filteredUserSetting[0];
          console.log('filtered userSetting', userSetting);
        } else {
          userSetting = userSettingId[0];
          console.log('userSetting first from user', userSetting);
        }
      }
    }
    console.log('user settings extracted', userSetting);
    return userSetting;
  } catch (error) {
    console.error('Error extracting user setting:', error);
    return error;
  }
};

export const extractUserSettingFromUserAndTenantUsingIds = async (
  builderDB,
  dbConnection,
  projectId,
  user,
  currentTenant,
) => {
  try {
    let userSetting = [];
    if (user?.userSettingId?.length) {
      const { userSettingId = [], uuid = '' } = user;
      const { uuid: tenantId = '' } = currentTenant ?? {};
      const userSettings = await Promise.all(
        userSettingId.map(
          async (id) => await getUserSettingById(builderDB, dbConnection, projectId, id),
        ),
      );
      const filteredUserSettings = userSettings.filter(
        (item) => item?.tenantId?.uuid === tenantId && item?.userId?.uuid === uuid,
      );
      userSetting = filteredUserSettings.length ? filteredUserSettings[0] : userSettings[0];
    }
    return userSetting;
  } catch (error) {
    console.error('Error in extractUserSettingFromUserAndTenantUsingIds:', error);
    return error;
  }
};

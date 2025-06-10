import { pluginCode } from 'drapcode-constant';
import { findCollectionsByQuery, findOneService } from '../collection/collection.service';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { findItemByIdAfterCollection } from '../item/item.service';
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
    const multiTenantPlugin = await findInstalledPlugin(builderDB, {
      code: pluginCode.MULTI_TENANT_SAAS,
      projectId,
    });
    if (multiTenantPlugin) {
      const { multiTenantCollection } = multiTenantPlugin?.setting || '';
      if (multiTenantCollection) {
        const collectionData = await findOneService(builderDB, { uuid: multiTenantCollection });
        if (collectionData) {
          tenant = await findItemByIdAfterCollection(dbConnection, collectionData, tenantId, null);
          tenant = tenant && tenant.data ? tenant.data : '';
          const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
          if (enableEncryption && encryption) {
            const collectionDataFields = collectionData ? collectionData.fields : [];
            const query = getEncryptedReferenceFieldsQuery(collectionDataFields, projectId);
            const encrypedRefCollections = await findCollectionsByQuery(builderDB, query);
            const cryptResponse = await processItemEncryptDecrypt(
              tenant,
              collectionDataFields,
              encryption,
              true,
              encrypedRefCollections,
            );
            tenant = cryptResponse;
            console.log('*** Decrypted ~ tenant:', tenant);
          }
        }
      }
    }
  }
  console.log('tenant getTenantById', tenant ? tenant.uuid : '');
  return tenant;
};

export const getUserSettingById = async (builderDB, dbConnection, projectId, userSettingId) => {
  let userSetting = null;
  if (userSettingId) {
    const multiTenantPlugin = await findInstalledPlugin(builderDB, {
      code: pluginCode.MULTI_TENANT_SAAS,
      projectId,
    });
    if (multiTenantPlugin) {
      const { userSettingsCollection } = multiTenantPlugin?.setting || '';
      if (userSettingsCollection) {
        const collectionData = await findOneService(builderDB, { uuid: userSettingsCollection });
        if (collectionData) {
          userSetting = await findItemByIdAfterCollection(
            dbConnection,
            collectionData,
            userSettingId,
            null,
          );
          userSetting = userSetting && userSetting.data ? userSetting.data : '';
          const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
          if (enableEncryption && encryption) {
            const collectionDataFields = collectionData ? collectionData.fields : [];
            const query = getEncryptedReferenceFieldsQuery(collectionDataFields, projectId);
            const encrypedRefCollections = await findCollectionsByQuery(builderDB, query);
            const cryptResponse = await processItemEncryptDecrypt(
              userSetting,
              collectionDataFields,
              encryption,
              true,
              encrypedRefCollections,
            );
            userSetting = cryptResponse;
            console.log('*** Decrypted ~ userSetting:', userSetting);
          }
        }
      }
    }
  }
  console.log('userSetting getUserSettingById', userSetting);
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

export const extractUserSettingFromUserAndTenant = async (user, currentTenant) => {
  try {
    let userSetting = [];
    if (user && user.userSettingId) {
      const { userSettingId = [], uuid = '' } = user;
      const { uuid: tenantId = '' } = currentTenant ?? {};
      if (userSettingId && userSettingId.length) {
        const filteredUserSetting = userSettingId.filter((item) => {
          const tenantMatches = item.tenantId ? item.tenantId.includes(tenantId) : false;
          const userMatches = item.userId ? item.userId.includes(uuid) : false;
          return tenantMatches && userMatches;
        });
        if (filteredUserSetting && filteredUserSetting.length) {
          userSetting = filteredUserSetting[0];
        } else {
          userSetting = userSettingId[0];
        }
      }
    }
    return userSetting;
  } catch (error) {
    console.error('Error extracting user setting:', error);
    return error;
  }
};

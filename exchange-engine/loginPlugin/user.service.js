import { pluginCode } from 'drapcode-constant';
import { generateUsername } from 'unique-username-generator';
import {
  checkCollectionByName,
  findCollectionsByQuery,
  multiTenantCollService,
  userCollectionService,
} from '../collection/collection.service';
import {
  convertPasswordTypeFields,
  convertSingleItemToList,
  validateItemCollection,
  convertStringDataToObject,
  convertAutoGenerateTypeFields,
  findOneItemByQuery,
  findItemById,
  saveCollectionItem,
  updateItemById,
} from '../item/item.service';
import { v4 as uuidv4 } from 'uuid';
import { roleCollectionName, updatePermissions, userCollectionName } from './loginUtils';
import { PROVIDER_TYPE, signUpWithBackendless, signUpWithXano } from './authProviderUtil';
import { customInsertOne } from '../utils/utils';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import _, { isArray } from 'lodash';
import axios from 'axios';
import {
  getEncryptedReferenceFieldsQuery,
  processItemEncryptDecrypt,
  replaceValueFromSource,
  validateEmail,
} from 'drapcode-utility';
import { getProjectEncryption } from '../middleware/encryption.middleware';
import { findTemplate } from '../email-template/template.service';
import { replaceFieldsIntoTemplate, sendEmailUsingSes } from '../email/email.service';
import { getTokenExpireTime, issueJWTToken } from './jwtUtils';
import {
  extractUserSettingFromUserAndTenant,
  getTenantById,
} from '../middleware/tenant.middleware';

import { createAuditTrail } from '../logs/audit/audit.service';
import { isNew } from '../utils/appUtils';
const Chance = require('chance');
const chance = new Chance();
const DUMMY_EMAIL_DOMAIN = '@email.com';

export const saveUser = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  userData,
  isNewPhoneSignUp = false,
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, userCollectionName);
  console.log('collectionData saveUser', collectionData);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }

  validateUserData(collectionData, userData);
  userData.password = userData.password ? userData.password : chance.string({ length: 10 });
  console.log('==> saveUser userData :>> ', userData);
  const errorJson = await validateItemCollection(
    dbConnection,
    collectionData,
    userData,
    null,
    false,
    false,
    isNewPhoneSignUp,
  );
  console.error('errorJson saveUser', errorJson);
  if (Object.keys(errorJson).length !== 0) {
    if (errorJson.field)
      return {
        code: 409,
        message: 'Validation Failed',
        data: errorJson.field,
      };
  } else {
    userData = await convertAutoGenerateTypeFields(
      builderDB,
      dbConnection,
      projectId,
      collectionData,
      userData,
    );
    userData = await convertPasswordTypeFields(
      builderDB,
      dbConnection,
      projectId,
      collectionData,
      userData,
    );
    userData = await convertSingleItemToList(collectionData, userData);
    userData = await convertStringDataToObject(collectionData, userData);
    userData.createdAt = new Date();
    userData.updatedAt = new Date();
    if (!_.get(userData, 'uuid')) {
      userData.uuid = uuidv4();
    }

    let dbCollection = await dbConnection.collection(userCollectionName);
    // FINAL: START:Audit Trail
    createAuditTrail(
      dbConnection,
      enableAuditTrail,
      'NORMAL',
      'create',
      '',
      userCollectionName,
      userData,
    );
    // END:Audit Trail
    const savedItem = await customInsertOne(dbCollection, userData);
    // eslint-disable-next-line no-prototype-builtins
    if (savedItem) {
      await copyPermissionsInUser(dbConnection, enableAuditTrail, savedItem);
    }

    return {
      code: 201,
      message: 'Item Created Successfully',
      data: savedItem ? savedItem : {},
    };
  }
};

export const saveUserWithProvider = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  userData,
  provider,
  environment,
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, userCollectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }

  validateUserData(collectionData, userData);
  userData.password = userData.password ? userData.password : chance.string({ length: 10 });
  console.log('==> saveUserWithProvider userData :>> ', userData);
  const errorJson = await validateItemCollection(
    dbConnection,
    collectionData,
    userData,
    null,
    false,
  );
  console.log('errorJson', errorJson);
  if (Object.keys(errorJson).length !== 0 && errorJson.field) {
    return {
      code: 409,
      message: 'Validation Failed',
      data: errorJson.field,
    };
  }

  let role = '';
  if (userData.userRoles && userData.userRoles.length > 0) {
    console.log('==> saveUserWithProvider userData.userRoles :>> ', userData.userRoles);
    console.log(
      '==> saveUserWithProvider isArray(userData.userRoles) :>> ',
      isArray(userData.userRoles),
    );
    let roleName = isArray(userData.userRoles) ? userData.userRoles[0] : userData.userRoles;
    role = await findOneItemByQuery(dbConnection, roleCollectionName, {
      name: roleName,
    });
  }
  console.log('==> saveUserWithProvider userData role :>> ', role);

  if (!role || role.length === 0) {
    return {
      code: 409,
      message: 'Validation Failed',
      data: 'The provided role does not exist. Please verify and try again.',
    };
  }

  // eslint-disable-next-line no-prototype-builtins
  if (userData && userData.hasOwnProperty('tenantRoleMapping') && userData.tenantRoleMapping) {
    console.log(
      '==> saveUserWithProvider userData.tenantRoleMapping :>> ',
      userData.tenantRoleMapping,
    );
    const tenantRoleMappingRole = userData.tenantRoleMapping;
    console.log('🚀 ~ file: user.service.js:164 ~ tenantRoleMappingRole:', tenantRoleMappingRole);
    // eslint-disable-next-line no-prototype-builtins
    if (userData && userData.hasOwnProperty('tenantId') && userData.tenantId.length > 0) {
      console.log('🚀 ~ file: user.service.js:168 ~ userData.tenantId:', userData.tenantId);
      const tenantRoleMap = [];
      tenantRoleMap.push({
        tenantId: userData.tenantId[0],
        role: tenantRoleMappingRole,
        createdAt: new Date(),
      });
      userData.tenantRoleMapping = tenantRoleMap;
    }
    // eslint-disable-next-line no-prototype-builtins
    if (userData && userData.hasOwnProperty('userSettingId') && userData.userSettingId.length > 0) {
      console.log(
        '🚀 ~ file: user.service.js:168 ~ userData.userSettingId:',
        userData.userSettingId,
      );
      const tenantRoleMap = [];
      tenantRoleMap.push({
        userSettingId: userData.userSettingId[0],
        role: tenantRoleMappingRole,
        createdAt: new Date(),
      });
      userData.tenantRoleMapping = tenantRoleMap;
    }
  }

  let extraDocument = {};
  let uuid = '';
  if (provider) {
    let authResponse = await processAuthSignup(
      builderDB,
      projectId,
      provider,
      userData,
      environment,
    );
    if (!authResponse.success) {
      console.log('Sending Sending');
      return {
        code: authResponse.status,
        message: authResponse.message,
        data: authResponse.message,
      };
    }

    if (provider === PROVIDER_TYPE.XANO) {
      const { authToken, id, name } = authResponse.data;
      extraDocument = { authToken };
      if (name) {
        extraDocument = { ...extraDocument, name };
      }
      uuid = id;
    } else if (provider === PROVIDER_TYPE.BACKENDLESS) {
      const { authToken, ownerId, name } = authResponse.data;
      extraDocument = { authToken };
      if (name) {
        extraDocument = { ...extraDocument, name };
      }
      uuid = ownerId;
    }
  } else {
    uuid = uuidv4();
  }

  userData = await convertAutoGenerateTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    userData,
  );

  //Encrypt Record here
  userData = await encryptUser(builderDB, projectId, collectionData, userData);

  userData = await convertPasswordTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    userData,
  );
  userData = await convertSingleItemToList(collectionData, userData);
  userData = await convertStringDataToObject(collectionData, userData);
  userData.createdAt = new Date();
  userData.updatedAt = new Date();
  userData.uuid = uuid;

  userData = { ...userData, ...extraDocument };
  console.log('userData', userData);

  let dbCollection = await dbConnection.collection(userCollectionName);
  // FINAL: START:Audit Trail
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'create',
    '',
    userCollectionName,
    userData,
  );
  // END:Audit Trail

  const savedItem = await customInsertOne(dbCollection, userData);
  // eslint-disable-next-line no-prototype-builtins
  if (savedItem) {
    await copyPermissionsInUser(dbConnection, enableAuditTrail, savedItem);
  }

  return {
    code: 201,
    message: 'Item Created Successfully',
    data: savedItem ? savedItem : {},
  };
};

export const saveAnonymousUser = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  userData,
) => {
  const collectionData = await checkCollectionByName(builderDB, projectId, userCollectionName);
  if (!collectionData) {
    return { code: 404, data: `Collection not found with provided name` };
  }

  if (!userData.userName || userData.userName === 'anonymous-user-login') {
    userData.userName = generateUsername('', 4);
  }
  validateUserData(collectionData, userData);
  userData.password = userData.password ? userData.password : chance.string({ length: 10 });
  console.log('==> saveAnonymousUser userData :>> ', userData);
  const errorJson = await validateItemCollection(
    dbConnection,
    collectionData,
    userData,
    null,
    false,
  );
  console.error('errorJson', errorJson);
  if (Object.keys(errorJson).length !== 0 && errorJson.field) {
    return {
      code: 409,
      message: 'Validation Failed',
      data: errorJson.field,
    };
  }

  let role = '';
  if (userData.userRoles && userData.userRoles.length > 0) {
    console.log('==> saveAnonymousUser userData.userRoles :>> ', userData.userRoles);
    console.log('==> saveAnonymousUser isArray :>> ', isArray(userData.userRoles));
    let roleName = isArray(userData.userRoles) ? userData.userRoles[0] : userData.userRoles;
    role = await findOneItemByQuery(dbConnection, roleCollectionName, {
      name: roleName,
    });
  }
  console.log('==> saveUserWithProvider userData role :>> ', role);
  if (!role || role.length === 0) {
    return {
      code: 409,
      message: 'Validation Failed',
      data: 'The provided role does not exist. Please verify and try again.',
    };
  }

  let extraDocument = {};
  let uuid = uuidv4();
  userData = await convertAutoGenerateTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    userData,
  );

  //Encrypt Record here
  userData = await encryptUser(builderDB, projectId, collectionData, userData);

  userData = await convertPasswordTypeFields(
    builderDB,
    dbConnection,
    projectId,
    collectionData,
    userData,
  );
  userData = await convertSingleItemToList(collectionData, userData);
  userData = await convertStringDataToObject(collectionData, userData);
  userData.createdAt = new Date();
  userData.updatedAt = new Date();
  userData.uuid = uuid;

  userData = { ...userData, ...extraDocument };

  let dbCollection = await dbConnection.collection(userCollectionName);
  // FINAL: START:Audit Trail
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'create',
    '',
    userCollectionName,
    userData,
  );
  // END:Audit Trail
  const savedItem = await customInsertOne(dbCollection, userData);
  // eslint-disable-next-line no-prototype-builtins
  if (savedItem) {
    await copyPermissionsInUser(dbConnection, enableAuditTrail, savedItem);
  }

  return {
    code: 201,
    message: 'Item Created Successfully',
    data: savedItem ? savedItem : {},
  };
};

const processAuthSignup = async (builderDB, projectId, provider, userData, environment) => {
  let authData = null;
  let authResponse = null;
  let providerCode = '';
  switch (provider) {
    case PROVIDER_TYPE.XANO:
      providerCode = pluginCode.LOGIN_WITH_XANO;
      break;
    case PROVIDER_TYPE.BACKENDLESS:
      providerCode = pluginCode.LOGIN_WITH_BACKENDLESS;
      break;
    default:
      providerCode = '';
      break;
  }
  if (!providerCode) {
    return { success: false, status: 405, message: 'No provider found' };
  }

  const plugin = await findInstalledPlugin(builderDB, {
    code: providerCode,
    projectId,
  });

  if (!plugin) {
    return { success: false, status: 405, message: 'Provider Plugin is not installed' };
  }

  if (provider === PROVIDER_TYPE.XANO) {
    authData = { email: userData.userName, password: userData.password };
    authResponse = await signUpWithXano(environment, plugin.setting, authData);
  } else if (provider === PROVIDER_TYPE.BACKENDLESS) {
    authData = { email: userData.userName, password: userData.password };
    authResponse = await signUpWithBackendless(environment, plugin.setting, authData);
  }
  return authResponse;
};

export const validateUserData = (collectionData, userData) => {
  let { fields } = collectionData ? collectionData : '';
  const requireFields = fields ? fields.filter((field) => field.required) : [];

  for (const field of requireFields) {
    if (!userData[`${field.fieldName}`]) {
      console.log('==> validateUserData field is required :>> ', field.fieldTitle.en);
      //Handling the missing required fields
      if (field.fieldName === 'userName') {
        if (!userData['userName']) {
          let usernameFieldValue = '';
          if (userData && userData['email']) {
            usernameFieldValue = userData['email'];
            if (userData['email'].includes('@')) {
              usernameFieldValue = userData['email'].split('@')[0];
            }
            userData['userName'] = usernameFieldValue;
          } else if (userData && userData['phone_number']) {
            usernameFieldValue = userData['phone_number'];
            if (userData['phone_number'].includes('+')) {
              usernameFieldValue = userData['phone_number'].split('+')[1];
            }
            userData['userName'] = usernameFieldValue;
          }
        }
      } else if (field.fieldName === 'email') {
        if (!userData['email']) {
          let emailFieldValue = '';
          if (userData && userData['userName']) {
            emailFieldValue = userData['userName'];
            if (!userData['userName'].includes('@')) {
              emailFieldValue += DUMMY_EMAIL_DOMAIN;
            }
            userData['email'] = emailFieldValue;
          } else if (userData && userData['phone_number']) {
            emailFieldValue = userData['phone_number'];
            if (userData['phone_number'].includes('+')) {
              emailFieldValue = userData['phone_number'].split('+')[1];
            }
            if (!userData['phone_number'].includes('@')) {
              emailFieldValue += DUMMY_EMAIL_DOMAIN;
            }
            userData['email'] = emailFieldValue;
          }
        }
      }
    }
  }
};

export const updateTenantPermissionsService = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  tenantId,
  permissions,
) => {
  if (!tenantId) {
    return null;
  }

  const collectionData = await multiTenantCollService(builderDB, projectId);
  if (!collectionData) {
    return null;
  }

  let tenant = null;
  const query = { uuid: tenantId };
  const collectionName = collectionData.collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);

  tenant = await dbCollection.findOne(query);
  const tenantPermission = updatePermissions(tenant.permissions || [], permissions);
  console.log('\n tenantPermission ', tenantPermission);

  let newValues = { $set: { permissions: tenantPermission } };
  //FINAL: START:Audit Trail
  const collItem = await dbCollection.find(query);
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'update',
    '',
    collectionName,
    { permissions: tenantPermission },
    { permissions: collItem['permissions'] },
  );
  // END:Audit Trail

  let data = await dbCollection.findOneAndUpdate(query, newValues, isNew);
  if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
    return { code: 404, message: 'Item not found with provided id', data: {} };
  }
  tenant = await findItemById(dbConnection, builderDB, projectId, collectionData, tenantId, null);
  tenant = tenant && tenant.data ? tenant.data : '';

  console.log('tenant permission updated', tenant);
  return tenant;
};
export const updateUserPermissionsService = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  userId,
  permissions,
) => {
  if (!userId) {
    return null;
  }
  let user = null;
  const query = { uuid: userId };
  let dbCollection = await dbConnection.collection(userCollectionName);

  user = await dbCollection.findOne(query);
  const userPermissions = updatePermissions(user.permissions || [], permissions);
  console.log('\n userPermissions ', userPermissions);
  let newValues = { $set: { permissions: userPermissions } };
  // FINAL: START:Audit Trail
  const collItem = await dbCollection.findOne(query);
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'update',
    '',
    userCollectionName,
    { permissions: userPermissions },
    { permissions: collItem['permissions'] },
  );
  // END:Audit Trail

  let data = await dbCollection.findOneAndUpdate(query, newValues, isNew);
  if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
    return { code: 404, message: 'Item not found with provided id', data: {} };
  }
  console.log('user permission updated ', user);
  return user;
};

export const updateUserSettingsPermissionsService = async (
  builderDB,
  dbConnection,
  projectId,
  enableAuditTrail,
  userSettingId,
  permissions,
) => {
  let userSetting = null;
  if (!userSettingId) {
    return null;
  }

  const collectionData = await multiTenantCollService(builderDB, projectId);
  if (!collectionData) {
    return null;
  }

  const query = { uuid: userSettingId };
  const collectionName = collectionData.collectionName.toString().toLowerCase();
  let dbCollection = await dbConnection.collection(collectionName);

  userSetting = await dbCollection.findOne(query);
  const settingPermission = updatePermissions(userSetting.permissions || [], permissions);
  console.log('\n settingPermission ', settingPermission);
  let newValues = { $set: { permissions: settingPermission } };

  // FINAL: START:Audit Trail
  const collItem = await dbCollection.findOne(query);
  createAuditTrail(
    dbConnection,
    enableAuditTrail,
    'NORMAL',
    'update',
    '',
    collectionName,
    { permissions: settingPermission },
    { permissions: collItem['permissions'] },
  );
  // END:Audit Trail
  let data = await dbCollection.findOneAndUpdate(query, newValues, isNew);
  if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
    return { code: 404, message: 'Item not found with provided id', data: {} };
  }
  userSetting = await findItemById(
    dbConnection,
    builderDB,
    projectId,
    collectionData,
    userSettingId,
    null,
  );
  userSetting = userSetting && userSetting.data ? userSetting.data : '';
  console.log('user setting permission updated', userSetting);
  return userSetting;
};

export const copyPermissionsInUser = async (dbConnection, enableAuditTrail, user) => {
  try {
    if (!user) {
      return user;
    }

    const { userRoles, uuid } = user;

    let role = '';
    if (userRoles && userRoles.length > 0) {
      let roleName = isArray(userRoles) ? userRoles[0] : userRoles;
      role = await findOneItemByQuery(dbConnection, roleCollectionName, {
        name: roleName,
      });
    }

    if (!role) {
      return user;
    }

    let rolePermissions = role.permissions;
    if (!rolePermissions || rolePermissions.length === 0) {
      return user;
    }

    const query = { uuid };
    let dbCollection = await dbConnection.collection(userCollectionName);
    let newValues = { $set: { permissions: rolePermissions } };
    // FINAL: START:Audit Trail
    const collItem = await dbCollection.findOne(query);
    createAuditTrail(
      dbConnection,
      enableAuditTrail,
      'NORMAL',
      'update',
      '',
      userCollectionName,
      { permissions: rolePermissions },
      { permissions: collItem['permissions'] },
    );
    // END:Audit Trail
    let data = await dbCollection.findOneAndUpdate(query, newValues, isNew);

    return data;
  } catch (error) {
    console.error('error', error);
  }
};

export const getUserFromOAuthAccessToken = async (
  builderDB,
  db,
  projectId,
  enableAuditTrail,
  pluginOptions,
  accessToken,
  authUserRole,
  type,
) => {
  const { userInfoUrl, userUniqueField, defaultRole } = pluginOptions;
  if (type === 'SIGNUP' && !authUserRole) {
    let signUpRole = await findOneItemByQuery(db, roleCollectionName, {
      uuid: defaultRole,
    });
    authUserRole = signUpRole ? signUpRole.name : authUserRole;
  }
  const userInfoResponse = await axios.get(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const authUser = userInfoResponse.data;
  const uniqueId = authUser[userUniqueField];
  const authEmail = authUser['email'];
  const query = {
    $or: [{ email: { $regex: `^${authEmail}$`, $options: 'i' } }, { uuid: uniqueId }],
  };
  let user = await findOneItemByQuery(db, userCollectionName, query);
  if (!user) {
    if (type === 'LOGIN')
      return { status: 404, error: { message: `User doesn't exist. Please Sign up First.` } };
    const newUser = {
      email: validateEmail(authEmail) ? authEmail : '',
      userName: authEmail || uniqueId,
      uuid: uniqueId,
      password: chance.string({ length: 10 }),
      userRoles: authUserRole,
    };
    const userResponse = await saveUser(builderDB, db, projectId, enableAuditTrail, newUser);
    user = userResponse.data;
  }
  let role = '';
  if (user.userRoles && user.userRoles.length > 0) {
    role = await findOneItemByQuery(db, roleCollectionName, {
      name: user.userRoles[0],
    });
  }
  let result = { status: 200, accessToken, user, role: role ? role.uuid : '', error: null };
  return result;
};

export const getUserFromFacebookAccessToken = async (
  builderDB,
  db,
  projectId,
  enableAuditTrail,
  pluginOptions,
  accessToken,
  authUserRole,
  type,
) => {
  const { defaultRole } = pluginOptions;
  if (type === 'SIGNUP' && !authUserRole) {
    let signUpRole = await findOneItemByQuery(db, roleCollectionName, {
      uuid: defaultRole,
    });
    authUserRole = signUpRole ? signUpRole.name : authUserRole;
  }

  const userInfoResponse = await axios.get('https://graph.facebook.com/me', {
    params: {
      fields: 'id,name,email',
      access_token: accessToken,
    },
  });

  const authUser = userInfoResponse.data;
  const uniqueId = authUser.id;
  const authEmail = authUser.email;
  const query = {
    $or: [{ email: { $regex: `^${authEmail}$`, $options: 'i' } }, { uuid: uniqueId }],
  };
  let user = await findOneItemByQuery(db, userCollectionName, query);

  if (!user) {
    if (type === 'LOGIN') {
      return { status: 404, error: { message: `User doesn't exist. Please Sign up First.` } };
    }

    const newUser = {
      email: validateEmail(authEmail) ? authEmail : '',
      userName: authEmail,
      uuid: uniqueId,
      password: chance.string({ length: 10 }),
      userRoles: [authUserRole],
    };

    const userResponse = await saveUser(builderDB, db, projectId, enableAuditTrail, newUser);
    user = userResponse.data;
  }

  let role = '';
  if (user.userRoles && user.userRoles.length > 0) {
    role = await findOneItemByQuery(db, roleCollectionName, {
      name: user.userRoles[0],
    });
  }

  let result = { status: 200, accessToken, user, role: role ? role.uuid : '', error: null };
  return result;
};

export const getUserFromTwitterAccessToken = async (
  builderDB,
  db,
  projectId,
  enableAuditTrail,
  pluginOptions,
  profile,
  authUserRole,
  type,
) => {
  const { defaultRole } = pluginOptions;
  if (type === 'SIGNUP' && !authUserRole) {
    let signUpRole = await findOneItemByQuery(db, roleCollectionName, {
      uuid: defaultRole,
    });
    authUserRole = signUpRole ? signUpRole.name : authUserRole;
  }
  const { id, username } = profile;
  const query = { $or: [{ username: username }, { uuid: id }] };
  let user = await findOneItemByQuery(db, userCollectionName, query);

  if (!user) {
    if (type === 'LOGIN') {
      return { status: 404, error: { message: `User doesn't exist. Please Sign up First.` } };
    }

    const newUser = {
      userName: username,
      uuid: id,
      password: chance.string({ length: 10 }),
      userRoles: [authUserRole],
    };

    const userResponse = await saveUser(builderDB, db, projectId, enableAuditTrail, newUser);
    user = userResponse.data;
  }

  let role = '';
  if (user.userRoles && user.userRoles.length > 0) {
    role = await findOneItemByQuery(db, roleCollectionName, {
      name: user.userRoles[0],
    });
  }

  let result = { status: 200, user, role: role ? role.uuid : '', error: null };
  return result;
};

export const encryptUser = async (builderDB, projectId, collection, userData) => {
  let encryptedUser = null;
  if (!userData && Object.keys(userData).length === 0) {
    return userData;
  }
  const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
  if (!enableEncryption || !encryption) {
    return userData;
  }
  const collectionFields = collection ? collection.fields : [];
  encryptedUser = processItemEncryptDecrypt(userData, collectionFields, encryption, false, []);
  return encryptedUser;
};

export const decryptUser = async (builderDB, projectId, user) => {
  const collectionData = await userCollectionService(builderDB, projectId);
  if (collectionData) {
    const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
    if (enableEncryption && encryption) {
      const collectionDataFields = collectionData ? collectionData.fields : [];
      const query = getEncryptedReferenceFieldsQuery(collectionDataFields, projectId);
      const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
      const cryptResponse = await processItemEncryptDecrypt(
        user,
        collectionDataFields,
        encryption,
        true,
        encryptedRefCollections,
      );
      user = cryptResponse;
      console.log('*** Decrypted ~ user:', user);
    }
  }
  return user;
};

export const generateAndSendEmailOtpService = async ({
  db,
  builderDB,
  projectId,
  enableAuditTrail,
  email,
  emailTemplate,
  otpAuthenticationType,
  headers,
  environment,
  tenant,
}) => {
  try {
    const emailOtpAuthenticatorPlugin = await findInstalledPlugin(builderDB, {
      projectId,
      code: 'EMAIL_OTP_AUTHENTICATOR',
    });
    if (!emailOtpAuthenticatorPlugin) {
      return { code: 400, message: 'Email OTP Authenticator Plugin is not Installed.' };
    }
    const awsSESPlugin = await findInstalledPlugin(builderDB, {
      projectId,
      code: 'AWS_SES',
    });
    if (!awsSESPlugin) {
      return { code: 400, message: 'AWS SES Plugin is not Installed.' };
    }
    if (!validateEmail(email)) {
      return { code: 400, message: 'It must be a valid email address.' };
    }
    let authUserRole;
    let user = await findOneItemByQuery(db, userCollectionName, { email: email });
    if (otpAuthenticationType === 'signUp') {
      if (user) {
        return {
          code: 400,
          message: 'User already exists. Please select Login authentication type.',
        };
      }
      const { defaultRole } = emailOtpAuthenticatorPlugin.setting;
      if (!defaultRole) {
        return { code: 400, message: 'Sign Up Role not provided in Plugin.' };
      }
      let signUpRole = await findOneItemByQuery(db, roleCollectionName, {
        uuid: defaultRole,
      });
      if (!signUpRole) {
        return { code: 400, message: 'Sign Up Role not found.' };
      }
      authUserRole = signUpRole.name;
    }
    if (!user) {
      if (otpAuthenticationType === 'login') {
        return { code: 404, message: { message: `User doesn't exist. Please Sign up First.` } };
      }
      const newUser = {
        email: email.trim(),
        uuid: uuidv4(),
        password: chance.string({ length: 10 }),
        userRoles: [authUserRole],
      };
      const userResponse = await saveUser(builderDB, db, projectId, enableAuditTrail, newUser);
      user = userResponse.data;
    }
    const userCollection = await userCollectionService(builderDB, projectId);
    const { otpLength, otpExpiryTime } = emailOtpAuthenticatorPlugin.setting;
    const emailOtp = chance.string({ length: otpLength, pool: '0123456789' });
    const emailOtpExpiry = Date.now() + otpExpiryTime * 1000;
    const emailOtpToken = uuidv4();
    const itemData = { emailOtp, emailOtpExpiry, emailOtpToken };
    const updateResponse = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      userCollection,
      user.uuid,
      itemData,
      {},
      headers,
    );
    if (updateResponse.code !== 200) {
      return { code: 500, message: 'Failed to update user with OTP.' };
    }
    const templateResponse = await findTemplate(builderDB, { uuid: emailTemplate });
    if (!templateResponse) {
      return { code: 404, message: `Template with ID ${emailTemplate} not found.` };
    }
    const templateCollectionName = templateResponse.collectionId;
    if (templateCollectionName !== userCollection.collectionName) {
      return { code: 400, message: `Template Collection should be User Collection only.` };
    }
    const updatedUser = await decryptUser(builderDB, projectId, updateResponse.data);
    const templateCollection = userCollection;
    const emailSubject = replaceFieldsIntoTemplate(
      templateResponse.subject,
      updatedUser,
      user,
      environment,
      templateCollection,
      userCollection,
    );
    const emailBody = replaceFieldsIntoTemplate(
      templateResponse.content,
      updatedUser,
      user,
      environment,
      templateCollection,
      userCollection,
    );
    let { access_key, access_secret, region, from_email, from_name, reply_to, cc_to, bcc_to } =
      awsSESPlugin.setting;
    const config = {
      region: replaceValueFromSource(region, environment, tenant),
      credentials: {
        accessKeyId: replaceValueFromSource(access_key, environment, tenant).trim(),
        secretAccessKey: replaceValueFromSource(access_secret, environment, tenant).trim(),
      },
    };
    let sendEmailResponse = await sendEmailUsingSes(
      config,
      email,
      emailSubject,
      emailBody,
      `${replaceValueFromSource(from_name, environment, tenant)} <${replaceValueFromSource(
        from_email,
        environment,
        tenant,
      )}>`,
      replaceValueFromSource(reply_to, environment, tenant),
      replaceValueFromSource(cc_to, environment, tenant),
      replaceValueFromSource(bcc_to, environment, tenant),
      updatedUser[templateResponse.attachmentField] || [],
      builderDB,
      projectId,
      environment,
    );
    sendEmailResponse.emailOtpToken = updatedUser.emailOtpToken;
    email = Array.isArray(email) ? email : [email];
    cc_to = Array.isArray(cc_to) ? cc_to : [cc_to];
    bcc_to = Array.isArray(bcc_to) ? bcc_to : [bcc_to];
    const data = {
      senderId: updatedUser.uuid,
      sender: updatedUser.userName,
      receiver: email.join(' '),
      bcc: bcc_to.join(' '),
      cc: cc_to.join(' '),
      subject: emailSubject,
      emailSentStatus: sendEmailResponse.status,
      contentLength: emailBody.length,
      errorMessage: sendEmailResponse.error,
    };
    const collectionData = await checkCollectionByName(
      builderDB,
      projectId,
      'aws_ses_activity_tracker',
    );
    if (collectionData) {
      await saveCollectionItem(
        builderDB,
        db,
        projectId,
        enableAuditTrail,
        collectionData,
        data,
        updatedUser,
        headers,
        environment,
      );
    }
    return sendEmailResponse;
  } catch (error) {
    console.error('Error in generateAndSendEmailOtpService:', error);
    throw error;
  }
};

export const verifyEmailOtpAndLoginService = async ({
  db,
  builderDB,
  projectId,
  enableAuditTrail,
  otp,
  emailOtpToken,
  headers,
  environment,
}) => {
  try {
    const userCollection = await userCollectionService(builderDB, projectId);
    if (!userCollection) {
      return { code: 404, message: 'User collection not found' };
    }
    const user = await findOneItemByQuery(db, 'user', { emailOtpToken: emailOtpToken });
    if (!user) {
      return { code: 404, message: 'User not found' };
    }
    const { emailOtp, emailOtpExpiry, uuid } = user;
    if (!emailOtp || emailOtp !== otp || Date.now() > emailOtpExpiry) {
      return { code: 400, message: 'Invalid or expired OTP.' };
    }
    let updatedUser = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      userCollection,
      uuid,
      { emailOtp: '', emailOtpExpiry: '', emailOtpToken: '' },
      {},
      headers,
    );
    let role = '';
    updatedUser = updatedUser.data;
    if (updatedUser.userRoles && updatedUser.userRoles.length > 0) {
      role = await findOneItemByQuery(db, roleCollectionName, {
        name: updatedUser.userRoles[0],
      });
    }
    updatedUser = { ...updatedUser, role: role.uuid };
    if (updatedUser) {
      let userDetails = null;
      let role = updatedUser.role;
      userDetails = updatedUser;
      delete userDetails._id;
      delete userDetails.updatedAt;
      delete userDetails.password;
      const tenantId =
        userDetails.tenantId && userDetails.tenantId.length ? userDetails.tenantId[0] : '';
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);
      if (tenant) {
        const tenantRoleMapping = userDetails.tenantRoleMapping?.find(
          (tenantRole) => tenantRole.tenantId === tenant.uuid,
        );
        const userTenantRoleName = tenantRoleMapping?.role || '';
        if (userTenantRoleName) {
          const userTenantRole = await findOneItemByQuery(db, 'roles', {
            name: userTenantRoleName,
          });
          if (userTenantRole) {
            role = userTenantRole.uuid;
            userDetails.role = userTenantRole.uuid;
            userDetails.userRoles = [userTenantRoleName];
          }
        }
      }
      if (userSetting) {
        const userSettingRoleMapping = userDetails.tenantRoleMapping?.find(
          (userSettingRole) => userSettingRole.userSettingId === userSetting.uuid,
        );
        const userSettingRoleName = userSettingRoleMapping?.role || '';
        if (userSettingRoleName) {
          const userSettingRole = await findOneItemByQuery(db, 'roles', {
            name: userSettingRoleName,
          });
          if (userSettingRole) {
            role = userSettingRole.uuid;
            userDetails.role = userSettingRole.uuid;
            userDetails.userRoles = [userSettingRoleName];
          }
        }
      }
      const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
      const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
      const finalData = {
        auth: true,
        token: tokenObject.token,
        expiresIn: tokenObject.expires,
        userDetails,
        role,
        tenant,
        userSetting,
        projectId,
      };
      return { code: 200, data: finalData, message: 'OTP Verified Successfully' };
    } else {
      return { code: 500, message: 'Error in Clearing OTP from user.' };
    }
  } catch (error) {
    console.error('Error in verifyEmailOtpAndLoginService:', error);
    throw error;
  }
};

export const verifySmsOtpAndLoginService = async ({
  db,
  builderDB,
  projectId,
  enableAuditTrail,
  otp,
  smsOtpToken,
  headers,
  environment,
}) => {
  try {
    const collectionData = await userCollectionService(builderDB, projectId);
    if (!collectionData) {
      return { code: 400, message: 'Collection not found with provided name.' };
    }
    const user = await findOneItemByQuery(db, 'user', { smsOtpToken: smsOtpToken });
    if (!user) {
      return { code: 404, message: 'User not found' };
    }
    const { smsOtp, smsOtpExpiry, uuid } = user;
    if (!smsOtp || smsOtp !== otp || Date.now() > smsOtpExpiry) {
      return { code: 400, message: 'Invalid or expired OTP.' };
    }

    let updatedUser = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionData,
      uuid,
      { smsOtp: '', smsOtpExpiry: '', smsOtpToken: '' },
      {},
      headers,
    );
    let role = '';
    updatedUser = updatedUser.data;
    if (updatedUser.userRoles && updatedUser.userRoles.length > 0) {
      role = await findOneItemByQuery(db, roleCollectionName, {
        name: updatedUser.userRoles[0],
      });
    }
    updatedUser = { ...updatedUser, role: role.uuid };
    if (updatedUser) {
      let userDetails = null;
      let role = updatedUser.role;
      userDetails = updatedUser;
      delete userDetails._id;
      delete userDetails.updatedAt;
      delete userDetails.password;
      const tenantId =
        userDetails.tenantId && userDetails.tenantId.length ? userDetails.tenantId[0] : '';
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);
      if (tenant) {
        const tenantRoleMapping = userDetails.tenantRoleMapping?.find(
          (tenantRole) => tenantRole.tenantId === tenant.uuid,
        );
        const userTenantRoleName = tenantRoleMapping?.role || '';
        if (userTenantRoleName) {
          const userTenantRole = await findOneItemByQuery(db, 'roles', {
            name: userTenantRoleName,
          });
          if (userTenantRole) {
            role = userTenantRole.uuid;
            userDetails.role = userTenantRole.uuid;
            userDetails.userRoles = [userTenantRoleName];
          }
        }
      }
      if (userSetting) {
        const userSettingRoleMapping = userDetails.tenantRoleMapping?.find(
          (userSettingRole) => userSettingRole.userSettingId === userSetting.uuid,
        );
        const userSettingRoleName = userSettingRoleMapping?.role || '';
        if (userSettingRoleName) {
          const userSettingRole = await findOneItemByQuery(db, 'roles', {
            name: userSettingRoleName,
          });
          if (userSettingRole) {
            role = userSettingRole.uuid;
            userDetails.role = userSettingRole.uuid;
            userDetails.userRoles = [userSettingRoleName];
          }
        }
      }
      const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
      const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
      const finalData = {
        auth: true,
        token: tokenObject.token,
        expiresIn: tokenObject.expires,
        userDetails,
        role,
        tenant,
        userSetting,
        projectId,
      };
      return { code: 200, data: finalData, message: 'OTP Verified Successfully' };
    } else {
      return { code: 500, message: 'Error in Clearing OTP from user.' };
    }
  } catch (error) {
    console.error('Error in verifySmsOtpAndLoginService:', error);
    throw error;
  }
};


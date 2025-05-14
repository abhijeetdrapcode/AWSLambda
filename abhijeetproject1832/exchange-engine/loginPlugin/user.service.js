import { pluginCode } from 'drapcode-constant';
import { generateUsername } from 'unique-username-generator';
import {
  checkCollectionByName,
  findCollectionsByQuery,
  findOneService,
} from '../collection/collection.service';
import {
  convertPasswordTypeFields,
  convertSingleItemToList,
  validateItemCollection,
  convertStringDataToObject,
  convertAutoGenerateTypeFields,
  findOneItemByQuery,
  findItemByIdAfterCollection,
  updateItemById,
  saveCollectionItem,
} from '../item/item.service';
import { v4 as uuidv4 } from 'uuid';
import { roleCollectionName, userCollectionName } from './loginUtils';
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
import { getTenantById, getUserSettingById } from '../middleware/tenant.middleware';
import { sendSms } from '../sms/sms.service';
import { awsSnsSendSms } from '../aws-sns/awsSns.service';
const Chance = require('chance');
const chance = new Chance();
const DUMMY_EMAIL_DOMAIN = '@email.com';

export const saveUser = async (
  builderDB,
  dbConnection,
  projectId,
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
    const savedItem = await customInsertOne(dbCollection, userData);
    // eslint-disable-next-line no-prototype-builtins
    if (savedItem) {
      await copyPermissionsInUser(dbConnection, savedItem);
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
  const savedItem = await customInsertOne(dbCollection, userData);
  // eslint-disable-next-line no-prototype-builtins
  if (savedItem) {
    await copyPermissionsInUser(dbConnection, savedItem);
  }

  return {
    code: 201,
    message: 'Item Created Successfully',
    data: savedItem ? savedItem : {},
  };
};

export const saveAnonymousUser = async (builderDB, dbConnection, projectId, userData) => {
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
  const savedItem = await customInsertOne(dbCollection, userData);
  // eslint-disable-next-line no-prototype-builtins
  if (savedItem) {
    await copyPermissionsInUser(dbConnection, savedItem);
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
  tenantId,
  permissions,
) => {
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
          const query = { uuid: tenantId };
          const collectionName = collectionData.collectionName.toString().toLowerCase();
          let dbCollection = await dbConnection.collection(collectionName);

          tenant = await dbCollection.findOne(query);
          const tenantPermission = tenant.permissions || [];

          Object.keys(permissions).forEach((permission) => {
            if (permissions[permission]) {
              if (!tenantPermission.includes(permission)) tenantPermission.push(permission);
            } else {
              _.remove(tenantPermission, (tPermission) => tPermission === permission);
            }
          });

          let newValues = { $set: { permissions: tenantPermission } };
          let data = await dbCollection.findOneAndUpdate(query, newValues, {
            new: true,
          });
          if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
            return { code: 404, message: 'Item not found with provided id', data: {} };
          }
          tenant = await findItemByIdAfterCollection(dbConnection, collectionData, tenantId, null);
          tenant = tenant && tenant.data ? tenant.data : '';
        }
      }
    }
  }
  console.log('tenant permission updated', tenant);
  return tenant;
};
export const updateUserPermissionsService = async (
  builderDB,
  dbConnection,
  projectId,
  userId,
  permissions,
) => {
  let user = null;
  if (userId) {
    const query = { uuid: userId };
    let dbCollection = await dbConnection.collection(userCollectionName);

    user = await dbCollection.findOne(query);
    const userPermissions = user.permissions || [];

    Object.keys(permissions).forEach((permission) => {
      if (permissions[permission]) {
        if (!userPermissions.includes(permission)) userPermissions.push(permission);
      } else {
        _.remove(userPermissions, (tPermission) => tPermission === permission);
      }
    });

    let newValues = { $set: { permissions: userPermissions } };
    let data = await dbCollection.findOneAndUpdate(query, newValues, {
      new: true,
    });
    if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
      return { code: 404, message: 'Item not found with provided id', data: {} };
    }
  }
  console.log('user permission updated ', user);
  return user;
};

export const updateUserSettingsPermissionsService = async (
  builderDB,
  dbConnection,
  projectId,
  userSettingId,
  permissions,
) => {
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
          const query = { uuid: userSettingId };
          const collectionName = collectionData.collectionName.toString().toLowerCase();
          let dbCollection = await dbConnection.collection(collectionName);

          userSetting = await dbCollection.findOne(query);
          const userSettingsPermission = userSetting.permissions || [];

          Object.keys(permissions).forEach((permission) => {
            if (permissions[permission]) {
              if (!userSettingsPermission.includes(permission))
                userSettingsPermission.push(permission);
            } else {
              _.remove(userSettingsPermission, (tPermission) => tPermission === permission);
            }
          });

          let newValues = { $set: { permissions: userSettingsPermission } };
          let data = await dbCollection.findOneAndUpdate(query, newValues, {
            new: true,
          });
          if (!data || (data.lastErrorObject && !data.lastErrorObject.updatedExisting)) {
            return { code: 404, message: 'Item not found with provided id', data: {} };
          }
          userSetting = await findItemByIdAfterCollection(
            dbConnection,
            collectionData,
            userSettingId,
            null,
          );
          userSetting = userSetting && userSetting.data ? userSetting.data : '';
        }
      }
    }
  }
  console.log('user setting permission updated', userSetting);
  return userSetting;
};

export const copyPermissionsInUser = async (dbConnection, user) => {
  try {
    if (!user) {
      return user;
    }
    console.log('copyPermissionsInUser user', user);
    const { userRoles, uuid } = user;
    console.log('copyPermissionsInUser userRoles', userRoles);

    let role = '';
    if (userRoles && userRoles.length > 0) {
      console.log('==> copyPermissionsInUser isArray(userRoles) :>> ', isArray(userRoles));
      let roleName = isArray(userRoles) ? userRoles[0] : userRoles;
      role = await findOneItemByQuery(dbConnection, roleCollectionName, {
        name: roleName,
      });
    }

    console.log('copyPermissionsInUser role', role);
    if (!role) {
      console.log('Since no role details so return');
      return user;
    }
    console.log('We have role permission so return');
    let rolePermissions = role.permissions;
    console.log('copyPermissionsInUser rolePermissions', rolePermissions);
    if (!rolePermissions || rolePermissions.length === 0) {
      return user;
    }

    const query = { uuid };
    let dbCollection = await dbConnection.collection(userCollectionName);
    let newValues = { $set: { permissions: rolePermissions } };
    let data = await dbCollection.findOneAndUpdate(query, newValues, {
      new: true,
    });

    return data;
  } catch (error) {
    console.error('error', error);
  }
};

export const getUserFromOAuthAccessToken = async (
  builderDB,
  db,
  projectId,
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
    const userResponse = await saveUser(builderDB, db, projectId, newUser);
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

    const userResponse = await saveUser(builderDB, db, projectId, newUser);
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

    const userResponse = await saveUser(builderDB, db, projectId, newUser);
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
  const collectionData = await findOneService(builderDB, {
    collectionName: userCollectionName,
    projectId,
  });
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
  email,
  emailTemplate,
  otpAuthenticationType,
  db,
  builderDB,
  projectId,
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
      const userResponse = await saveUser(builderDB, db, projectId, newUser);
      user = userResponse.data;
    }
    const userCollection = await findOneService(builderDB, {
      projectId,
      collectionName: userCollectionName,
    });
    const { otpLength, otpExpiryTime } = emailOtpAuthenticatorPlugin.setting;
    const emailOtp = chance.string({ length: otpLength, pool: '0123456789' });
    const emailOtpExpiry = Date.now() + otpExpiryTime * 1000;
    const emailOtpToken = uuidv4();
    const itemData = { emailOtp, emailOtpExpiry, emailOtpToken };
    const updateResponse = await updateItemById(
      builderDB,
      db,
      projectId,
      userCollectionName,
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
    const { access_key, access_secret, region, from_email, from_name, reply_to, cc_to, bcc_to } =
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
    const data = {
      senderId: updatedUser.uuid,
      sender: updatedUser.userName,
      receiver: email.join(' '),
      bcc: bcc_to.join(' '),
      cc: cc_to.join(' '),
      subject: emailSubject,
      emailSentStatus: sendEmailResponse.status,
      contentLength: emailBody.length,
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
        'aws_ses_activity_tracker',
        collectionData,
        data,
        updatedUser,
        headers,
      );
    }
    return sendEmailResponse;
  } catch (error) {
    console.error('Error in generateAndSendEmailOtpService:', error);
    throw error;
  }
};

export const verifyEmailOtpAndLoginService = async ({
  otp,
  emailOtpToken,
  db,
  builderDB,
  projectId,
  headers,
  environment,
}) => {
  try {
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
      'user',
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
      const userSettingId =
        userDetails.userSettingId && userDetails.userSettingId.length
          ? userDetails.userSettingId[0]
          : '';
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = await getUserSettingById(builderDB, db, projectId, userSettingId);
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

export const generateAndSendSmsOtpService = async ({
  phone_number,
  smsTemplate,
  otpAuthenticationType,
  db,
  builderDB,
  projectId,
  headers,
  environment,
  tenant,
}) => {
  try {
    const smsOtpAuthenticatorPlugin = await findInstalledPlugin(builderDB, {
      projectId,
      code: 'SMS_OTP_AUTHENTICATOR',
    });
    if (!smsOtpAuthenticatorPlugin) {
      return { code: 400, message: 'SMS OTP Authenticator Plugin is not Installed.' };
    }
    const { smsServicePlugin } = smsOtpAuthenticatorPlugin.setting;
    const smsPlugin = await findInstalledPlugin(builderDB, {
      projectId,
      code: smsServicePlugin,
    });
    if (!smsPlugin) {
      return { code: 400, message: `${smsServicePlugin} Plugin is not Installed.` };
    }
    if (!validatePhoneNumber(phone_number)) {
      return { code: 400, message: 'It must be a valid phone number.' };
    }
    let authUserRole;
    let user = await findOneItemByQuery(db, userCollectionName, { phone_number: phone_number });
    if (otpAuthenticationType === 'signUp') {
      if (user) {
        return {
          code: 400,
          message: 'User already exists. Please select Login authentication type.',
        };
      }
      const { defaultRole } = smsOtpAuthenticatorPlugin.setting;
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
        phone_number: phone_number.trim(),
        uuid: uuidv4(),
        password: chance.string({ length: 10 }),
        userRoles: [authUserRole],
      };
      const isNewPhoneSignUp = true;
      const userResponse = await saveUser(builderDB, db, projectId, newUser, isNewPhoneSignUp);
      user = userResponse.data;
    }
    const userCollection = await findOneService(builderDB, {
      projectId,
      collectionName: userCollectionName,
    });
    const { otpLength, otpExpiryTime } = smsOtpAuthenticatorPlugin.setting;
    const smsOtp = chance.string({ length: otpLength, pool: '0123456789' });
    const smsOtpExpiry = Date.now() + otpExpiryTime * 1000;
    const smsOtpToken = uuidv4();
    const itemData = { smsOtp, smsOtpExpiry, smsOtpToken };
    const updateResponse = await updateItemById(
      builderDB,
      db,
      projectId,
      userCollectionName,
      user.uuid,
      itemData,
      {},
      headers,
    );
    if (updateResponse.code !== 200) {
      return { code: 500, message: 'Failed to update user with OTP.' };
    }
    const templateResponse = await findTemplate(builderDB, { uuid: smsTemplate });
    if (!templateResponse) {
      return { code: 404, message: `Template with ID ${smsTemplate} not found.` };
    }
    const templateCollectionName = templateResponse.collectionId;
    if (templateCollectionName !== userCollection.collectionName) {
      return { code: 400, message: `Template Collection should be User Collection only.` };
    }
    const updatedUser = await decryptUser(builderDB, projectId, updateResponse.data);
    const templateCollection = userCollection;
    const smsBody = replaceFieldsIntoTemplate(
      templateResponse.content,
      updatedUser,
      user,
      environment,
      templateCollection,
      userCollection,
    );
    if (smsServicePlugin === 'TWILIO') {
      let { account_SID, auth_token, number } = smsPlugin.setting;
      auth_token = replaceValueFromSource(auth_token, environment, tenant).trim();
      account_SID = replaceValueFromSource(account_SID, environment, tenant).trim();
      number = replaceValueFromSource(number, environment, tenant);
      if (phone_number && !Array.isArray(phone_number)) {
        phone_number = [phone_number];
      }
      let sendTwilioSmsResponse = await sendSms(
        account_SID,
        auth_token,
        number,
        smsBody,
        phone_number,
        updatedUser,
      );
      sendTwilioSmsResponse.smsOtpToken = updatedUser.smsOtpToken;
      await handleSmsActivityTrackers(
        builderDB,
        db,
        projectId,
        headers,
        sendTwilioSmsResponse,
        updatedUser,
        smsBody,
        'twilio_sms_activity_tracker',
      );
      return sendTwilioSmsResponse;
    } else {
      let { accessKeyId, secretAccessKey, region } = smsPlugin.setting;
      accessKeyId = replaceValueFromSource(accessKeyId, environment, tenant).trim();
      secretAccessKey = replaceValueFromSource(secretAccessKey, environment, tenant).trim();
      region = replaceValueFromSource(region, environment, tenant);
      let sendAwsSnsSmsResponse = await awsSnsSendSms(
        accessKeyId,
        secretAccessKey,
        region,
        smsBody,
        phone_number,
        updatedUser,
      );
      sendAwsSnsSmsResponse.smsOtpToken = updatedUser.smsOtpToken;
      await handleSmsActivityTrackers(
        builderDB,
        db,
        projectId,
        headers,
        sendAwsSnsSmsResponse,
        updatedUser,
        smsBody,
        'aws_sns_sms_activity_tracker',
      );
      return sendAwsSnsSmsResponse;
    }
  } catch (error) {
    console.error('Error in generateAndSendSmsOtpService:', error);
    throw error;
  }
};

export const verifySmsOtpAndLoginService = async ({
  otp,
  smsOtpToken,
  db,
  builderDB,
  projectId,
  headers,
  environment,
}) => {
  try {
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
      'user',
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
      const userSettingId =
        userDetails.userSettingId && userDetails.userSettingId.length
          ? userDetails.userSettingId[0]
          : '';
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = await getUserSettingById(builderDB, db, projectId, userSettingId);
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

const validatePhoneNumber = (phoneNumber) => {
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

const handleSmsActivityTrackers = async (
  builderDB,
  db,
  projectId,
  headers,
  response,
  user,
  smsBody,
  trackerCollectionName,
) => {
  const recipients =
    response.message && response.message.length
      ? response.message.map((element) => element.recipient).join(',')
      : '';
  const itemData = {
    senderId: user.uuid,
    sender: user.userName,
    receiver: recipients,
    messageSentStatus: response.status,
    contentLength: smsBody.length,
  };
  const collectionData = await checkCollectionByName(builderDB, projectId, trackerCollectionName);
  if (collectionData) {
    await saveCollectionItem(
      builderDB,
      db,
      projectId,
      trackerCollectionName,
      collectionData,
      itemData,
      user,
      headers,
    );
  }
};

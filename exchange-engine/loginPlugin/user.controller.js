import {
  convertHashPassword,
  compareBcryptPassword,
  userCollectionName,
  roleCollectionName,
} from './loginUtils';
import { findItemById, findOneItemByQuery } from '../item/item.service';
import passport from 'passport';
import { logoutUserToken, issueJWTToken, getTokenExpireTime } from './jwtUtils';
import {
  decryptUser,
  generateAndSendEmailOtpService,
  generateAndSendSmsOtpService,
  getUserFromFacebookAccessToken,
  getUserFromOAuthAccessToken,
  getUserFromTwitterAccessToken,
  saveAnonymousUser,
  saveUserWithProvider,
  updateTenantPermissionsService,
  updateUserPermissionsService,
  updateUserSettingsPermissionsService,
  verifyEmailOtpAndLoginService,
  verifySmsOtpAndLoginService,
} from './user.service';
import { PROVIDER_TYPE } from './authProviderUtil';
import {
  extractFirstTenantIdFromUser,
  extractUserSettingFromUserAndTenant,
  getTenantById,
  getUserSettingById,
} from '../middleware/tenant.middleware';
import { getOAuthOptionsFromPlugin } from './passport';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { userCollectionService } from '../collection/collection.service';
import { isNew } from '../utils/appUtils';

export const addUserWithProvider = async (req, res, next) => {
  try {
    const { db, builderDB, body, projectId, params, environment, enableAuditTrail } = req;
    const { provider } = params;
    const response = await saveUserWithProvider(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      body,
      provider,
      environment,
    );
    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};

export const logoutUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(' ')[1]; // Bearer <token
    await logoutUserToken(token);
    return res.status(200).send({ message: 'successfully logout' });
  } catch (err) {
    next(err);
  }
};

export const addAnonymousUser = async (req, res, next) => {
  try {
    const { db, builderDB, body, projectId, enableAuditTrail } = req;
    const response = await saveAnonymousUser(builderDB, db, projectId, enableAuditTrail, body);
    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  const { db, body } = req;
  try {
    let query = {
      uuid: req.user.uuid,
    };
    const user = await findOneItemByQuery(db, userCollectionName, query);
    if (!user) {
      return res.status(401).json({ message: 'Password reset link is invalid or has expired.' });
    }
    user.password = await convertHashPassword(body.password);
    query = { uuid: user.uuid };

    if (user._id) {
      delete user._id;
    }

    const newValues = { $set: user };
    let dbCollection = await db.collection(userCollectionName);

    await dbCollection.findOneAndUpdate(query, newValues, isNew);
    return res.status(200).send('Password updated successfully');
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  const { db, body } = req;
  try {
    let query = {
      uuid: req.user.uuid,
    };
    const user = await findOneItemByQuery(db, userCollectionName, query);
    if (!user) {
      return res.status(401).json({ message: 'User not found!' });
    }
    const isPassowrdMatched = await compareBcryptPassword(body.oldPassword, user.password);
    if (!isPassowrdMatched) {
      return res.status(401).json({ message: 'Old Password does not match!' });
    }
    user.password = await convertHashPassword(body.password);
    query = { uuid: user.uuid };

    if (user._id) {
      delete user._id;
    }

    const newValues = { $set: user };
    let dbCollection = await db.collection(userCollectionName);
    await dbCollection.findOneAndUpdate(query, newValues, isNew);
    return res.status(200).send('Password updated successfully!');
  } catch (err) {
    next(err);
  }
};

export const loginWithProvider = async (req, res, next) => {
  const { params, projectId, builderDB, db, environment } = req;
  const { provider } = params;
  let authType = '';
  if (provider) {
    authType = 'auth-provider';
  } else {
    authType = 'login';
  }

  passport.authenticate(authType, { session: false }, (err, user, info) => {
    console.log('************************');
    console.log('user loginUser', user, 'err', err, 'info', info);
    if (err) {
      console.error('err loginWithProvider :>> ', err);
      return res.status(err.status).json({ message: err.message });
    }
    let redirectTo = '';
    if (info !== undefined) {
      const { message } = info;
      if (message === 'REDIRECT_TO_REGISTER') {
        redirectTo = 'REGISTER';
      } else if (message === 'REDIRECT_TO_VERIFY') {
        redirectTo = 'VERIFY';
      } else {
        return res.status(info.status || 500).json({ message: info.message });
      }
    }
    if (user) {
      req.login(user, { session: false }, async (err) => {
        console.log('err ************ :>> ', err, user);
        if (err) {
          return res.status(500).json(err);
        }
        console.log('Final Steps after login');
        let finalData = {};
        let userDetails = null;
        let role = user.role;
        if (provider) {
          userDetails = user.user;
        } else {
          userDetails = user;
        }
        console.log('userDetails :>> ', userDetails);
        delete userDetails._id;
        delete userDetails.updatedAt;
        delete userDetails.password;
        userDetails = await decryptUser(builderDB, projectId, userDetails);
        const tenantId = extractFirstTenantIdFromUser(userDetails);
        const tenant = await getTenantById(builderDB, db, projectId, tenantId);
        const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);
        console.log('userSetting at the time of login user.controller.js ln 185', userSetting);
        if (tenant) {
          delete tenant._id;

          if (
            // eslint-disable-next-line no-prototype-builtins
            userDetails.hasOwnProperty('tenantRoleMapping') &&
            userDetails.tenantRoleMapping.length
          ) {
            const tenantRoleMap = userDetails.tenantRoleMapping.find(
              (tenantRole) => tenantRole.tenantId === tenant.uuid,
            );
            console.log(
              '🚀 ~ file: user.controller.js:163 ~ req.login ~ tenantRoleMap:',
              tenantRoleMap,
            );
            const userTenantRoleName = tenantRoleMap ? tenantRoleMap.role : '';
            console.log(
              '🚀 ~ file: user.controller.js:170 ~ req.login ~ userTenantRoleName:',
              userTenantRoleName,
            );

            let userTenantRole = '';
            if (userTenantRoleName) {
              userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
                name: userTenantRoleName,
              });
              console.log(
                '🚀 ~ file: user.controller.js:186 ~ req.login ~ userTenantRole:',
                userTenantRole,
              );
              if (userTenantRole) {
                role = userTenantRole.uuid;
                userDetails.role = userTenantRole.uuid;
                userDetails.userRoles = [userTenantRoleName];
              }
            }

            console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ role:', role);
            console.log(
              '🚀 ~ file: user.controller.js:163 ~ req.login ~ userDetails:',
              userDetails,
            );
          }
        }
        if (userSetting) {
          delete userSetting._id;
          if (
            // eslint-disable-next-line no-prototype-builtins
            userDetails.hasOwnProperty('tenantRoleMapping') &&
            userDetails.tenantRoleMapping.length
          ) {
            const userSettingRoleMap = userDetails.tenantRoleMapping.find(
              (userSettingRole) => userSettingRole.userSettingId === userSetting.uuid,
            );
            console.log(
              '🚀 ~ file: user.controller.js:233 ~ req.login ~ tenantRoleMap:',
              userSettingRoleMap,
            );
            const userTenantRoleName = userSettingRoleMap ? userSettingRoleMap.role : '';
            console.log(
              '🚀 ~ file: user.controller.js:238 ~ req.login ~ userTenantRoleName:',
              userTenantRoleName,
            );
            let userTenantRole = '';
            userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
              name: userTenantRoleName,
            });
            console.log(
              '🚀 ~ file: user.controller.js:248 ~ req.login ~ userTenantRole:',
              userTenantRole,
            );
            if (userTenantRole) {
              role = userTenantRole.uuid;
              userDetails.role = userTenantRole.uuid;
              userDetails.userRoles = [userTenantRoleName];
            }
          }
          console.log('🚀 ~ file: user.controller.js:258 ~ req.login ~ role:', role);
          console.log('🚀 ~ file: user.controller.js:260 ~ req.login ~ userDetails:', userDetails);
        }
        if (provider) {
          if (provider === PROVIDER_TYPE.XANO) {
            finalData = {
              auth: true,
              token: user.token,
              expiresIn: 3600,
              userDetails,
              role,
              tenant,
              userSetting,
              projectId: projectId,
            };
          } else if (provider === PROVIDER_TYPE.BACKENDLESS) {
            finalData = {
              auth: true,
              token: user.token,
              expiresIn: 3600,
              userDetails,
              role,
              tenant,
              userSetting,
              projectId: projectId,
            };
          }
        } else {
          delete user.role;
          finalData = {
            auth: true,
            userDetails,
            role,
            tenant,
            userSetting,
            projectId: projectId,
            redirectTo,
          };

          if (redirectTo !== 'VERIFY') {
            const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
            const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
            finalData.token = tokenObject.token;
            finalData.expiresIn = tokenObject.expires;
          }
        }
        return res.status(200).json(finalData);
      });
    }
  })(req, res, next);
};

export const loginWithTwoFactor = async (req, res) => {
  const { projectId, builderDB, db, body, environment } = req;
  const query = { uuid: body.uuid };
  const userCollection = await userCollectionService(builderDB, projectId);
  let { data: user } = await findItemById(db, builderDB, projectId, userCollection, null, query);

  let role = '';

  if (user.userRoles && user.userRoles.length > 0) {
    role = await findOneItemByQuery(db, roleCollectionName, {
      name: user.userRoles[0],
    });
  }
  if (!role || role.length === 0) {
    //Handle role is not valid
  }
  user = { ...user, role: role.uuid };

  if (user) {
    try {
      let finalData = {};
      let userDetails = null;
      let role = user.role;

      userDetails = user;
      delete userDetails._id;
      delete userDetails.updatedAt;
      delete userDetails.password;
      console.log('userdetails in login with two factor', userDetails);
      const tenantId = extractFirstTenantIdFromUser(userDetails);
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);
      if (tenant) {
        delete tenant._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const tenantRoleMap = userDetails.tenantRoleMapping.find(
            (tenantRole) => tenantRole.tenantId === tenant.uuid,
          );
          console.log('user.controller.js: loginWithTwoFactor:', tenantRoleMap);
          const userTenantRoleName = tenantRoleMap ? tenantRoleMap.role : '';
          console.log('user.controller.js: loginWithTwoFactor:', userTenantRoleName);

          let userTenantRole = '';
          if (userTenantRoleName) {
            userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
              name: userTenantRoleName,
            });
            console.log('user.controller.js: loginWithTwoFactor:', userTenantRole);
            if (userTenantRole) {
              role = userTenantRole.uuid;
              userDetails.role = userTenantRole.uuid;
              userDetails.userRoles = [userTenantRoleName];
            }
          }

          console.log('user.controller.js: loginWithTwoFactor ~ role:', role);
          console.log('user.controller.js: loginWithTwoFactor ~ userDetails:', userDetails);
        }
      }
      console.log('userSetting in loginWithTwoFactor user.controller.js ln 379', userSetting);
      if (userSetting) delete userSetting._id;
      delete user.role;
      const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
      const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
      finalData = {
        auth: true,
        token: tokenObject.token,
        expiresIn: tokenObject.expires,
        userDetails,
        role,
        tenant,
        userSetting,
        projectId: projectId,
      };
      console.log('finalData in user.controller.js ln 394', finalData);
      return res.status(200).json(finalData);
    } catch (error) {
      console.error('error', error);
    }
  } else {
    console.error('No user found');
  }
};

export const loginUserWithExternalAPI = async (req, res, next) => {
  const { projectId, builderDB, db, environment } = req;
  console.log('external-api-login going to check with passport');
  passport.authenticate('external-api-login', { session: false }, (err, user, info) => {
    console.log('user loginUser', JSON.stringify({ user, err, info }));
    if (err) {
      console.error('err :>> ', err);
      return res.status(err.status).json({ message: err.message });
    }
    if (info !== undefined) {
      return res.status(info.status || 500).json({ message: info.message });
    }
    if (user) {
      req.login(user, { session: false }, async (err) => {
        console.log('err ************ :>> ', err, user);
        if (err) {
          return res.status(500).json(err);
        }

        console.log('Final Steps after login');
        let finalData = {};
        let userDetails = user.user;
        let role = user.role;
        console.log('userDetails :>> ', userDetails);
        delete userDetails._id;
        delete userDetails.updatedAt;
        delete userDetails.password;
        delete user.role;
        const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
        const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
        const tenantId = extractFirstTenantIdFromUser(userDetails);
        const tenant = await getTenantById(builderDB, db, projectId, tenantId);
        const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);
        if (tenant) delete tenant._id;
        if (userSetting) delete userSetting._id;
        finalData = {
          auth: true,
          token: tokenObject.token,
          expiresIn: tokenObject.expires,
          userDetails,
          role,
          tenant,
          userSetting,
          projectId: user.projectId,
        };
        console.log('finalData', finalData);
        return res.status(200).json(finalData);
      });
    }
  })(req, res, next);
};

export const loginUserWithToken = async (req, res, next) => {
  const { projectId, builderDB, db, environment } = req;
  passport.authenticate('jwt-login', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json(err);
    }
    if (info !== undefined) {
      return res.status(info.status || 500).json({ message: info.message });
    }
    if (user) {
      req.login(user, { session: false }, async (err) => {
        if (err) {
          return res.status(500).json(err);
        }
        delete user.password;
        delete user.updatedAt;
        delete user._id;
        const role = user.role;
        delete user.role;
        const userDetails = user;
        const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
        const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
        const tenantId = extractFirstTenantIdFromUser(userDetails);
        const tenant = await getTenantById(builderDB, db, projectId, tenantId);
        const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);
        console.log('userSetting at the time of jwt-login user.controller.js ln 481', userSetting);
        if (tenant) delete tenant._id;
        if (userSetting) delete userSetting._id;
        return res.status(200).json({
          auth: true,
          token: tokenObject.token,
          expiresIn: tokenObject.expires,
          userDetails: userDetails,
          role,
          tenant,
          userSetting,
        });
      });
    }
  })(req, res, next);
};

export const getTenantByTenantId = async (req, res) => {
  try {
    const { params, projectId, builderDB, db } = req;
    const { tenantId } = params;
    const tenant = await getTenantById(builderDB, db, projectId, tenantId);
    res.status(200).json(tenant);
  } catch (error) {
    console.error('\n Error:=>', error);
  }
};

export const getUserSettingByUserSettingId = async (req, res) => {
  try {
    const { params, projectId, builderDB, db } = req;
    const { userSettingId } = params;
    const userSetting = await getUserSettingById(builderDB, db, projectId, userSettingId);
    res.status(200).json(userSetting);
  } catch (error) {
    console.log('\n Error:=>', error);
  }
};

export const updateTenantPermission = async (req, res) => {
  const { params, projectId, builderDB, db, body, enableAuditTrail } = req;
  try {
    const tenant = await updateTenantPermissionsService(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      params.tenantId,
      body,
    );
    req.tenant = tenant;
    return res.status(200).json(tenant);
  } catch (error) {
    console.error('\n Error:=>', error);
  }
};

export const updateUserPermission = async (req, res) => {
  const { params, projectId, builderDB, db, body, enableAuditTrail } = req;
  try {
    const user = await updateUserPermissionsService(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      params.userId,
      body,
    );
    return res.status(200).json(user);
  } catch (error) {
    console.error('\n Error:=>', error);
  }
};

export const updateUserSettingsPermission = async (req, res) => {
  const { params, projectId, builderDB, db, body, enableAuditTrail } = req;
  try {
    const user = await updateUserSettingsPermissionsService(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      params.userSettingsId,
      body,
    );
    return res.status(200).json(user);
  } catch (error) {
    console.error('\n Error:=>', error);
  }
};

export const loginUserWithOAuth2 = async (req, res, next) => {
  try {
    const { projectId, builderDB, db, body, environment, enableAuditTrail } = req;
    const { params, accessToken } = body;
    let paramsObj = atob(params);
    paramsObj = JSON.parse(paramsObj);
    const {
      type,
      successRedirectRules,
      role,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
    } = paramsObj;
    const pluginOptions = await getOAuthOptionsFromPlugin(req, res);
    const user = await getUserFromOAuthAccessToken(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      pluginOptions,
      accessToken,
      role,
      type,
    );
    const eventConfig = {
      type,
      role,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
      successRedirectRules,
    };
    if (user.error) return res.status(200).json({ projectId, eventConfig, error: user.error });
    console.log('\n user :>> ', user);
    if (user) {
      let finalData = { oAuthAccessToken: accessToken };
      console.log('Final Steps after login');
      let userDetails = null;
      let role = user.role;
      userDetails = user.user;
      console.log('userDetails :>> ', userDetails);
      delete userDetails._id;
      delete userDetails.updatedAt;
      delete userDetails.password;
      const tenantId = extractFirstTenantIdFromUser(userDetails);
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);

      if (tenant) {
        delete tenant._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const tenantRoleMap = userDetails.tenantRoleMapping.find(
            (tenantRole) => tenantRole.tenantId === tenant.uuid,
          );
          console.log(
            '🚀 ~ file: user.controller.js:163 ~ req.login ~ tenantRoleMap:',
            tenantRoleMap,
          );
          const userTenantRoleName = tenantRoleMap ? tenantRoleMap.role : '';
          console.log(
            '🚀 ~ file: user.controller.js:170 ~ req.login ~ userTenantRoleName:',
            userTenantRoleName,
          );

          let userTenantRole = '';
          if (userTenantRoleName) {
            userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
              name: userTenantRoleName,
            });
            console.log(
              '🚀 ~ file: user.controller.js:186 ~ req.login ~ userTenantRole:',
              userTenantRole,
            );
            if (userTenantRole) {
              role = userTenantRole.uuid;
              userDetails.role = userTenantRole.uuid;
              userDetails.userRoles = [userTenantRoleName];
            }
          }

          console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ role:', role);
          console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ userDetails:', userDetails);
        }
      }
      if (userSetting) {
        delete userSetting._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const userSettingRoleMap = userDetails.tenantRoleMapping.find(
            (userSettingRole) => userSettingRole.userSettingId === userSetting.uuid,
          );
          console.log(
            '🚀 ~ file: user.controller.js:233 ~ req.login ~ tenantRoleMap:',
            userSettingRoleMap,
          );
          const userTenantRoleName = userSettingRoleMap ? userSettingRoleMap.role : '';
          console.log(
            '🚀 ~ file: user.controller.js:238 ~ req.login ~ userTenantRoleName:',
            userTenantRoleName,
          );
          let userTenantRole = '';
          userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
            name: userTenantRoleName,
          });
          console.log(
            '🚀 ~ file: user.controller.js:248 ~ req.login ~ userTenantRole:',
            userTenantRole,
          );
          if (userTenantRole) {
            role = userTenantRole.uuid;
            userDetails.role = userTenantRole.uuid;
            userDetails.userRoles = [userTenantRoleName];
          }
        }
        console.log('🚀 ~ file: user.controller.js:258 ~ req.login ~ role:', role);
        console.log('🚀 ~ file: user.controller.js:260 ~ req.login ~ userDetails:', userDetails);
      }
      delete user.role;
      const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
      const tokenObject = await issueJWTToken(userDetails, tokenExpireTime);
      finalData = {
        ...finalData,
        userDetails,
        role,
        tenant,
        userSetting,
        projectId,
        token: tokenObject.token,
        expiresIn: tokenObject.expires,
        eventConfig,
      };
      return res.status(200).json(finalData);
    }
  } catch (error) {
    console.log('\n error :>> ', error);
    next();
  }
};

export const loginUserWithFacebook = async (req, res, next) => {
  console.log('\n =+loginUserWithFacebook :>> \n');
  try {
    const { projectId, builderDB, db, body, enableAuditTrail } = req;
    const { params, accessToken } = body;
    console.log('params', params);
    let paramsObj = atob(params);
    paramsObj = JSON.parse(paramsObj);
    const {
      type,
      successRedirectRules,
      role,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
    } = paramsObj;
    const facebookLoginPlugin = await findInstalledPlugin(builderDB, {
      projectId,
      code: 'FACEBOOK_LOGIN',
    });
    if (!facebookLoginPlugin) {
      return res.status(400).json({ message: 'Facebook Login Plugin is not Installed.' });
    }
    const user = await getUserFromFacebookAccessToken(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      facebookLoginPlugin.setting,
      accessToken,
      role,
      type,
    );
    const eventConfig = {
      type,
      role,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
      successRedirectRules,
    };
    if (user.error)
      return res.status(user.status).json({ projectId, eventConfig, error: user.error });
    console.log('\n user :>> ', user);
    if (user) {
      let finalData = {};
      console.log('Final Steps after login');
      let userDetails = null;
      let role = user.role;
      userDetails = user.user;
      console.log('userDetails :>> ', userDetails);
      delete userDetails._id;
      delete userDetails.updatedAt;
      delete userDetails.password;
      console.log('\n Before extractFirstTenantIdFromUser \n');
      const tenantId = extractFirstTenantIdFromUser(userDetails);
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);

      if (tenant) {
        delete tenant._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const tenantRoleMap = userDetails.tenantRoleMapping.find(
            (tenantRole) => tenantRole.tenantId === tenant.uuid,
          );
          console.log(
            '🚀 ~ file: user.controller.js:163 ~ req.login ~ tenantRoleMap:',
            tenantRoleMap,
          );
          const userTenantRoleName = tenantRoleMap ? tenantRoleMap.role : '';
          console.log(
            '🚀 ~ file: user.controller.js:170 ~ req.login ~ userTenantRoleName:',
            userTenantRoleName,
          );

          let userTenantRole = '';
          if (userTenantRoleName) {
            userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
              name: userTenantRoleName,
            });
            console.log(
              '🚀 ~ file: user.controller.js:186 ~ req.login ~ userTenantRole:',
              userTenantRole,
            );
            if (userTenantRole) {
              role = userTenantRole.uuid;
              userDetails.role = userTenantRole.uuid;
              userDetails.userRoles = [userTenantRoleName];
            }
          }

          console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ role:', role);
          console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ userDetails:', userDetails);
        }
      }
      if (userSetting) {
        delete userSetting._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const userSettingRoleMap = userDetails.tenantRoleMapping.find(
            (userSettingRole) => userSettingRole.userSettingId === userSetting.uuid,
          );
          console.log(
            '🚀 ~ file: user.controller.js:233 ~ req.login ~ tenantRoleMap:',
            userSettingRoleMap,
          );
          const userTenantRoleName = userSettingRoleMap ? userSettingRoleMap.role : '';
          console.log(
            '🚀 ~ file: user.controller.js:238 ~ req.login ~ userTenantRoleName:',
            userTenantRoleName,
          );
          let userTenantRole = '';
          userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
            name: userTenantRoleName,
          });
          console.log(
            '🚀 ~ file: user.controller.js:248 ~ req.login ~ userTenantRole:',
            userTenantRole,
          );
          if (userTenantRole) {
            role = userTenantRole.uuid;
            userDetails.role = userTenantRole.uuid;
            userDetails.userRoles = [userTenantRoleName];
          }
        }
        console.log('🚀 ~ file: user.controller.js:258 ~ req.login ~ role:', role);
        console.log('🚀 ~ file: user.controller.js:260 ~ req.login ~ userDetails:', userDetails);
      }
      delete user.role;
      console.log('\n Before issueJWTToken \n');
      const tokenObject = issueJWTToken(userDetails);
      finalData = {
        userDetails,
        role,
        tenant,
        userSetting,
        projectId,
        token: tokenObject.token,
        expiresIn: tokenObject.expires,
        eventConfig,
      };
      return res.status(200).json(finalData);
    }
  } catch (error) {
    console.log('\n error :>> ', error);
    next();
  }
};

export const loginUserWithTwitter = async (req, res, next) => {
  console.log('\n =+loginUserWithTwitter :>> \n');
  try {
    const { projectId, builderDB, db, body, enableAuditTrail } = req;
    const { params, profile } = body;
    let paramsObj = atob(params);
    paramsObj = JSON.parse(paramsObj);
    const {
      type,
      successRedirectRules,
      role,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
    } = paramsObj;
    const twitterLoginPlugin = await findInstalledPlugin(builderDB, {
      projectId,
      code: 'TWITTER_LOGIN',
    });
    if (!twitterLoginPlugin) {
      return res.status(400).json({ message: 'Twitter Login Plugin is not Installed.' });
    }
    const user = await getUserFromTwitterAccessToken(
      builderDB,
      db,
      projectId,
      enableAuditTrail,
      twitterLoginPlugin.setting,
      profile,
      role,
      type,
    );
    const eventConfig = {
      type,
      role,
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
      successRedirectRules,
    };
    if (user.error)
      return res.status(user.status).json({ projectId, eventConfig, error: user.error });
    console.log('\n user :>> ', user);
    if (user) {
      let finalData = {};
      console.log('Final Steps after login');
      let userDetails = null;
      let role = user.role;
      userDetails = user.user;
      console.log('userDetails :>> ', userDetails);
      delete userDetails._id;
      delete userDetails.updatedAt;
      delete userDetails.password;
      console.log('\n Before extractFirstTenantIdFromUser \n');
      const tenantId = extractFirstTenantIdFromUser(userDetails);
      const tenant = await getTenantById(builderDB, db, projectId, tenantId);
      const userSetting = extractUserSettingFromUserAndTenant(userDetails, tenant);

      if (tenant) {
        delete tenant._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const tenantRoleMap = userDetails.tenantRoleMapping.find(
            (tenantRole) => tenantRole.tenantId === tenant.uuid,
          );
          console.log(
            '🚀 ~ file: user.controller.js:163 ~ req.login ~ tenantRoleMap:',
            tenantRoleMap,
          );
          const userTenantRoleName = tenantRoleMap ? tenantRoleMap.role : '';
          console.log(
            '🚀 ~ file: user.controller.js:170 ~ req.login ~ userTenantRoleName:',
            userTenantRoleName,
          );

          let userTenantRole = '';
          if (userTenantRoleName) {
            userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
              name: userTenantRoleName,
            });
            console.log(
              '🚀 ~ file: user.controller.js:186 ~ req.login ~ userTenantRole:',
              userTenantRole,
            );
            if (userTenantRole) {
              role = userTenantRole.uuid;
              userDetails.role = userTenantRole.uuid;
              userDetails.userRoles = [userTenantRoleName];
            }
          }

          console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ role:', role);
          console.log('🚀 ~ file: user.controller.js:163 ~ req.login ~ userDetails:', userDetails);
        }
      }
      if (userSetting) {
        delete userSetting._id;
        if (
          // eslint-disable-next-line no-prototype-builtins
          userDetails.hasOwnProperty('tenantRoleMapping') &&
          userDetails.tenantRoleMapping.length
        ) {
          const userSettingRoleMap = userDetails.tenantRoleMapping.find(
            (userSettingRole) => userSettingRole.userSettingId === userSetting.uuid,
          );
          console.log(
            '🚀 ~ file: user.controller.js:233 ~ req.login ~ tenantRoleMap:',
            userSettingRoleMap,
          );
          const userTenantRoleName = userSettingRoleMap ? userSettingRoleMap.role : '';
          console.log(
            '🚀 ~ file: user.controller.js:238 ~ req.login ~ userTenantRoleName:',
            userTenantRoleName,
          );
          let userTenantRole = '';
          userTenantRole = await findOneItemByQuery(db, roleCollectionName, {
            name: userTenantRoleName,
          });
          console.log(
            '🚀 ~ file: user.controller.js:248 ~ req.login ~ userTenantRole:',
            userTenantRole,
          );
          if (userTenantRole) {
            role = userTenantRole.uuid;
            userDetails.role = userTenantRole.uuid;
            userDetails.userRoles = [userTenantRoleName];
          }
        }
        console.log('🚀 ~ file: user.controller.js:258 ~ req.login ~ role:', role);
        console.log('🚀 ~ file: user.controller.js:260 ~ req.login ~ userDetails:', userDetails);
      }
      delete user.role;
      console.log('\n Before issueJWTToken \n');
      const tokenObject = issueJWTToken(userDetails);
      finalData = {
        userDetails,
        role,
        tenant,
        userSetting,
        projectId,
        token: tokenObject.token,
        expiresIn: tokenObject.expires,
        eventConfig,
      };
      return res.status(200).json(finalData);
    }
  } catch (error) {
    console.log('\n error :>> ', error);
    next();
  }
};

export const generateAndSendEmailOTP = async (req, res, next) => {
  try {
    const { body, db, builderDB, projectId, headers, environment, tenant, enableAuditTrail } = req;
    const { email, emailTemplate, otpAuthenticationType } = body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const response = await generateAndSendEmailOtpService({
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
    });
    return res.status(response.code).send(response);
  } catch (error) {
    console.error('Error in generateAndSendEmailOTP:', error);
    next(error);
  }
};

export const verifyEmailOtpAndLogin = async (req, res, next) => {
  try {
    const { body, db, builderDB, projectId, headers, environment, enableAuditTrail } = req;
    const { otp, emailOtpToken } = body;
    const result = await verifyEmailOtpAndLoginService({
      db,
      builderDB,
      projectId,
      enableAuditTrail,
      otp,
      emailOtpToken,
      headers,
      environment,
    });
    return res.status(result.code).send(result);
  } catch (error) {
    console.error('Error during OTP verification and login:', error);
    next(error);
  }
};

export const generateAndSendSmsOTP = async (req, res, next) => {
  try {
    const { body, db, builderDB, projectId, headers, environment, tenant, enableAuditTrail } = req;
    const { phone_number, smsTemplate, otpAuthenticationType } = body;
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone Number is required.' });
    }
    const response = await generateAndSendSmsOtpService({
      db,
      builderDB,
      projectId,
      enableAuditTrail,
      phone_number,
      smsTemplate,
      otpAuthenticationType,
      headers,
      environment,
      tenant,
    });
    return res.status(response.code).send(response);
  } catch (error) {
    console.error('Error in generateAndSendSmsOTP:', error);
    next(error);
  }
};

export const verifySmsOtpAndLogin = async (req, res, next) => {
  try {
    const { body, db, builderDB, projectId, headers, environment, enableAuditTrail } = req;
    const { otp, smsOtpToken } = body;
    const result = await verifySmsOtpAndLoginService({
      db,
      builderDB,
      projectId,
      enableAuditTrail,
      otp,
      smsOtpToken,
      headers,
      environment,
    });
    return res.status(result.code).send(result);
  } catch (error) {
    console.error('Error during OTP verification and login:', error);
    next(error);
  }
};

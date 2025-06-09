import passport from 'passport';
import { pluginCode } from 'drapcode-constant';
import { validateEmail } from 'drapcode-utility';
import { findOneItemByQuery, findItemById } from '../item/item.service';
import {
  compareBcryptPassword,
  convertHashPassword,
  roleCollectionName,
  userCollectionName,
} from './loginUtils';
import { saveUser } from './user.service';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { PROVIDER_TYPE, signInWithBackendless, signInWithXano } from './authProviderUtil';
import { executeExternalApiAndProcess } from '../external-api/external-api.service';
import { replaceValueFromSource } from 'drapcode-utility';
import { isTokenBlacklisted } from './jwtUtils';
import { findOneService } from '../collection/collection.service';
const Chance = require('chance');
const chance = new Chance();
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: 'addjsonwebtokensecretherelikeQuiscustodietipsoscustodesNew',
  algorithms: ['HS256'],
  passReqToCallback: true,
};

const localOptions = {
  usernameField: 'userName',
  passwordField: 'password',
  passReqToCallback: true,
};

const authenticateUser = async (req, userName, password, done) => {
  const { builderDB, db, projectId, body, query: reqQuery } = req;
  const { authType } = reqQuery;

  let emailFieldValue = userName;
  if (body['email']) {
    emailFieldValue = body['email'];
  }
  let phoneNumberValue = userName;
  if (body['phone_number']) {
    phoneNumberValue = body['phone_number'];
    userName = '';
    emailFieldValue = '';
  }
  console.log(`==> authenticateUser emailFieldValue: `, emailFieldValue);
  console.log('==> authenticateUser phoneNumberValue: ', phoneNumberValue);
  let query = {};
  const emailQuery = { email: { $regex: `^${emailFieldValue}$`, $options: 'i' } };
  const usernameQuery = { userName: { $regex: `^${userName}$`, $options: 'i' } };
  const phoneNumberQuery = { phone_number: phoneNumberValue };
  if (body['email']) {
    if (body['queryType'] && body['queryType'] === 'OR') {
      query = { $or: [emailQuery, usernameQuery] };
    } else {
      query = { $and: [emailQuery, usernameQuery] };
    }
  } else if (body['phone_number']) {
    if (body['queryType'] && body['queryType'] === 'OR') {
      query = { $or: [usernameQuery, phoneNumberQuery] };
    } else {
      query = { $and: [usernameQuery, phoneNumberQuery] };
    }
  } else {
    query = { $or: [emailQuery, usernameQuery, phoneNumberQuery] };
  }

  const userCollection = await findOneService(builderDB, {
    projectId,
    collectionName: userCollectionName,
  });
  let { data: user } = await findItemById(db, projectId, userCollection, null, query);
  console.log('user login:>> ', user);
  try {
    if (!user) {
      return done(null, false, {
        message: 'This user does not exists.',
        status: 404,
      });
    }
    const loginPlugin = await findInstalledPlugin(builderDB, {
      code: 'LOGIN',
      projectId,
    });

    if (loginPlugin && loginPlugin.setting) {
      const { is_email_verified, is_enabled } = loginPlugin.setting;
      if (is_email_verified && !user.is_email_verified) {
        return done(null, false, { message: 'Please verify email first.', status: 401 });
      }
      if (is_enabled && !user.is_enabled) {
        return done(null, false, { message: 'Account is not active.', status: 401 });
      }
    }

    const validPassword = await compareBcryptPassword(password, user.password);
    if (!validPassword) {
      return done(null, false, {
        message: 'Username or password does not match. Please try again',
        status: 401,
      });
    }
    console.log('user.userRoles ************** ############', user.userRoles);

    if (authType && authType === 'anonymous') {
      user.password = await convertHashPassword(chance.string({ length: 10 }));
      if (user._id) {
        delete user._id;
      }
      const newValues = { $set: user };
      const result = await db.collection(userCollectionName);
      await result.findOneAndUpdate(query, newValues, { new: true });
    }
    const twoFactorPlugin = await findInstalledPlugin(builderDB, {
      code: 'TWO_FACTOR_AUTHENTICATION',
      projectId,
    });
    let role = '';
    const { is_secret_code_verify } = user;
    let redirectToVerify = false;
    let redirectToRegister = false;
    if (is_secret_code_verify) {
      redirectToVerify = true;
    } else if (twoFactorPlugin && twoFactorPlugin.setting.forceEnable) {
      redirectToRegister = true;
    }

    if (!redirectToVerify) {
      if (user.userRoles && user.userRoles.length > 0) {
        role = await findOneItemByQuery(db, roleCollectionName, {
          name: user.userRoles[0],
        });
      }
      if (!role || role.length === 0) {
        return done(null, false, {
          message: 'The provided role does not exist. Please verify and try again.',
          status: 401,
        });
      }
      if (!redirectToRegister) {
        return done(null, { ...user, role: role.uuid });
      } else {
        return done(
          null,
          { ...user, role: role.uuid },
          { message: 'REDIRECT_TO_REGISTER', status: 403 },
        );
      }
    } else {
      role = 'TWO_FACTOR_VERIFY';
      user.userRoles = [role];
      return done(null, { ...user, role: role }, { message: 'REDIRECT_TO_VERIFY', status: 403 });
    }
  } catch (error) {
    console.error('error passport :>> ', error);
    done(error);
  }
};

const authenticateUserWithProvider = async (req, userName, password, done) => {
  const { builderDB, db, projectId, params, environment } = req;
  const { provider } = params;
  console.log('userName', userName, 'password :>> ', password, 'provider: >>', provider);
  let code = '';
  switch (provider) {
    case PROVIDER_TYPE.XANO:
      code = pluginCode.LOGIN_WITH_XANO;
      break;
    case PROVIDER_TYPE.BACKENDLESS:
      code = pluginCode.LOGIN_WITH_BACKENDLESS;
      break;
    default:
      break;
  }
  const plugin = await findInstalledPlugin(builderDB, {
    code: code,
    projectId,
  });
  if (!plugin) {
    return done({ success: false, status: 401, message: 'No valid provider plugin install' });
  }

  let authResponse = null;
  if (provider === PROVIDER_TYPE.XANO) {
    authResponse = await signInWithXano(environment, plugin.setting, userName, password);
  } else if (provider === PROVIDER_TYPE.BACKENDLESS) {
    authResponse = await signInWithBackendless(environment, plugin.setting, userName, password);
  }

  const { success, data } = authResponse;
  if (!success) {
    return done(authResponse);
  }

  let authEmail = '';
  let uniqueId = '';
  let returnData = {};
  if (provider === PROVIDER_TYPE.XANO) {
    const { authToken, email, id } = data;
    authEmail = email;
    uniqueId = id;
    returnData = {
      token: authToken,
    };
  } else if (provider === PROVIDER_TYPE.BACKENDLESS) {
    const { ownerId, email } = data;
    authEmail = email;
    uniqueId = ownerId;
    returnData = {
      token: data['user-token'],
    };
  }
  const emailQuery = { email: { $regex: `^${authEmail}$`, $options: 'i' } };
  const usernameQuery = { userName: { $regex: `^${authEmail}$`, $options: 'i' } };
  const query = { $or: [emailQuery, usernameQuery] };
  // let query = { $or: [{ email: authEmail }, { userName: authEmail }] };
  try {
    let user = await findOneItemByQuery(db, userCollectionName, query);
    if (!user) {
      const newUser = {
        email: validateEmail(authEmail) ? authEmail : '',
        userName: authEmail,
        uuid: uniqueId,
        password: chance.string({ length: 10 }),
        userRoles: 'User',
      };
      console.log('newUser :>> ', newUser);
      const userResponse = await saveUser(builderDB, db, projectId, newUser);
      user = userResponse.data;
    }
    console.log('user this is what looking', user);
    let role = '';
    if (user.userRoles && user.userRoles.length > 0) {
      role = await findOneItemByQuery(db, roleCollectionName, {
        name: user.userRoles[0],
      });
    }
    return done(null, {
      user,
      ...returnData,
      role: role ? role.uuid : '',
    });
  } catch (error) {
    console.error('error :>> ', error);
    done(error);
  }
};

const authenticateUserWithExternalAPI = async (req, userName, password, done) => {
  console.log('authenticateUserWithExternalAPI', JSON.stringify({ userName, password }));
  const { builderDB, projectId, db, params, body, projectConstants, environment, enableProfiling } =
    req;
  const { collectionItemId } = params;
  try {
    console.log('authenticateUserWithExternalAPI before');
    let authResponse = await executeExternalApiAndProcess(
      builderDB,
      db,
      projectId,
      collectionItemId,
      body,
      projectConstants,
      null,
      null,
      environment,
      enableProfiling,
    );

    console.log('response authenticateUserWithExternalAPI', authResponse);
    const { success, responseData } = authResponse;
    if (!success) {
      return done(authResponse);
    }
    const user = responseData;
    console.log('user this is what looking authenticateUserWithExternalAPI', user);
    let role = '';
    console.log('user.userRoles', user.userRoles);
    if (user.userRoles && user.userRoles.length > 0) {
      role = await findOneItemByQuery(db, roleCollectionName, {
        name: user.userRoles[0],
      });
      console.log('role', role);
    }
    return done(null, {
      user,
      role: role ? role.uuid : '',
      projectId,
    });
  } catch (error) {
    console.error('error authenticateUserWithExternalAPI :>> ', error);
    done(error);
  }
};

const authenticateUserWithToken = async (req, jwt_payload, done) => {
  try {
    const { builderDB, db, projectId } = req;
    const query = { userName: jwt_payload.sub };
    const userCollection = await findOneService(builderDB, {
      projectId,
      collectionName: userCollectionName,
    });
    const { data: user } = await findItemById(db, projectId, userCollection, null, query);
    const loginPlugin = await findInstalledPlugin(builderDB, {
      code: 'LOGIN',
      projectId,
    });
    const { is_email_verified, is_enabled } =
      loginPlugin && loginPlugin.setting ? loginPlugin.setting : {};

    if (user) {
      let role = '';
      if (user.userRoles && user.userRoles.length > 0) {
        role = await findOneItemByQuery(db, roleCollectionName, {
          name: user.userRoles[0],
        });
      }
      if (!role || role.length === 0) {
        return done(null, false, {
          message: 'The provided role does not exist. Please verify and try again.',
          status: 401,
        });
      }
      if (is_email_verified && !user.is_email_verified) {
        return done(null, false, { message: 'Please verify email first.', status: 401 });
      }
      if (is_enabled && !user.is_enabled) {
        return done(null, false, { message: 'Account is not active.', status: 401 });
      }
      return done(null, { ...user, role: role.uuid });
    } else {
      return done(null, false, { message: 'Invalid Token.', status: 404 });
    }
  } catch (error) {
    done(error);
  }
};

const validateJWTToken = async (req, jwt_payload, done) => {
  // Since we are here, the JWT is valid!
  try {
    // Extract token from request
    const token = jwtOptions.jwtFromRequest(req);
    // Check if the token is blacklisted
    const isInvalidToken = await isTokenBlacklisted(token);
    if (isInvalidToken) return done(null, false, { message: 'Token is invalid' });
    //Pass the user details to the next middleware
    return done(null, jwt_payload);
  } catch (error) {
    done(error);
  }
};

/**
 * Strategies
 */
const localStrategy = new LocalStrategy(localOptions, authenticateUser);
const authProviderStrategy = new LocalStrategy(localOptions, authenticateUserWithProvider);
const externalAPIStrategy = new LocalStrategy(localOptions, authenticateUserWithExternalAPI);
const jwtStrategy = new JwtStrategy(
  { ...jwtOptions, passReqToCallback: true },
  authenticateUserWithToken,
);

passport.use('login', localStrategy);
passport.use('auth-provider', authProviderStrategy);
passport.use('external-api-login', externalAPIStrategy);
passport.use('jwt-login', jwtStrategy);
passport.use('jwt', new JwtStrategy(jwtOptions, validateJWTToken));

// OAuth2.0
export const getOAuthOptionsFromPlugin = async (req, res) => {
  const { projectId, builderDB, environment, tenant } = req;
  let pluginOptions = {};
  const oAuth2Plugin = await findInstalledPlugin(builderDB, { projectId, code: 'OAUTH_2' });
  if (!oAuth2Plugin) {
    return res.status(400).json({ message: 'OAuth 2.0 Plugin is not Installed.' });
  }
  if (oAuth2Plugin.setting) {
    let {
      authorizationURL,
      tokenURL,
      clientID,
      clientSecret,
      scope,
      userInfoUrl,
      userUniqueField,
      defaultRole,
    } = oAuth2Plugin.setting;
    authorizationURL = replaceValueFromSource(authorizationURL, environment, tenant);
    authorizationURL = authorizationURL.trim();
    tokenURL = replaceValueFromSource(tokenURL, environment, tenant);
    tokenURL = tokenURL.trim();
    clientID = replaceValueFromSource(clientID, environment, tenant);
    clientID = clientID.trim();
    clientSecret = replaceValueFromSource(clientSecret, environment, tenant);
    clientSecret = clientSecret.trim();
    scope = replaceValueFromSource(scope, environment, tenant);
    scope = scope.trim();
    userInfoUrl = replaceValueFromSource(userInfoUrl, environment, tenant);
    userInfoUrl = userInfoUrl.trim();
    userUniqueField = replaceValueFromSource(userUniqueField, environment, tenant);
    userUniqueField = userUniqueField.trim();
    defaultRole = replaceValueFromSource(defaultRole, environment, tenant);
    defaultRole = defaultRole.trim();
    scope = scope.split(' ');
    pluginOptions = {
      authorizationURL,
      tokenURL,
      clientID,
      clientSecret,
      scope,
      userInfoUrl,
      userUniqueField,
      defaultRole,
    };
  }
  return pluginOptions;
};

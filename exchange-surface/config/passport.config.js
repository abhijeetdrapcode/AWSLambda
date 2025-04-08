import passport from 'passport';
import {
  fetchUserLogin,
  fetchUserLoginWithExternalAPI,
  fetchUserLoginWithToken,
  fetchUserLoginWithOAuth2,
  getOAuth2CallBackURL,
  fetchUserLoginWithFacebook,
  getSocialLoginCallBackURL,
  fetchUserLoginWithTwitter,
} from '../apiService/user.service';
import { findOneInstalledPlugin } from '../install-plugin/installedPlugin.service';
import OAuth2Strategy from 'passport-oauth2';
import { Strategy as TwitterStrategy } from 'passport-twitter';
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const FacebookStrategy = require('passport-facebook').Strategy;
const DocusignStrategy = require('passport-docusign').Strategy;
import { handleDocusign } from '../docusign-plugin/docusign.service';

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: 'addjsonwebtokensecretherelikeQuiscustodietipsoscustodes',
  algorithms: ['HS256'],
  passReqToCallback: true,
};

const localOptions = {
  usernameField: 'userName',
  passwordField: 'password',
  passReqToCallback: true,
};

export const initialize = (passport) => {
  const authenticateUserWithProvider = async (req, userName, password, done) => {
    console.log(`userName ${userName}`);
    const result = await fetchUserLogin(req);

    const { status } = result;
    if (status !== 200 || status !== 200) {
      return done({ error: result.message, status: status }, null, null);
    } else {
      return done(null, result);
    }
  };
  const authenticateUserWithExternalAPI = async (req, userName, password, done) => {
    const result = await fetchUserLoginWithExternalAPI(req);
    console.log('authenticateUserWithExternalAPI result', result);
    const { status } = result;
    if (status !== 200 || status !== 200) {
      return done({ error: result.message, status: status }, null, null);
    } else {
      return done(null, result);
    }
  };
  const authenticateJWTLogin = async (req, jwt_payload, done) => {
    try {
      const result = await fetchUserLoginWithToken(req);
      return done(null, result.data);
    } catch (error) {
      const { response } = error;
      if (response) {
        const { status, data } = response;
        if (status === 404) {
          return done(null, false, { message: 'Invalid token.', status: 404 });
        } else if (status === 401) {
          return done(null, false, {
            message: data && data.message ? data.message : 'Invalid token.',
            status: 401,
          });
        } else if (status === 500) {
          return done(error);
        }
      } else {
        return done(error);
      }
    }
  };

  /**
   * Strategies
   */
  const localStrategy = new LocalStrategy(localOptions, authenticateUserWithProvider);
  const externalAPIStrategy = new LocalStrategy(localOptions, authenticateUserWithExternalAPI);
  const jwtStrategy = new JwtStrategy(jwtOptions, authenticateJWTLogin);

  passport.use('local-login', localStrategy);
  passport.use('external-api-login', externalAPIStrategy);
  passport.use('jwt-login', jwtStrategy);

  passport.serializeUser((user, done) => {
    const userDetailsWithRole = user.userDetails;
    userDetailsWithRole['role'] = user.role;
    userDetailsWithRole['token'] = user.token;
    if (user.hasOwnProperty('userSetting')) {
      console.log('user.userSetting in passport.config.js ln 97', user.userSetting);
      userDetailsWithRole['userSetting'] = user.userSetting;
    }
    if (user.hasOwnProperty('tenant')) {
      userDetailsWithRole['tenant'] = user.tenant;
    }
    console.log('==> Passport userDetailsWithRole', userDetailsWithRole);
    done(null, userDetailsWithRole);
  });
  passport.deserializeUser(async (req, obj, done) => {
    return done(null, obj);
  });
};

// OAuth2.0

export const replaceValueFromSource = (variableName, environment, tenant = {}) => {
  const environmentFixKey = 'environment_variable.';
  const tenantFixKey = 'current_tenant.';
  if (variableName && typeof variableName === 'string') {
    if (variableName.startsWith(environmentFixKey)) {
      return replaceValueFromEnvironment(variableName, environment);
    } else if (variableName.startsWith(tenantFixKey)) {
      return replaceValueFromTenant(variableName, tenant);
    } else {
      return variableName;
    }
  } else {
    return variableName;
  }
};

const getOAuthOptionsFromPlugin = async (req, res) => {
  const { projectId, builderDB, environment } = req;
  let pluginOptions = {};
  const oAuth2Plugin = await findOneInstalledPlugin(builderDB, projectId, 'OAUTH_2');
  if (!oAuth2Plugin) {
    return res.status(4200).json({ message: 'OAuth 2.0 Plugin is not Installed.' });
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
    } = oAuth2Plugin.setting;
    authorizationURL = replaceValueFromSource(authorizationURL, environment);
    authorizationURL = authorizationURL.trim();
    tokenURL = replaceValueFromSource(tokenURL, environment);
    tokenURL = tokenURL.trim();
    clientID = replaceValueFromSource(clientID, environment);
    clientID = clientID.trim();
    clientSecret = replaceValueFromSource(clientSecret, environment);
    clientSecret = clientSecret.trim();
    scope = replaceValueFromSource(scope, environment);
    scope = scope.trim();
    userInfoUrl = replaceValueFromSource(userInfoUrl, environment);
    userInfoUrl = userInfoUrl.trim();
    userUniqueField = replaceValueFromSource(userUniqueField, environment);
    userUniqueField = userUniqueField.trim();
    scope = scope.split(' ');
    let callbackURL = getOAuth2CallBackURL(req);
    pluginOptions = {
      authorizationURL,
      tokenURL,
      clientID,
      clientSecret,
      callbackURL,
      scope,
      userInfoUrl,
      userUniqueField,
    };
    if (!scope.length) delete pluginOptions['scope'];
  }
  return pluginOptions;
};

const authenticateUserWithOAuth2 = async (req, accessToken, done) => {
  try {
    const result = await fetchUserLoginWithOAuth2(req, accessToken);
    const { status } = result;
    if (status !== 200) {
      return done({ error: result.message, status: status, result: result }, null, null);
    } else {
      return done(null, result.data);
    }
  } catch (error) {
    console.log('error :>> ', error);
    return done({ error: error.message, status: 400 }, null, null);
  }
};

const formatUser = (user) => {
  const userDetailsWithRole = user.userDetails;
  userDetailsWithRole['role'] = user.role;
  userDetailsWithRole['token'] = user.token;
  // eslint-disable-next-line no-prototype-builtins
  if (user.hasOwnProperty('userSetting')) {
    userDetailsWithRole['userSetting'] = user.userSetting;
  }
  // eslint-disable-next-line no-prototype-builtins
  if (user.hasOwnProperty('tenant')) {
    userDetailsWithRole['tenant'] = user.tenant;
  }
  return userDetailsWithRole;
};

export const configureOAuthPassport = async (req, res, next) => {
  const pluginOptions = await getOAuthOptionsFromPlugin(req, res);
  const { authorizationURL, tokenURL, clientID, clientSecret, callbackURL, scope } = pluginOptions;
  let oAuthOptions = { authorizationURL, tokenURL, clientID, clientSecret, callbackURL, scope };
  const oAuth2Strategy = new OAuth2Strategy(oAuthOptions, async function (
    accessToken,
    refreshToken,
    profile,
    done,
  ) {
    console.log('\n refreshToken :>> ', refreshToken);
    console.log('\n profile :>> ', profile);
    await authenticateUserWithOAuth2(req, accessToken, done);
  });
  passport.use('oauth2', oAuth2Strategy);
  passport.serializeUser((user, done) => {
    const userDetailsWithRole = formatUser(user);
    done(null, userDetailsWithRole);
  });
  passport.deserializeUser((user, done) => {
    done(null, user);
  });
  next();
};

export const configureFacebookPassport = async (req, res, next) => {
  const { builderDB, projectId } = req;
  const params = req.session.facebookParams || '';
  const facebookPlugin = await findOneInstalledPlugin(builderDB, projectId, 'FACEBOOK_LOGIN');
  if (!facebookPlugin) {
    return res.status(402).json({ message: 'Facebook Login Plugin is not Installed.' });
  }
  const { appID: clientID, appSecret: clientSecret } = facebookPlugin.setting;
  const callbackURL = getSocialLoginCallBackURL(req, 'facebook');
  const facebookOptions = {
    clientID,
    clientSecret,
    callbackURL,
    profileFields: ['id', 'displayName', 'email'],
  };
  const facebookStrategy = new FacebookStrategy(
    facebookOptions,
    async (accessToken, refreshToken, profile, done) => {
      console.log('\n Facebook refreshToken :>> ', refreshToken);
      console.log('\n Facebook profile :>> ', profile);
      await authenticateUserWithFacebook(req, accessToken, refreshToken, profile, done, params);
    },
  );
  passport.use('facebook', facebookStrategy);

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  next();
};

const authenticateUserWithFacebook = async (
  req,
  accessToken,
  refreshToken,
  profile,
  done,
  params,
) => {
  try {
    const result = await fetchUserLoginWithFacebook(
      req,
      accessToken,
      refreshToken,
      profile,
      params,
    );
    const { status } = result;
    if (status !== 200) {
      return done({ error: result.message, status: status, result: result }, null, null);
    } else {
      return done(null, result.data);
    }
  } catch (error) {
    console.log('error :>> ', error);
    return done({ error: error.message, status: 400 }, null, null);
  }
};

export const paramHandling = async (req, res, next) => {
  const { params } = req.query;
  if (params) {
    if (req.path.includes('/auth/facebook')) {
      req.session.facebookParams = params;
    } else if (req.path.includes('/auth/twitter')) {
      req.session.twitterParams = params;
    } else if (req.path.includes('/login-oauth2')) {
      req.session.oAuth2Params = params;
    } else if (req.path.includes('/docusign')) {
      req.session.docusignParams = params;
    }
  }
  next();
};

export const configureTwitterPassport = async (req, res, next) => {
  const { builderDB, projectId } = req;
  const params = req.session.twitterParams || '';
  const twitterPlugin = await findOneInstalledPlugin(builderDB, projectId, 'TWITTER_LOGIN');
  if (!twitterPlugin) {
    return res.status(402).json({ message: 'Twitter Login Plugin is not Installed.' });
  }
  const { consumerKey, consumerSecret } = twitterPlugin.setting;
  const callbackURL = getSocialLoginCallBackURL(req, 'twitter');
  const twitterOptions = {
    consumerKey,
    consumerSecret,
    callbackURL,
    includeEmail: true,
  };
  const twitterStrategy = new TwitterStrategy(
    twitterOptions,
    async (token, tokenSecret, profile, done) => {
      console.log('\n Twitter token :>> ', token);
      console.log('\n Twitter tokenSecret :>> ', tokenSecret);
      console.log('\n Twitter profile :>> ', profile);
      await authenticateUserWithTwitter(req, token, tokenSecret, profile, done, params);
    },
  );

  passport.use('twitter', twitterStrategy);

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  next();
};

const authenticateUserWithTwitter = async (req, token, tokenSecret, profile, done, params) => {
  try {
    const result = await fetchUserLoginWithTwitter(req, token, tokenSecret, profile, params);
    const { status } = result;
    if (status !== 200) {
      return done({ error: result.message, status: status, result: result }, null, null);
    } else {
      return done(null, result.data);
    }
  } catch (error) {
    console.log('error :>> ', error);
    return done({ error: error.message, status: 400 }, null, null);
  }
};

export const configureDocusignPassport = async (req, res, next) => {
  const { builderDB, projectId } = req;
  const params = req.session?.docusignParams || '';
  const docusignPlugin = await findOneInstalledPlugin(builderDB, projectId, 'DOCUSIGN');
  if (!docusignPlugin) {
    return res.status(402).json({ message: 'Docusign Plugin is not Installed.' });
  }
  const { integration_key, secret_key, enviroment } = docusignPlugin.setting;
  let isProduction = false;
  if (enviroment === 'production') {
    isProduction = true;
  }
  console.log({ isProduction });
  const callbackURL = getSocialLoginCallBackURL(req, 'docusign');
  const docusignOptions = {
    clientID: integration_key,
    clientSecret: secret_key,
    callbackURL: callbackURL,
    production: isProduction,
  };
  const docusignStrategy = new DocusignStrategy(docusignOptions, async function (
    accessToken,
    refreshToken,
    profile,
    done,
  ) {
    await handleDocusign(req, accessToken, refreshToken, profile, done, params);
  });

  passport.use('docusign', docusignStrategy);

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  next();
};

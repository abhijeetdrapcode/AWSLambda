import { pluginCode } from 'drapcode-constant';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { findOneItemByQuery } from '../item/item.service';
import { userCollectionName } from './loginUtils';
import { common_set_method, redis_get_method } from 'drapcode-redis';
import { AppError, replaceValueFromSource } from 'drapcode-utility';

const JWT_SECRET_KEY = 'addjsonwebtokensecretherelikeQuiscustodietipsoscustodesNew';
const jwtOptions = {
  expiresIn: '24h',
  algorithm: 'HS256', //default: HS256
};
const BLACKLISTED = 'BLACKLISTED';
export const issueJWTToken = async (userData, tokenExpireTime = '') => {
  try {
    if (userData) {
      const payload = {
        sub: userData.username || userData.userName || userData.email,
        // TODO: Casuing token not to expire
        // iat: Date.now(),
      };
      let newJwtOptions = { ...jwtOptions };
      newJwtOptions.expiresIn = tokenExpireTime ? tokenExpireTime : newJwtOptions.expiresIn;
      const signedToken = jwt.sign(payload, JWT_SECRET_KEY, newJwtOptions);
      console.log('signedToken', signedToken);
      return { token: 'Bearer ' + signedToken, expires: newJwtOptions.expiresIn };
    }
  } catch (error) {
    console.log('\n error :>> ', error);
    return { token: '', expires: '24h' };
  }
};
export const verifyToken = async (jwtToken = '') => {
  try {
    if (jwtToken) {
      if (jwtToken.startsWith('Bearer ')) jwtToken = jwtToken.substring(7, jwtToken.length);
      const isInvalidToken = await isTokenBlacklisted(jwtToken);
      if (isInvalidToken) throw AppError('Token is invalid');
      return jwt.verify(jwtToken, JWT_SECRET_KEY, jwtOptions);
    } else throw AppError('Token is Empty');
  } catch (e) {
    console.error('e: verify token ', e.message);
    return null;
  }
};

export const logoutUserToken = async (jwtToken = '') => {
  try {
    if (jwtToken) {
      if (jwtToken.startsWith('Bearer ')) jwtToken = jwtToken.substring(7, jwtToken.length);
      const decoded = jwt.decode(jwtToken);
      const expiryTime = decoded.exp * 1000 - Date.now();
      common_set_method(jwtToken, BLACKLISTED, expiryTime);
    }
  } catch (e) {
    console.error('e: ====logoutUserToken token ', e);
    return null;
  }
};

export const isTokenBlacklisted = async (token) => {
  const result = await redis_get_method(token);
  return result === BLACKLISTED;
};

export const getTokenExpireTime = async (builderDB, projectId, environment) => {
  const loginPlugin = await findInstalledPlugin(builderDB, {
    code: pluginCode.LOGIN,
    projectId,
  });
  let { userSessionTimeOutInSec } = loginPlugin.setting;
  userSessionTimeOutInSec = replaceValueFromSource(userSessionTimeOutInSec, environment);
  return userSessionTimeOutInSec;
};

export const validateToken = async function (req, res, next) {
  console.log('Validate token middleware');
  const authorizationHeader = req.headers.authorization;
  let result;
  if (authorizationHeader) {
    const token = req.headers.authorization.split(' ')[1]; // Bearer <token>
    try {
      const payload = await verifyToken(token);
      req.user = payload;
      next();
    } catch (err) {
      throw new Error(err);
    }
  } else {
    result = {
      error: `Authentication error. Token required.`,
      status: 401,
    };
    return res.status(401).send(result);
  }
};

export async function verifyJwt(req, res, next) {
  console.log('Verifying JWT Authentication for secure: >> 1');
  if (req.originalUrl.includes('finder')) return next(); // if filter api
  let origin = req.get('origin');
  if (origin && origin.includes('admin')) return next();
  /**
   * Check if login plugin installed or not.
   */
  const { headers, builderDB, db, projectId } = req;
  const loginPlugin = await findInstalledPlugin(builderDB, {
    code: pluginCode.LOGIN,
    projectId,
  });
  if (!loginPlugin) {
    return next();
  }
  console.log('I have installed login plugin: >>2', headers);
  if (!headers.authorization) {
    return res.status(401).send({ code: 401, message: 'No token provided.' });
  }
  passport.authenticate('jwt', { session: false }, async function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      info.code = 403;
      return res.status(403).send(info);
    }
    const userFromDb = await findOneItemByQuery(db, userCollectionName, {
      userName: user.sub,
    });
    if (!userFromDb) {
      return res.status(401).send({ code: 403, message: 'Invalid token.' });
    }
    req.user = userFromDb; // Forward user information to the next middleware
    next();
  })(req, res, next);
}

export async function verifyJwtForOpen(req, res, next) {
  console.log('Verifying JWT Authentication for Open: >> 1');
  const { headers, db } = req;
  const authorizationHeader = headers.authorization;
  if (authorizationHeader) {
    const token = authorizationHeader.split(' ')[1];
    try {
      const payload = await verifyToken(token);
      req.user = payload;
      passport.authenticate('jwt', { session: false }, async function (err, user, info) {
        if (err) {
          return next(err);
        }
        if (!user) {
          info.code = 403;
          return res.status(403).send(info);
        }
        const userFromDb = await findOneItemByQuery(db, userCollectionName, {
          userName: user.sub,
        });
        if (!userFromDb) {
          return res.status(401).send({ code: 403, message: 'Invalid token.' });
        }
        req.user = userFromDb; // Forward user information to the next middleware
        next();
      })(req, res, next);
    } catch (err) {
      console.error('verifyJwtForOpen err', err);
      throw new Error(err);
    }
  } else {
    next();
  }
}

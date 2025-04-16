import axios from 'axios';
import { redis_get_method } from 'drapcode-redis';
import { generateToken } from 'drapcode-utility';
import {
  FACEBOOK_LOGIN_ENDPOINT,
  LOGIN_ENDPOINT,
  LOGIN_ENDPOINT_WITH_TOKEN,
  LOGOUT_ENDPOINT,
  OAUTH_LOGIN_ENDPOINT,
  RESET_PASSWORD_ENDPOINT,
  TWITTER_LOGIN_ENDPOINT,
} from './endpoints';

export const fetchUserLogin = async (req) => {
  const { params, query, body } = req;
  const { provider } = params;
  let { authType } = query;
  let authUrl = getBackendServerUrl(req) + LOGIN_ENDPOINT;
  console.log('=========><<<<<<<<<<<<<<<', authUrl);
  if (provider) {
    authUrl = `${authUrl}/${provider}`;
  }
  if (authType) {
    authUrl = `${authUrl}?authType=${authType}`;
  }
  try {
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchUserLogin: getCookieToken', token);
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const { data } = await axios.post(authUrl, body, reqHeaders);
    return { status: 200, data };
  } catch (error) {
    console.error(error);
    const { status, data } = error ? error.response : {};
    return { status: status, message: data.message };
  }
};

export const fetchUserLoginWithExternalAPI = async (req) => {
  const { params, body } = req;
  const { collectionItemId } = params;
  let authUrl = `${getBackendServerUrl(req)}${LOGIN_ENDPOINT}/otp/external-api`;
  if (collectionItemId) {
    authUrl = `${authUrl}/${collectionItemId}`;
  }
  try {
    console.log('url :>> ', authUrl);
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchUserLoginWithExternalAPI: getCookieToken');
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const { data } = await axios.post(authUrl, body, reqHeaders);
    return { status: 200, data };
  } catch (error) {
    console.error('error :>> ', error);
    const { status, data } = error ? error.response : {};
    return { status: status, message: data.message };
  }
};
export const fetchUserLoginWithFacebook = async (
  req,
  accessToken,
  refreshToken,
  profile,
  params,
) => {
  try {
    const token = await getCookieToken(req);
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const authUrl = getBackendServerUrl(req) + FACEBOOK_LOGIN_ENDPOINT;
    const body = { params, accessToken, refreshToken, profile };
    const { data } = await axios.post(authUrl, body, reqHeaders);
    return { status: 200, data };
  } catch (error) {
    console.error('Error during Facebook login:', error);
    return { status: error.response?.status || 500, data: error.message };
  }
};

export const fetchUserLoginWithTwitter = async (
  req,
  accessToken,
  refreshToken,
  profile,
  params,
) => {
  try {
    const token = await getCookieToken(req);
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const authUrl = getBackendServerUrl(req) + TWITTER_LOGIN_ENDPOINT;
    const body = { params, accessToken, refreshToken, profile };
    const { data } = await axios.post(authUrl, body, reqHeaders);
    return { status: 200, data };
  } catch (error) {
    console.error('Error during Twitter login:', error);
    return { status: error.response?.status || 500, data: error.message };
  }
};

export const fetchUserLoginWithToken = async (req) => {
  const token = await getCookieToken(req);
  console.log('body fetchUserLoginWithToken', req.body);
  console.log('TOKEN_GEN: fetchUserLoginWithToken: getCookieToken');
  const header = {
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${req.body.token}`,
      JSESSIONID: token,
    },
  };
  const url = getBackendServerUrl(req) + LOGIN_ENDPOINT_WITH_TOKEN;
  return axios.post(url, {}, header);
};

export const fetchUserLoginWithOAuth2 = async (req, accessToken) => {
  const { session } = req;
  const oAuth2Params = session.oAuth2Params;
  const authUrl = getBackendServerUrl(req) + OAUTH_LOGIN_ENDPOINT;
  const body = { params: oAuth2Params, accessToken };
  const { data } = await axios.post(authUrl, body);
  return { status: 200, data };
};

export const isValidPasswordResetToken = async (req) => {
  const token = await getCookieToken(req);
  console.log('TOKEN_GEN: isValidPasswordResetToken: getCookieToken', req.params);
  const url = getBackendServerUrl(req) + RESET_PASSWORD_ENDPOINT + req.params.token;
  const reqHeaders = {
    headers: {
      JSESSIONID: token,
    },
  };
  return axios.get(url, reqHeaders);
};

export const getCookieToken = async (req) => {
  const { projectId } = req;
  const uniqueSessionId = `unique_sessionid`;
  const data = await redis_get_method(uniqueSessionId);
  let redisToken;
  if (!data || !data[projectId] || !data[projectId].length) {
    redisToken = await generateToken(projectId, 'surface ui');
    console.log('TOKEN_GEN: createToken');
  } else {
    const tokens = data[projectId];
    redisToken = tokens[tokens.length - 1];
  }

  return redisToken;
};

export const getOAuth2CallBackURL = (req) => {
  const fullUrl = 'https' + '://' + req.get('host') + '/login-oauth2/callback';
  return fullUrl;
};

export const getSocialLoginCallBackURL = (req, socialApp) => {
  const fullUrl = 'https' + '://' + req.get('host') + `/auth/${socialApp}/callback`;
  return fullUrl;
};

export const logoutUserToken = async (req) => {
  const token = await getCookieToken(req);
  console.log('req.user logoutUserToken', req.user);
  const header = {
    headers: {
      'Content-Type': 'application/json',
      authorization: req.user ? req.user.token : '',
      JSESSIONID: token,
    },
  };
  const url = getBackendServerUrl(req) + LOGOUT_ENDPOINT;
  return axios.post(url, {}, header);
};

export const getBackendServerUrl = (req) => {
  const apiDomainName = req.apiDomainName;
  const projectUrl = req.projectUrl;
  const environment = req.environment;
  const hostname = req.hostname;

  console.log('projectUrl', projectUrl);
  console.log('environment', environment);
  console.log('apiDomainName', apiDomainName);
  console.log('hostname', hostname);

  return 'http://abhijeetproject1832.api.prodeless.com:5002/';
  // if (hostname.includes('webconnect.cc')) {
  //   return `https://${projectUrl}.api.${environment ? environment + '.' : ''}webconnect.cc/`;
  // }
  // if (apiDomainName && apiDomainName !== 'undefined' && apiDomainName !== undefined) {
  //   // return `http://amazon2978.api.prodeless.com:5002/`;
  //   return `https://${apiDomainName}/`;
  // } else {
  //   return `https://${projectUrl}.api.${environment ? environment + '.' : ''}webconnect.cc/`;
  // }
};

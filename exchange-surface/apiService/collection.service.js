import axios from 'axios';
import {
  COLLECTION_DETAIL_ENDPOINT,
  COLLECTION_ITEMS_ENDPOINT,
  COLLECTION_TABLE_ITEMS_ENDPOINT,
  EMAIL_OTP_VERIFICATION_ENDPOINT,
  SMS_OTP_VERIFICATION_ENDPOINT,
  TOTP_ENDPOINT,
  TWO_AUTH_ENDPOINT,
} from './endpoints';
import { getBackendServerUrl, getCookieToken } from './user.service';
export const COLLECTION_USER = 'user';
export const COLLECTION_ROLE = 'role';

export const fetchCollectionByName = async (req, res, collectionName) => {
  console.log('**** Going to fetch collection and validation', collectionName);
  try {
    const url = `${getBackendServerUrl(req)}${COLLECTION_DETAIL_ENDPOINT}${collectionName}/name`;
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchCollectionByName: getCookieToken');
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const response = await axios.get(url, reqHeaders);
    const { data, headers } = response;
    const collection = data;
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    if (!collection) {
      return null;
    }

    return collection;
  } catch (error) {
    console.error('error.message collection:>> ', error.message);
    return null;
  }
};

export const validateSnipcartItem = async (db, projectId, collectionId, itemId) => {
  collectionId = collectionId.toString().toLowerCase();
  let result = await db.collection(collectionId).findOne({ uuid: itemId });
  return result;
};

export const fetchMultiTenantCollectionItemsForPage = async (
  req,
  res,
  projectId,
  collectionName,
  pageId,
) => {
  try {
    const regexString = `^${pageId}`;
    const query = { regex: regexString };
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchMultiTenantCollectionItemsForPage: getCookieToken');
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const url = `${getBackendServerUrl(
      req,
    )}${COLLECTION_ITEMS_ENDPOINT}builder/${collectionName}/collection/regex`;
    const response = await axios.post(url, query, reqHeaders);
    const { data, headers } = response;
    const collectionItems = data;
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    if (!collectionItems) {
      return null;
    }
    return collectionItems;
  } catch (error) {
    console.error('error.message collection:>> ', error.message);
    return null;
  }
};

const getHeaderForSeverForSecuredRequest = (req, token) => {
  const { projectId, user } = req;
  if (user && user.token) {
    return {
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': projectId,
        authorization: user.token,
        JSESSIONID: token,
      },
    };
  } else {
    return {
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': projectId,
        JSESSIONID: token,
      },
    };
  }
};

export const fetchCollectionItemDataForPage = async (
  req,
  res,
  collectionName,
  collectionItemId,
  user,
) => {
  try {
    const token = await getCookieToken(req);
    console.log('fetchCollectionItemDataForPage');
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
        authorization: user?.token || '',
      },
    };
    console.log('TOKEN_GEN: fetchCollectionItemDataForPage: getCookieToken');
    const url = `${getBackendServerUrl(
      req,
    )}${COLLECTION_ITEMS_ENDPOINT}${collectionName}/item/${collectionItemId}`;
    const response = await axios.get(url, reqHeaders);
    const { data, headers } = response;
    const collectionItemData = data;
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    if (!collectionItemData) {
      return null;
    }
    return collectionItemData;
  } catch (error) {
    console.error('error.message collection:>> ', error.message);
    return null;
  }
};

export const fetchCollectionFilteredItemDataForPage = async (
  req,
  res,
  collectionName,
  filterId,
  element,
  itemData,
) => {
  try {
    const token = await getCookieToken(req);
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    console.log('TOKEN_GEN: fetchCollectionFilteredItemDataForPage: getCookieToken');
    let url = `${getBackendServerUrl(
      req,
    )}${COLLECTION_TABLE_ITEMS_ENDPOINT}${collectionName}/finder/${filterId}/items/`;
    url = addExternalQueryParamInUrl(url, element, itemData);
    const response = await axios.get(url, reqHeaders);
    const { headers } = response;
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    const filterItemData = response;
    if (!filterItemData) {
      return null;
    }
    return filterItemData;
  } catch (error) {
    console.error('Filter data error.message :>> ', error.message);
    return null;
  }
};

export const addExternalQueryParamInUrl = (endpoint, element, itemData) => {
  const checkItContainsParam = endpoint.includes('?');
  let endpointParam = '';
  if (!checkItContainsParam) {
    endpoint = `${endpoint}?`;
  }
  const attr = element.attributes;
  const externalQueryParam = [];
  for (const key in attr) {
    const el = attr[key];
    if (typeof el === 'object' && el.name.includes('external-params-')) {
      externalQueryParam.push({ [el.name.replace('external-params-', '')]: el.value });
    }
  }
  if (externalQueryParam && externalQueryParam.length > 0) {
    externalQueryParam.forEach((param) => {
      const key = Object.keys(param);
      const paramKey = param[key];
      if (paramKey && itemData) {
        const extParamValue = itemData[paramKey];
        if (extParamValue) {
          endpointParam += `&${key}=${extParamValue}`;
        }
      }
    });
  }
  endpoint = checkItContainsParam
    ? `${endpoint}${endpointParam}`
    : `${endpoint}${endpointParam.substr(1, endpointParam.length + 1)}`;
  return endpoint;
};

export const fetchCollectionItemsForPage = async (req, res, collectionName) => {
  try {
    const token = await getCookieToken(req);
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    console.log('TOKEN_GEN: fetchCollectionItemsForPage: getCookieToken');
    const url = `${getBackendServerUrl(
      req,
    )}${COLLECTION_ITEMS_ENDPOINT}/${collectionName}/collection`;
    const response = await axios.get(url, reqHeaders);
    const { status, data, headers } = response;
    const collectionItems = status === 200 ? data : '';
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    if (!collectionItems) {
      return null;
    }
    return collectionItems;
  } catch (error) {
    console.error('error.message collection:>> ', error.message);
    return null;
  }
};

export const updateUserTOTPData = async (req, res, body) => {
  const backendUrl = getBackendServerUrl(req);
  try {
    //Get token from redis and use it.
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: updateUserTOTPData: getCookieToken');
    const header = getHeaderForSeverForSecuredRequest(req, token);
    const url = `${backendUrl}${TOTP_ENDPOINT}update-user`;
    const { data, headers } = await axios.post(url, body, header);
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    return data;
  } catch (error) {
    console.error('error.message updateUserItemData:>> ', error.message);
    return null;
  }
};
export const resetUserTOTPData = async (req, res) => {
  const backendUrl = getBackendServerUrl(req);
  try {
    const token = await getCookieToken(req);
    const header = getHeaderForSeverForSecuredRequest(req, token);
    console.log('TOKEN_GEN: resetUserTOTPData: getCookieToken');
    const url = `${backendUrl}${TOTP_ENDPOINT}reset-user`;
    const { data, headers } = await axios.post(url, {}, header);
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    return data;
  } catch (error) {
    console.log('error.message updateUserItemData:>> ', error.message);
    return null;
  }
};
export const refreshUserTOTPData = async (req, res, body) => {
  const backendUrl = getBackendServerUrl(req);
  try {
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: refreshUserTOTPData: getCookieToken');
    const header = getHeaderForSeverForSecuredRequest(req, token);
    const url = `${backendUrl}${TWO_AUTH_ENDPOINT}`;
    const { data, headers } = await axios.post(url, body, header);
    console.log('data in refreshUserTOTPData', data);
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    return data;
  } catch (error) {
    console.error('error.message updateUserItemData:>> ', error.message);
    return null;
  }
};

export const fetchEmailOTPUserData = async (req, res, body) => {
  const backendUrl = getBackendServerUrl(req);
  try {
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchEmailOTPUserData: getCookieToken');
    const header = getHeaderForSeverForSecuredRequest(req, token);
    const url = `${backendUrl}${EMAIL_OTP_VERIFICATION_ENDPOINT}`;
    const { data, headers } = await axios.post(url, body, header);
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    return data.data;
  } catch (error) {
    console.error('error.message fetchEmailOTPUserData:>> ', error.message);
    return null;
  }
};

export const fetchSmsOTPUserData = async (req, res, body) => {
  const backendUrl = getBackendServerUrl(req);
  try {
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchSmsOTPUserData: getCookieToken');
    const header = getHeaderForSeverForSecuredRequest(req, token);
    const url = `${backendUrl}${SMS_OTP_VERIFICATION_ENDPOINT}`;
    const { data, headers } = await axios.post(url, body, header);
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    return data.data;
  } catch (error) {
    console.error('error.message fetchSmsOTPUserData:>> ', error.message);
    return null;
  }
};

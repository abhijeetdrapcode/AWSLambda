import axios from 'axios';
import { replaceValueFromSource } from 'drapcode-utility';

export const PROVIDER_TYPE = {
  BACKENDLESS: 'backendless',
  XANO: 'xano',
};

export const signUpWithXano = async (environment, setting, authData) => {
  let { api_url, app_id } = setting;
  api_url = replaceValueFromSource(api_url, environment, null);
  app_id = replaceValueFromSource(app_id, environment, null);

  const url = `${api_url}:${app_id}/auth/signup`;
  try {
    const { data } = await axios.post(url, authData);
    const userRsponse = await checkUserDetailFromXano(environment, setting, data.authToken);
    return { success: true, data: { ...data, ...userRsponse.data } };
  } catch (error) {
    return parseError(error);
  }
};

export const checkUserDetailFromXano = async (environment, setting, token) => {
  let { api_url, app_id } = setting;
  api_url = replaceValueFromSource(api_url, environment, null);
  app_id = replaceValueFromSource(app_id, environment, null);

  const url = `${api_url}:${app_id}/auth/me`;
  try {
    const { data } = await axios.get(url, { headers: { Authorization: token } });
    return { success: true, data };
  } catch (error) {
    return parseError(error);
  }
};

export const signInWithXano = async (environment, setting, username, password) => {
  let { api_url, app_id } = setting;
  api_url = replaceValueFromSource(api_url, environment, null);
  app_id = replaceValueFromSource(app_id, environment, null);

  const url = `${api_url}:${app_id}/auth/login`;
  try {
    const { data } = await axios.post(url, { email: username, password });
    const userRsponse = await checkUserDetailFromXano(setting, data.authToken);
    return { success: true, data: { ...data, ...userRsponse.data } };
  } catch (error) {
    return parseError(error);
  }
};

export const signUpWithBackendless = async (environment, setting, authData) => {
  let { api_url, app_id, rest_api_id } = setting;
  api_url = replaceValueFromSource(api_url, environment, null);
  app_id = replaceValueFromSource(app_id, environment, null);
  rest_api_id = replaceValueFromSource(rest_api_id, environment, null);

  const url = `${api_url}${app_id}/${rest_api_id}/users/register`;
  try {
    const { data } = await axios.post(url, authData);
    return { success: true, data };
  } catch (error) {
    return parseError(error);
  }
};

export const signInWithBackendless = async (environment, setting, username, password) => {
  let { api_url, app_id, rest_api_id } = setting;

  api_url = replaceValueFromSource(api_url, environment, null);
  app_id = replaceValueFromSource(app_id, environment, null);
  rest_api_id = replaceValueFromSource(rest_api_id, environment, null);

  const url = `${api_url}${app_id}/${rest_api_id}/users/login`;
  try {
    const { data } = await axios.post(
      url,
      { login: username, password },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
    return { success: true, data };
  } catch (error) {
    return parseError(error);
  }
};

const parseError = (errorResponse) => {
  if (!errorResponse) {
    return { status: 400, message: 'Error', success: false };
  }
  const { response } = errorResponse;
  if (!response) {
    return { status: 400, message: 'Error', success: false };
  }
  const { data, status } = response;
  if (!data) {
    return { status: status ? status : 400, message: 'Error', success: false };
  }

  const { message, payload } = data;
  let param = '';
  if (payload) {
    param = payload.param;
  }
  return {
    success: false,
    status: status ? status : 400,
    message: `${param !== undefined && param ? `${param} :` : ''}${message}`,
  };
};

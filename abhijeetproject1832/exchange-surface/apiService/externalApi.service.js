import axios from 'axios';
import { EXTERNAL_API_ENDPOINT } from './endpoints';
import { getBackendServerUrl, getCookieToken } from './user.service';

export const fetchExternalApi = async (req, res, externalApiId) => {
  console.log('**** Going to fetch External API :>> ', externalApiId);
  try {
    const token = await getCookieToken(req);
    console.log('TOKEN_GEN: fetchExternalApi: getCookieToken');
    const reqHeaders = {
      headers: {
        JSESSIONID: token,
      },
    };
    const url = `${getBackendServerUrl(req)}${EXTERNAL_API_ENDPOINT}id/${externalApiId}`;
    console.log('**** Going to fetch External API url :>> ', url);
    const response = await axios.get(url, reqHeaders);
    const { data, headers } = response;
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    const collection = data;
    if (!collection) {
      return null;
    }

    return collection;
  } catch (error) {
    console.error('**** error.message External API:>> ', error.message);
    return null;
  }
};

export const sendDataToExternalAPI = async (req, res, data) => {
  console.log('**** Going to send Data to External API :>> ');
  const token = await getCookieToken(req);
  console.log('TOKEN_GEN: sendDataToExternalAPI: getCookieToken');
  const header = {
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': req.projectId,
      JSESSIONID: token,
    },
  };
  try {
    const url = `${getBackendServerUrl(req)}${EXTERNAL_API_ENDPOINT}`;
    console.log('**** Going to send Data to External API url :>> ', url);
    const response = await axios.post(url, data, header);
    const { headers } = response;
    const { jsessionid } = headers;
    res.cookie('JSESSIONID', jsessionid, { maxAge: 1800000 });
    if (!response) {
      return null;
    }
    return response;
  } catch (error) {
    console.error('**** External API error.message :>> ', error.message);
    return null;
  }
};

import axios from 'axios';
import { logger } from 'drapcode-logger';
const BUILDER_ENGINE = process.env.BUILDER_ENGINE;

export const loadProjectFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/projects/${projectId}`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};

export const loadPagesFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/pages/builder/${projectId}/project`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};

export const loadPluginsFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/plugins/`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};

export const loadCollectionsFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/collections/${projectId}/project/all`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};

export const loadDevapisFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/developer-apis/${projectId}/devapis`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};

export const loadSnippetsFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/projects/${projectId}/snippets`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};
export const loadTemplatesFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/projects/${projectId}/templates`;
  const response = await makeGetApiCall(url, projectId);
  return response;
};
export const loadEventsFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/events/all/project`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};
export const loadExternalApisFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/external-api/all/project`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};
export const loadWebhooksFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/webhooks/all/project`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};

export const loadTasksScheduleFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/schedules/`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};

export const loadLocalizationFromBuilder = async (projectId) => {
  const url = `${BUILDER_ENGINE}localization`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};

export const loadCustomComponentsFromBuilder = async (projectId, version) => {
  const url = `${BUILDER_ENGINE}v${version}/custom-component`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};

export const loadCustomDataMappingFromBuilder = async (projectId) => {
  const url = `${BUILDER_ENGINE}custom-data-mapping`;
  const response = await makeGetApiCall(url, projectId);
  if (!response || response === 'undefined') {
    return [];
  }
  return response;
};

const makeGetApiCall = async (url, projectId) => {
  logger.info(`Sending Request to ${url}`);
  const header = {
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': projectId,
    },
  };
  try {
    const response = await axios.get(url, header);
    return response.data;
  } catch (error) {
    console.error('error makeGetApiCall :>> ', error);
    return null;
  }
};

export const makePostApiCall = async (url, body) => {
  const header = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  try {
    const response = await axios.post(url, body, header);
    return response.data;
  } catch (error) {
    console.error('error makePostApiCall :>> ', error);
    return null;
  }
};

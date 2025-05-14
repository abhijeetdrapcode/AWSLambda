import { drapcodeEncryptDecrypt } from 'drapcode-utility';
import {
  loadCollectionsFromBuilder,
  loadEventsFromBuilder,
  // loadDataConnectorsFromBuilder,
  loadExternalApisFromBuilder,
  loadPagesFromBuilder,
  loadPluginsFromBuilder,
  loadProjectFromBuilder,
  loadTemplatesFromBuilder,
  makePostApiCall,
  loadWebhooksFromBuilder,
  loadSnippetsFromBuilder,
  loadLocalizationFromBuilder,
  loadCustomComponentsFromBuilder,
  loadCustomDataMappingFromBuilder,
  loadTasksScheduleFromBuilder,
  loadDevapisFromBuilder,
} from './builder-api';
import { logger } from 'drapcode-logger';
import { createProfilerService, updateProfilerService } from '../profiling/profiler.service';
import { API } from '../utils/enums/ProfilerType';
import { v4 as uuidv4 } from 'uuid';
import { createConnection } from '../config/mongoUtil';
const BUILDER_ENGINE = process.env.BUILDER_ENGINE;
let CONFIG_DB_HOST = process.env.CONFIG_DB_HOST;
let CONFIG_DB_PORT = process.env.CONFIG_DB_PORT;
let CONFIG_DB_USERNAME = process.env.CONFIG_DB_USERNAME;
let CONFIG_DB_PASSWORD = process.env.CONFIG_DB_PASSWORD;

CONFIG_DB_HOST = CONFIG_DB_HOST || 'localhost';
CONFIG_DB_PORT = CONFIG_DB_PORT || 27017;
CONFIG_DB_USERNAME = CONFIG_DB_USERNAME || '';
CONFIG_DB_PASSWORD = CONFIG_DB_PASSWORD || '';

export const findProjectByQuery = async (builderDB, query) => {
  const Project = builderDB.collection('projects');
  let project = await Project.findOne(query);
  if (project) {
    return project;
  }
  logger.info(`query findProjectByQuery :>>  ${query}`);
  console.log('***************');
  console.log('Loading project detail from Builder');
  console.log('***************');
  let projectUrl = `${BUILDER_ENGINE}projects/core/query/exchange`;
  const response = await makePostApiCall(projectUrl, query);
  if (response) {
    await Project.deleteOne({ uuid: response.uuid });
    try {
      await Project.insertOne(response);
      return response;
    } catch (error) {
      console.error('error :>> ', error);
      console.error('Failed to save project in project_detail db');
      return null;
    }
  }
  return response;
};

const removeRecordFromDB = async (builderDB, uuid) => {
  const Project = builderDB.collection('projects');
  await Project.deleteOne({ uuid });
};

export const loadProjectDetail = async (builderDB, projectId, version, subscription) => {
  await clearDataInDB(builderDB, 'projects');
  let projectDetail = await loadProjectFromBuilder(projectId, version);
  if (projectDetail) {
    if (
      !projectDetail.apiDomainName ||
      ['undefined', 'null'].includes(projectDetail.apiDomainName)
    ) {
      projectDetail.apiDomainName = '';
    }
    projectDetail = await processKMSDecryption(projectDetail);
    let projectType = '';
    if (['FREE', 'BUILDER_FREE'].includes(subscription)) {
      projectType = 'FREE';
    }
    projectDetail.projectType = projectType;
    await saveDataInDB(builderDB, 'projects', projectDetail, false);
    const pDetailDB = await createConnection(
      CONFIG_DB_HOST,
      'project_detail',
      CONFIG_DB_PORT,
      CONFIG_DB_USERNAME,
      CONFIG_DB_PASSWORD,
    );
    await removeRecordFromDB(pDetailDB, projectDetail.uuid);
    await saveDataInDB(pDetailDB, 'projects', projectDetail, false);
    pDetailDB.close();
  }
  return projectDetail;
};

const processKMSDecryption = async (projectDetail) => {
  const { encryptions } = projectDetail;
  if (encryptions) {
    for (const encryption of encryptions) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
          encryption.isDataKeyEncrypted = false;
        }
      }
    }
  }
  return projectDetail;
};

export const loadProjectCollection = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'collections');
  const collections = await loadCollectionsFromBuilder(projectId, version);
  if (collections && collections.length > 0) {
    await saveDataInDB(builderDB, 'collections', collections, true);
  }
  return collections;
};

export const loadProjectDevapis = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'devapis');
  const devapis = await loadDevapisFromBuilder(projectId, version);
  if (devapis && devapis.length > 0) {
    await saveDataInDB(builderDB, 'devapis', devapis, true);
  }
  return devapis;
};
export const loadProjectEvents = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'events');
  const events = await loadEventsFromBuilder(projectId, version);
  if (events && events.length > 0) {
    await saveDataInDB(builderDB, 'events', events, true);
    return events;
  }
  return [];
};

export const loadProjectExternalApis = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'externalapis');
  const externalapis = await loadExternalApisFromBuilder(projectId, version);
  if (externalapis && externalapis.length > 0) {
    await saveDataInDB(builderDB, 'externalapis', externalapis, true);
    return externalapis;
  }
  return [];
};
export const loadProjectWebhooks = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'webhooks');
  const webhooks = await loadWebhooksFromBuilder(projectId, version);
  if (webhooks && webhooks.length > 0) {
    await saveDataInDB(builderDB, 'webhooks', webhooks, true);
    return webhooks;
  }
  return [];
};
export const loadProjectPages = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'pages');
  const pages = await loadPagesFromBuilder(projectId, version);
  if (pages && pages.length > 0) {
    await saveDataInDB(builderDB, 'pages', pages, true);
  }
  return pages;
};

export const loadLocalizations = async (builderDB, projectId) => {
  await clearDataInDB(builderDB, 'localization');
  const localizations = await loadLocalizationFromBuilder(projectId);
  if (localizations && localizations.length > 0) {
    await saveDataInDB(builderDB, 'localization', localizations, true);
  }
  return localizations;
};

export const loadCustomComponents = async (builderDB, projectId, version) => {
  try {
    await clearDataInDB(builderDB, 'customcomponents');
    const customComponents = await loadCustomComponentsFromBuilder(projectId, version);
    if (customComponents && customComponents.length > 0) {
      await saveDataInDB(builderDB, 'customcomponents', customComponents, true);
    }
    return customComponents;
  } catch (error) {
    console.log('\n error :>> ', error);
  }
};

export const loadCustomDataMapping = async (builderDB, projectId) => {
  try {
    await clearDataInDB(builderDB, 'customdatamappings');
    const customDataMapping = await loadCustomDataMappingFromBuilder(projectId);
    if (customDataMapping && customDataMapping.length > 0) {
      await saveDataInDB(builderDB, 'customdatamappings', customDataMapping, true);
    }
    return customDataMapping;
  } catch (error) {
    console.error('\n error :>> ', error);
  }
};

export const loadTaskScheduling = async (builderDB, projectId, version) => {
  try {
    await clearDataInDB(builderDB, 'tasks');
    let tasks = await loadTasksScheduleFromBuilder(projectId, version);
    tasks = tasks.schedules;
    if (tasks && tasks.length > 0) {
      await saveDataInDB(builderDB, 'tasks', tasks, true);
    }
  } catch (error) {
    console.error('\n error :>> ', error);
  }
};

export const loadProjectPlugins = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'plugins');
  const plugins = await loadPluginsFromBuilder(projectId, version);
  if (plugins && plugins.length > 0) {
    await saveDataInDB(builderDB, 'plugins', plugins, true);
  }
  return plugins;
};
export const loadProjectTemplates = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'templates');
  const templates = await loadTemplatesFromBuilder(projectId, version);
  if (templates && templates.length > 0) {
    await saveDataInDB(builderDB, 'templates', templates, true);
  }
  return templates;
};
export const loadProjectSnippets = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'snippets');
  const snippets = await loadSnippetsFromBuilder(projectId, version);
  if (snippets && snippets.length > 0) {
    await saveDataInDB(builderDB, 'snippets', snippets, true);
  }
  return snippets;
};
const saveDataInDB = async (builderDB, collectionName, data, isMany) => {
  try {
    const collection = builderDB.collection(collectionName);
    if (isMany) {
      await collection.insertMany(data);
    } else {
      await collection.insertOne(data);
    }
  } catch (error) {
    console.error('error saveDataInDB :>> ', error);
  }
};
const clearDataInDB = async (builderDB, collectionName) => {
  try {
    const collection = await builderDB.collection(collectionName);
    await collection.drop();
  } catch (error) {
    logger.error(`error clearDataInDB :>> ${error}`, { label: collectionName });
  }
};
export const projectDetail = async (req, res, next) => {
  const apiEnterUuid = uuidv4();
  try {
    createProfilerService(
      req.db,
      req.projectId,
      req.enableProfiling,
      apiEnterUuid,
      API,
      `PROJECT -> projectDetail`,
    );
    const query = { uuid: req.projectId };
    const response = await findProjectByQuery(req.builderDB, query);
    updateProfilerService(req.db, req.projectId, req.enableProfiling, apiEnterUuid);
    res.status(200).send(response);
  } catch (e) {
    next(e);
  }
};

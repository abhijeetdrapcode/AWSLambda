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
import { PROJECT_COLLECTIONS, PROJECT_DETAIL } from 'drapcode-constant';
import {
  getExchangeRedisKey,
  PROJECT_CUSTOM_COMPONENTS,
  PROJECT_CUSTOM_DATA_MAPPINGS,
  PROJECT_EVENTS,
  PROJECT_EXTERNAL_APIS,
  PROJECT_LOCALIZATIONS,
  PROJECT_PLUGINS,
  PROJECT_SNIPPETS,
  PROJECT_TEMPLATES,
} from './build-utils';
import { common_clear_method, common_set_method, redis_get_method } from 'drapcode-redis';
const BUILDER_ENGINE = process.env.BUILDER_ENGINE;
let CONFIG_DB_HOST = process.env.CONFIG_DB_HOST;
let CONFIG_DB_USERNAME = process.env.CONFIG_DB_USERNAME;
let CONFIG_DB_PASSWORD = process.env.CONFIG_DB_PASSWORD;

CONFIG_DB_HOST = CONFIG_DB_HOST || 'localhost';
CONFIG_DB_USERNAME = CONFIG_DB_USERNAME || '';
CONFIG_DB_PASSWORD = CONFIG_DB_PASSWORD || '';

const checkAndExtractKeys = (query) => {
  if (query && query['$or'] && Array.isArray(query['$or'])) {
    const extractedKeys = {
      domainName: '',
      seoName: '',
    };

    query['$or'].forEach((condition) => {
      if (condition.domainName) {
        extractedKeys.domainName = condition.domainName;
      }
      if (condition.seoName) {
        extractedKeys.seoName = condition.seoName;
      }
    });

    return extractedKeys;
  } else {
    console.log("The query does not contain a valid '$or' key.");
    return null;
  }
};

export const findProjectByQuery = async (builderDB, query) => {
  if (query && query['$or'] && query['$or'].length > 0) {
    const queryKeys = checkAndExtractKeys(query);
    // Fetch project based on seoName field
    if (queryKeys && queryKeys.seoName) {
      const REDIS_KEY_PROJECT_DETAIL = getExchangeRedisKey(queryKeys.seoName, PROJECT_DETAIL);
      const redisProject = (await redis_get_method(REDIS_KEY_PROJECT_DETAIL)) || null;
      if (redisProject) {
        console.log(`*** Found in redis! Returning project with seoName: ${queryKeys.seoName}`);
        return redisProject;
      }
    }
  } else {
    console.log(
      '*** Not found in redis! The query does not contain a valid "$or" key. Checking for "uuid" key in redis...',
    );
  }
  if (query && query.uuid) {
    const REDIS_KEY_PROJECT_DETAIL = getExchangeRedisKey(query.uuid, PROJECT_DETAIL);
    const redisProject = (await redis_get_method(REDIS_KEY_PROJECT_DETAIL)) || null;
    if (redisProject) {
      console.log(`*** Found in redis! Returning project with ID: ${query.uuid}`);
      return redisProject;
    }
  } else {
    console.log(
      '*** Not found in redis! The query does not contain a valid "uuid" key. Checking in the DB...',
    );
  }
  const Project = builderDB.collection('projects');
  let project = await Project.findOne(query);
  if (project) {
    console.log(`*** Found in Exchange DB! Returning project: ${project.uuid}`);
    const REDIS_KEY_PROJECT_DETAIL = getExchangeRedisKey(project.uuid, PROJECT_DETAIL);
    const REDIS_KEY_PROJECT_DETAIL_SEONAME = getExchangeRedisKey(project.seoName, PROJECT_DETAIL);
    common_clear_method(REDIS_KEY_PROJECT_DETAIL);
    common_clear_method(REDIS_KEY_PROJECT_DETAIL_SEONAME);
    common_set_method(REDIS_KEY_PROJECT_DETAIL, project);
    common_set_method(REDIS_KEY_PROJECT_DETAIL_SEONAME, project);
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
      const REDIS_KEY_PROJECT_DETAIL = getExchangeRedisKey(response.uuid, PROJECT_DETAIL);
      common_clear_method(REDIS_KEY_PROJECT_DETAIL);
      common_set_method(REDIS_KEY_PROJECT_DETAIL, response);
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
  const REDIS_KEY_PROJECT_DETAIL = getExchangeRedisKey(projectId, PROJECT_DETAIL);
  common_clear_method(REDIS_KEY_PROJECT_DETAIL);
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
      CONFIG_DB_USERNAME,
      CONFIG_DB_PASSWORD,
    );
    await removeRecordFromDB(pDetailDB, projectDetail.uuid);
    await saveDataInDB(pDetailDB, 'projects', projectDetail, false);
    pDetailDB.close();
    const REDIS_KEY_PROJECT_DETAIL_SEONAME = getExchangeRedisKey(
      projectDetail.seoName,
      PROJECT_DETAIL,
    );
    common_clear_method(REDIS_KEY_PROJECT_DETAIL_SEONAME);
    common_set_method(REDIS_KEY_PROJECT_DETAIL, projectDetail);
    common_set_method(REDIS_KEY_PROJECT_DETAIL_SEONAME, projectDetail);
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
  const REDIS_KEY_PROJECT_COLLECTIONS = getExchangeRedisKey(projectId, PROJECT_COLLECTIONS);
  common_clear_method(REDIS_KEY_PROJECT_COLLECTIONS);
  const collections = await loadCollectionsFromBuilder(projectId, version);
  if (collections && collections.length > 0) {
    await saveDataInDB(builderDB, 'collections', collections, true);
  }
  common_set_method(REDIS_KEY_PROJECT_COLLECTIONS, collections);
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
  const REDIS_KEY_PROJECT_EVENTS = getExchangeRedisKey(projectId, PROJECT_EVENTS);
  common_clear_method(REDIS_KEY_PROJECT_EVENTS);
  const events = await loadEventsFromBuilder(projectId, version);
  if (events && events.length > 0) {
    await saveDataInDB(builderDB, 'events', events, true);
    common_set_method(REDIS_KEY_PROJECT_EVENTS, events);
    return events;
  }
  return [];
};

export const loadProjectExternalApis = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'externalapis');
  const REDIS_KEY_PROJECT_EXTERNAL_APIS = getExchangeRedisKey(projectId, PROJECT_EXTERNAL_APIS);
  common_clear_method(REDIS_KEY_PROJECT_EXTERNAL_APIS);
  const externalapis = await loadExternalApisFromBuilder(projectId, version);
  if (externalapis && externalapis.length > 0) {
    await saveDataInDB(builderDB, 'externalapis', externalapis, true);
    common_set_method(REDIS_KEY_PROJECT_EXTERNAL_APIS, externalapis);
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
  const REDIS_KEY_PROJECT_LOCALIZATIONS = getExchangeRedisKey(projectId, PROJECT_LOCALIZATIONS);
  common_clear_method(REDIS_KEY_PROJECT_LOCALIZATIONS);
  const localizations = await loadLocalizationFromBuilder(projectId);
  if (localizations && localizations.length > 0) {
    await saveDataInDB(builderDB, 'localization', localizations, true);
    common_set_method(REDIS_KEY_PROJECT_LOCALIZATIONS, localizations);
  }
  return localizations;
};

export const loadCustomComponents = async (builderDB, projectId, version) => {
  try {
    await clearDataInDB(builderDB, 'customcomponents');
    const REDIS_KEY_PROJECT_CUSTOM_COMPONENTS = getExchangeRedisKey(
      projectId,
      PROJECT_CUSTOM_COMPONENTS,
    );
    common_clear_method(REDIS_KEY_PROJECT_CUSTOM_COMPONENTS);
    const customComponents = await loadCustomComponentsFromBuilder(projectId, version);
    if (customComponents && customComponents.length > 0) {
      await saveDataInDB(builderDB, 'customcomponents', customComponents, true);
      common_set_method(REDIS_KEY_PROJECT_CUSTOM_COMPONENTS, customComponents);
    }
    return customComponents;
  } catch (error) {
    console.log('\n error :>> ', error);
  }
};

export const loadCustomDataMapping = async (builderDB, projectId) => {
  try {
    await clearDataInDB(builderDB, 'customdatamappings');
    const REDIS_KEY_PROJECT_CUSTOM_DATA_MAPPINGS = getExchangeRedisKey(
      projectId,
      PROJECT_CUSTOM_DATA_MAPPINGS,
    );
    common_clear_method(REDIS_KEY_PROJECT_CUSTOM_DATA_MAPPINGS);
    const customDataMapping = await loadCustomDataMappingFromBuilder(projectId);
    if (customDataMapping && customDataMapping.length > 0) {
      await saveDataInDB(builderDB, 'customdatamappings', customDataMapping, true);
      common_set_method(REDIS_KEY_PROJECT_CUSTOM_DATA_MAPPINGS, customDataMapping);
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
  const REDIS_KEY_PROJECT_PLUGINS = getExchangeRedisKey(projectId, PROJECT_PLUGINS);
  common_clear_method(REDIS_KEY_PROJECT_PLUGINS);
  const plugins = await loadPluginsFromBuilder(projectId, version);
  if (plugins && plugins.length > 0) {
    await saveDataInDB(builderDB, 'plugins', plugins, true);
    common_set_method(REDIS_KEY_PROJECT_PLUGINS, plugins);
  }
  return plugins;
};
export const loadProjectTemplates = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'templates');
  const REDIS_KEY_PROJECT_TEMPLATES = getExchangeRedisKey(projectId, PROJECT_TEMPLATES);
  common_clear_method(REDIS_KEY_PROJECT_TEMPLATES);
  const templates = await loadTemplatesFromBuilder(projectId, version);
  if (templates && templates.length > 0) {
    await saveDataInDB(builderDB, 'templates', templates, true);
    common_set_method(REDIS_KEY_PROJECT_TEMPLATES, templates);
  }
  return templates;
};
export const loadProjectSnippets = async (builderDB, projectId, version) => {
  await clearDataInDB(builderDB, 'snippets');
  const REDIS_KEY_PROJECT_SNIPPETS = getExchangeRedisKey(projectId, PROJECT_SNIPPETS);
  common_clear_method(REDIS_KEY_PROJECT_SNIPPETS);
  const snippets = await loadSnippetsFromBuilder(projectId, version);
  if (snippets && snippets.length > 0) {
    await saveDataInDB(builderDB, 'snippets', snippets, true);
    common_set_method(REDIS_KEY_PROJECT_SNIPPETS, snippets);
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

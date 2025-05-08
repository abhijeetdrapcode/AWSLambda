import { prepareCollectionQuery } from 'drapcode-utility';
import { userCollectionName } from '../loginPlugin/loginUtils';
import { loadMultiTenantSetting } from '../install-plugin/installedPlugin.service';
export const findOneService = async (builderDB, query) => {
  const Collection = builderDB.collection('collections');
  const result = await Collection.findOne(query);
  return result;
};

export const findAllService = async (builderDB, query) => {
  const Collection = builderDB.collection('collections');
  const result = await Collection.find(query).toArray();
  return result;
};

export const checkCollectionByName = async (builderDB, projectId, collectionName, id = null) => {
  let result = await findOneService(builderDB, { collectionName, projectId });
  if (id) {
    if (!result) return { code: 404, message: 'Collection not found with provided name' };
    return { code: 200, message: 'success', data: result };
  }
  return result;
};

//Refactor this after project version merge
export const findCollectionByUuid = async (builderDB, projectId, collectionUuid, filterId) => {
  let matchQuery = { uuid: collectionUuid, projectId };
  let query = prepareCollectionQuery(matchQuery, filterId);
  let result = await builderDB.collection('collections').aggregate(query).toArray();
  return result;
};

export const findCollection = async (builderDB, projectId, collectionName, filterId) => {
  let matchQuery = { collectionName, projectId };
  let query = prepareCollectionQuery(matchQuery, filterId);
  let result = await builderDB.collection('collections').aggregate(query).toArray();
  return result;
};

export const findFieldDetailsFromCollection = async (
  builderDB,
  projectId,
  collectionName,
  fieldId,
) => {
  const collection = await findOneService(builderDB, {
    collectionName,
    projectId,
  });
  const field = collection.fields.find((field) => field.fieldName === fieldId);
  return field.validation;
};

export const findCollectionsByQuery = async (builderDB, query) => {
  return await builderDB.collection('collections').aggregate(query).toArray();
};

export const userCollectionService = async (builderDB, projectId) => {
  const userCollection = await findOneService(builderDB, {
    projectId,
    collectionName: userCollectionName,
  });
  return userCollection;
};

export const multiTenantCollService = async (builderDB, projectId) => {
  const multiTenantPlugin = await loadMultiTenantSetting(builderDB, projectId);
  if (!multiTenantPlugin) {
    return null;
  }
  const { multiTenantCollection } = multiTenantPlugin.setting;
  if (!multiTenantCollection) {
    return null;
  }
  const collection = await findOneService(builderDB, {
    uuid: multiTenantCollection,
    projectId,
  });
  return collection;
};

export const userSettingCollService = async (builderDB, projectId) => {
  const multiTenantPlugin = await loadMultiTenantSetting(builderDB, projectId);
  if (!multiTenantPlugin) {
    return null;
  }
  const { userSettingsCollection } = multiTenantPlugin.setting;
  if (!userSettingsCollection) {
    return null;
  }
  const collection = await findOneService(builderDB, {
    uuid: userSettingsCollection,
    projectId,
  });
  return collection;
};

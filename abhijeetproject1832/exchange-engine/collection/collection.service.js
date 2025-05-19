import { prepareCollectionQuery } from 'drapcode-utility';
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

export const updateProjectCollection = async (builderDB, query, record) => {
  return await builderDB.collection('collections').findOneAndUpdate(query, { $set: record });
};

export const findCollectionsByQuery = async (builderDB, query) => {
  return await builderDB.collection('collections').aggregate(query).toArray();
};

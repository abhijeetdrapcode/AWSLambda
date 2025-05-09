import {
  initializeTypesenseCollectionService,
  reindexAllDataService,
  deleteTypesenseCollectionService,
  searchTypesenseCollectionService,
  getAllTypesenseIndexedDataService,
} from './typesenseSearch.service';

export const initializeTypesenseCollection = async (req, res, next) => {
  try {
    const { body, builderDB, projectId, environment } = req;
    const { typesenseCollection } = body;
    if (!typesenseCollection) {
      return res.status(400).send({ message: 'Collection is required' });
    }
    const response = await initializeTypesenseCollectionService(
      builderDB,
      projectId,
      environment,
      typesenseCollection,
    );
    return res.status(response.code).send(response);
  } catch (error) {
    console.error('Error in initializeTypesenseCollection :>> ', error);
    next(error);
  }
};

export const reindexAllData = async (req, res, next) => {
  try {
    const { body, builderDB, projectId, db, environment } = req;
    const { typesenseCollection } = body;
    if (!typesenseCollection) {
      return res.status(400).send({ message: 'Collection is required' });
    }
    const response = await reindexAllDataService(
      builderDB,
      db,
      projectId,
      environment,
      typesenseCollection,
    );
    return res.status(response.code).send(response);
  } catch (error) {
    console.error('Error in reindexAllData :>> ', error);
    next(error);
  }
};

export const deleteTypesenseCollection = async (req, res, next) => {
  try {
    const { params, builderDB, projectId, environment } = req;
    const { collectionName } = params;
    if (!collectionName) {
      return res.status(400).send({ message: 'Typesense Collection name is required.' });
    }
    const result = await deleteTypesenseCollectionService(
      builderDB,
      projectId,
      environment,
      collectionName,
    );
    return res.status(result.code).send(result);
  } catch (error) {
    console.error('Error in deleteTypesenseCollection:', error.message);
    next(error);
  }
};

export const searchTypesenseCollection = async (req, res, next) => {
  try {
    const { body, builderDB, projectId, user, tenant, db, environment, query } = req;
    const { typesenseCollection, searchQuery, typesenseFilter, resultsLimit, sortBy, sortOrder } =
      body;
    if (!typesenseCollection) {
      return res.status(400).send({ message: 'Typesense Collection name is required.' });
    }
    if (!searchQuery) {
      return res.status(400).send({ message: 'Search Query is required.' });
    }
    const searchResponse = await searchTypesenseCollectionService(
      builderDB,
      db,
      projectId,
      user,
      tenant,
      environment,
      typesenseCollection,
      searchQuery,
      typesenseFilter,
      query,
      resultsLimit,
      sortBy,
      sortOrder,
    );
    return res.status(searchResponse.code).send(searchResponse);
  } catch (error) {
    console.error('Error in searchTypesenseCollection:', error.message);
    next(error);
  }
};

export const getAllTypesenseIndexedData = async (req, res, next) => {
  try {
    const { builderDB, params, projectId, environment } = req;
    const { typesenseCollectionName } = params;
    if (!typesenseCollectionName) {
      return res.status(400).send({ message: 'Typesense Collection name is required.' });
    }
    const result = await getAllTypesenseIndexedDataService(
      builderDB,
      projectId,
      environment,
      typesenseCollectionName,
    );
    return res.status(result.code).send(result);
  } catch (error) {
    console.error('Error in getAllTypesenseIndexedData:', error.message);
    next(error);
  }
};

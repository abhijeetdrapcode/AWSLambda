import { findOneService } from '../collection/collection.service';
import { loadTypesensePluginConfig } from '../install-plugin/installedPlugin.service';
import {
  createTypesenseCollection,
  getTypesenseClient,
  prepareDataForTypesenseIndexing,
  retrieveTypesenseCollection,
  prepareFilterByForTypesense,
} from './typesenseSearch.utils';
import { getItemCount, list } from '../item/item.service';

export const initializeTypesenseCollectionService = async (
  builderDB,
  projectId,
  environment,
  typesenseCollectionName,
) => {
  try {
    const collectionDetails = await findOneService(builderDB, {
      collectionName: typesenseCollectionName,
    });
    if (!collectionDetails) {
      return { code: 404, message: 'Collection not found with provided ID' };
    }
    const { typesenseMapping } = collectionDetails;
    if (!typesenseMapping.length) {
      return { code: 404, message: 'Typesense mapping not found in the given collection' };
    }
    const typesenseSearchPlugin = await loadTypesensePluginConfig(
      builderDB,
      projectId,
      environment,
    );
    if (!typesenseSearchPlugin) {
      return { code: 404, message: 'Typesense search plugin not installed' };
    }
    const { host, port, protocol, apiKey } = typesenseSearchPlugin;
    const typesenseClient = getTypesenseClient(host, port, protocol, apiKey);
    const exisitingTypesenseCollection = await retrieveTypesenseCollection(
      typesenseClient,
      typesenseCollectionName,
    );
    if (exisitingTypesenseCollection) {
      return {
        code: 200,
        message: 'Typesense Collection already exists!',
        data: exisitingTypesenseCollection,
        collectionDetails,
      };
    }
    const result = await createTypesenseCollection(
      builderDB,
      collectionDetails,
      typesenseClient,
      typesenseCollectionName,
      typesenseMapping,
    );
    return result;
  } catch (error) {
    console.error('Error in initializeTypesenseCollectionService:', error);
    return { code: 500, message: 'Error initializing Typesense collection', error };
  }
};

export const saveItemInTypesenseCollectionService = async (
  typesenseClient,
  typesenseCollectionName,
  typesenseDocuments,
) => {
  try {
    const result = await typesenseClient
      .collections(typesenseCollectionName)
      .documents()
      .import(typesenseDocuments, { action: 'upsert' });
    return { code: 200, message: 'Document saved to Typesense successfully', data: result };
  } catch (error) {
    console.error('Error in saveItemInTypesenseCollectionService:', error);
    return { code: 500, message: 'Error saving document to Typesense', error };
  }
};

export const reindexAllDataService = async (
  builderDB,
  db,
  projectId,
  environment,
  typesenseCollection,
) => {
  try {
    const collectionDetails = await findOneService(builderDB, { uuid: typesenseCollection });
    if (!collectionDetails) {
      return { code: 404, message: 'Collection not found with provided ID' };
    }
    const { collectionName: typesenseCollectionName, typesenseMapping } = collectionDetails;
    if (!typesenseMapping.length) {
      return { code: 404, message: 'Typesense mapping not found in the given collection' };
    }
    const typesenseSearchPlugin = await loadTypesensePluginConfig(
      builderDB,
      projectId,
      environment,
    );
    if (!typesenseSearchPlugin) {
      return { code: 404, message: 'Typesense search plugin not installed' };
    }
    const { host, port, protocol, apiKey } = typesenseSearchPlugin;
    const typesenseClient = getTypesenseClient(host, port, protocol, apiKey);
    const deleteCollectionResponse = await deleteTypesenseCollectionService(
      builderDB,
      projectId,
      environment,
      typesenseCollection,
    );
    if (deleteCollectionResponse.code === 500) {
      return deleteCollectionResponse;
    }
    const createCollectionResponse = await createTypesenseCollection(
      builderDB,
      collectionDetails,
      typesenseClient,
      typesenseCollectionName,
      typesenseMapping,
    );
    if (createCollectionResponse.code === 500) {
      return createCollectionResponse;
    }
    const { data: collectionItemCount = 0 } = await getItemCount(db, typesenseCollectionName);
    if (collectionItemCount === 0) {
      return { code: 204, message: 'No data available to reindex in Typesense' };
    }
    const collectionAllData = await list(builderDB, db, projectId, typesenseCollectionName, null, {
      max: collectionItemCount,
    });
    const result = await prepareDataForTypesenseIndexing(
      builderDB,
      projectId,
      environment,
      typesenseCollectionName,
      collectionAllData,
      typesenseMapping,
    );
    return result;
  } catch (error) {
    console.error('Error in reindexAllDataService:', error);
    return { code: 500, message: 'Error reindexing data in Typesense', error };
  }
};

export const deleteTypesenseCollectionService = async (
  builderDB,
  projectId,
  environment,
  typesenseCollection,
) => {
  try {
    const collectionDetails = await findOneService(builderDB, { uuid: typesenseCollection });
    if (!collectionDetails) {
      return { code: 404, message: 'Collection not found with provided ID' };
    }
    const { collectionName: typesenseCollectionName } = collectionDetails;
    const typesenseSearchPlugin = await loadTypesensePluginConfig(
      builderDB,
      projectId,
      environment,
    );
    if (!typesenseSearchPlugin) {
      return { code: 404, message: 'Typesense search plugin not installed' };
    }
    const { host, port, protocol, apiKey } = typesenseSearchPlugin;
    const typesenseClient = getTypesenseClient(host, port, protocol, apiKey);
    const existingCollection = await retrieveTypesenseCollection(
      typesenseClient,
      typesenseCollectionName,
    );
    if (!existingCollection) {
      return { code: 404, message: 'Collection does not exist.' };
    }
    const result = await typesenseClient.collections(typesenseCollectionName).delete();
    return { code: 200, message: 'Collection deleted successfully.', data: result };
  } catch (error) {
    console.error('Error deleting Typesense collection:', error);
    return { code: 500, message: 'Failed to delete collection.', error };
  }
};

export const searchTypesenseCollectionService = async (
  builderDB,
  db,
  projectId,
  user,
  tenant,
  environment,
  typesenseCollectionName,
  query,
  typesenseFilter,
  urlParams,
  resultsLimit,
  sortBy,
  sortOrder,
) => {
  try {
    const collectionDetails = await findOneService(builderDB, {
      collectionName: typesenseCollectionName,
    });
    if (!collectionDetails) {
      return { code: 404, message: 'Collection not found.' };
    }
    const { typesenseMapping, finders } = collectionDetails;
    if (!typesenseMapping.length) {
      return { code: 404, message: 'Typesense mapping not found in the given collection' };
    }
    const typesenseSearchPlugin = await loadTypesensePluginConfig(
      builderDB,
      projectId,
      environment,
    );
    if (!typesenseSearchPlugin) {
      return { code: 404, message: 'Typesense search plugin not installed' };
    }
    const { host, port, protocol, apiKey } = typesenseSearchPlugin;
    const typesenseClient = getTypesenseClient(host, port, protocol, apiKey);
    const existingCollection = await retrieveTypesenseCollection(
      typesenseClient,
      typesenseCollectionName,
    );
    if (!existingCollection) {
      return { code: 404, message: 'Collection does not exist.' };
    }
    let filterBy = `projectId:=${projectId}`;
    if (typesenseFilter) {
      const selectedFilter = finders.find((finder) => finder.uuid === typesenseFilter);
      if (!selectedFilter) {
        return { code: 404, message: 'Filter not found with provided id.' };
      }
      filterBy = await prepareFilterByForTypesense(
        builderDB,
        db,
        selectedFilter,
        projectId,
        user,
        tenant,
        typesenseMapping,
        urlParams,
      );
    }
    const queryByFields = typesenseMapping
      .filter(
        ({ fieldType }) =>
          !['number', 'createdAt', 'updatedAt', 'unix_timestamp', 'date'].includes(fieldType),
      )
      .map(({ fieldName }) => fieldName)
      .join(',');
    if (!sortBy) sortBy = 'priority';
    if (!sortOrder) sortOrder = 'asc';
    const searchParams = {
      q: query,
      query_by: queryByFields,
      filter_by: filterBy,
      sort_by: `${sortBy}:${sortOrder}`,
      per_page: resultsLimit,
    };
    const searchResults = await typesenseClient
      .collections(typesenseCollectionName)
      .documents()
      .search(searchParams);
    if (searchResults.hits.length === 0) {
      return {
        code: 200,
        message: 'No results found',
        data: [],
      };
    }
    return {
      code: 200,
      message: 'Search successful',
      data: searchResults.hits.map((hit) => hit.document),
    };
  } catch (error) {
    console.error('Error in searchTypesenseCollectionService:', error);
    return { code: 500, message: 'Error searching data in Typesense', error };
  }
};

export const deleteTypesenseDataService = async (
  builderDB,
  projectId,
  environment,
  typesenseCollectionName,
  documentId,
) => {
  try {
    const typesenseSearchPlugin = await loadTypesensePluginConfig(
      builderDB,
      projectId,
      environment,
    );
    if (!typesenseSearchPlugin) {
      return { code: 404, message: 'Typesense search plugin not installed' };
    }
    const { host, port, protocol, apiKey } = typesenseSearchPlugin;
    const typesenseClient = getTypesenseClient(host, port, protocol, apiKey);
    const existingCollection = await retrieveTypesenseCollection(
      typesenseClient,
      typesenseCollectionName,
    );
    if (!existingCollection) {
      return { code: 404, message: 'Collection does not exist.' };
    }
    const result = await typesenseClient
      .collections(typesenseCollectionName)
      .documents(documentId)
      .delete();
    console.log(`Document with ID ${documentId} deleted successfully`);
    return {
      code: 200,
      message: `Document with ID ${documentId} deleted successfully`,
      data: result,
    };
  } catch (error) {
    console.error('Error in deleteTypesenseDataService:', error);
    return { code: 500, message: 'Error deleting item from collection', error };
  }
};

export const getAllTypesenseIndexedDataService = async (
  builderDB,
  projectId,
  environment,
  typesenseCollectionName,
) => {
  const typesenseSearchPlugin = await loadTypesensePluginConfig(builderDB, projectId, environment);
  if (!typesenseSearchPlugin) {
    return { code: 404, message: 'Typesense search plugin not installed' };
  }
  const { host, port, protocol, apiKey } = typesenseSearchPlugin;
  const typesenseClient = getTypesenseClient(host, port, protocol, apiKey);
  const existingCollection = await retrieveTypesenseCollection(
    typesenseClient,
    typesenseCollectionName,
  );
  if (!existingCollection) {
    return { code: 404, message: 'Collection does not exist.' };
  }
  try {
    let allResults = [];
    let page = 1;
    const perPage = 100;
    const collectionStats = await typesenseClient.collections(typesenseCollectionName).retrieve();
    const totalDocuments = collectionStats.num_documents;
    let filterBy = `projectId:=${projectId}`;
    while (allResults.length < totalDocuments) {
      const searchResponse = await typesenseClient
        .collections(typesenseCollectionName)
        .documents()
        .search({
          q: '*',
          query_by: 'uuid',
          filter_by: filterBy,
          per_page: perPage,
          page: page,
        });
      allResults = [...allResults, ...searchResponse.hits.map((hit) => hit.document)];
      page++;
    }
    return {
      code: 200,
      message: 'All indexed data fetched successfully',
      count: totalDocuments,
      data: allResults,
    };
  } catch (error) {
    console.error('Error fetching indexed data from Typesense:', error);
    return { code: 500, message: 'Failed to retrieve indexed data', error: error.message };
  }
};

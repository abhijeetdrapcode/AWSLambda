import Typesense from 'typesense';
import {
  findInstalledPlugin,
  loadTypesensePluginConfig,
} from '../install-plugin/installedPlugin.service';
import { CURRENT_SETTINGS, CURRENT_TENANT, CURRENT_USER, pluginCode } from 'drapcode-constant';
import { saveItemInTypesenseCollectionService } from './typesenseSearch.service';
import { extractUserSettingFromUserAndTenantUsingIds } from '../middleware/tenant.middleware';
import { findOneItemByQuery } from '../item/item.service';

export const getTypesenseClient = (host, port, protocol, apiKey) => {
  const typesenseClient = new Typesense.Client({
    nodes: [
      {
        host,
        port,
        protocol,
      },
    ],
    apiKey,
  });
  return typesenseClient;
};

export const generateTypesenseSchema = async (
  builderDB,
  typesenseCollectionName,
  typesenseMapping,
) => {
  const multiTenantPlugin = await findInstalledPlugin(builderDB, {
    code: pluginCode.MULTI_TENANT_SAAS,
  });
  const predefinedFields = new Set(['id', 'priority', 'projectId', 'createdBy']);
  if (multiTenantPlugin) {
    predefinedFields.add('tenantId');
  }
  const schemaFields = typesenseMapping
    .filter(({ fieldName }) => !predefinedFields.has(fieldName))
    .map(({ fieldName, fieldType }) => ({
      name: fieldName,
      type: typeMapping[fieldType] || 'string',
    }));
  return {
    name: typesenseCollectionName,
    fields: [
      ...[...predefinedFields].map((name) => ({
        name,
        type: name === 'priority' ? 'int32' : name === 'tenantId' ? 'string[]' : 'string',
      })),
      ...schemaFields,
    ],
    default_sorting_field: 'priority',
  };
};

export const retrieveTypesenseCollection = async (typesenseClient, typesenseCollectionName) => {
  try {
    return await typesenseClient.collections(typesenseCollectionName).retrieve();
  } catch (error) {
    if (error.httpStatus === 404) {
      return null;
    }
    console.error('Unexpected error while checking collection:', error);
    throw error;
  }
};

export const createTypesenseCollection = async (
  builderDB,
  collectionDetails,
  typesenseClient,
  typesenseCollectionName,
  typesenseMapping,
) => {
  try {
    const typesenseSchema = await generateTypesenseSchema(
      builderDB,
      typesenseCollectionName,
      typesenseMapping,
    );
    if (!typesenseSchema || !typesenseSchema.name || !typesenseSchema.fields) {
      throw new Error('Invalid Typesense schema: Missing required properties.');
    }
    const result = await typesenseClient.collections().create(typesenseSchema);
    return {
      code: 200,
      message: 'Collection created successfully.',
      data: result,
      collectionDetails,
    };
  } catch (error) {
    if (error.httpStatus === 400 && error.message.includes('already exists')) {
      return { code: 400, message: 'Collection already exists.', error };
    }
    console.error('Error creating Typesense collection:', error);
    return { code: 500, message: 'Failed to create Typesense collection.', error };
  }
};

export const prepareDataForTypesenseIndexing = async (
  builderDB,
  projectId,
  environment,
  typesenseCollectionName,
  data,
  typesenseMapping,
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
    console.log('Typesense collection does not exist');
    return { code: 404, message: 'Collection does not exist.' };
  }
  data = Array.isArray(data) ? data : [data];
  const typesenseData = data.map((item) => {
    const formattedDocument = {};
    typesenseMapping.forEach(({ fieldName, fieldType, priority }) => {
      let value = item[fieldName] ?? '';
      if (['reference', 'belongsTo', 'static_option', 'dynamic_option'].includes(fieldType)) {
        if (Array.isArray(value)) {
          if (value.every((item) => typeof item === 'object' && item !== null && 'uuid' in item)) {
            value = value.map((refObj) => refObj.uuid).filter(Boolean);
          } else {
            value = value.filter((v) => typeof v === 'string' && v.trim() !== '');
          }
        } else {
          value = value?.uuid ? [value.uuid] : [];
        }
      } else if (fieldType === 'file') {
        if (Array.isArray(value)) {
          if (
            value.every((item) => typeof item === 'object' && item !== null && 'smallIcon' in item)
          ) {
            value = value.map((fileObj) => fileObj.smallIcon).filter(Boolean);
          }
        } else {
          value = value?.smallIcon ? [value.smallIcon] : [];
        }
      } else if (['createdAt', 'updatedAt', 'date'].includes(fieldType)) {
        value = value ? Math.floor(new Date(value).getTime() / 1000) : 0;
      } else if (fieldType === 'number') {
        value = isNaN(value) ? 0 : Number(value);
      } else if (Array.isArray(value)) {
        value = value.map(String);
      } else {
        value = String(value);
      }
      formattedDocument[fieldName] = value;
      formattedDocument.priority = priority;
    });
    formattedDocument.id = item.uuid || '';
    formattedDocument.projectId = projectId;
    formattedDocument.tenantId = Array.isArray(item?.tenantId)
      ? item.tenantId.every((t) => typeof t === 'object' && t !== null && 'uuid' in t)
        ? item.tenantId.map((t) => t.uuid)
        : [item.tenantId[0]]
      : [];
    formattedDocument.createdBy = item.createdBy || '';
    return formattedDocument;
  });

  if (typesenseData.length === 0) {
    return { code: 204, message: 'No data to reindex in Typesense' };
  }
  const result = await saveItemInTypesenseCollectionService(
    typesenseClient,
    typesenseCollectionName,
    typesenseData,
  );
  return result;
};

export const prepareFilterByForTypesense = async (
  builderDB,
  dbConnection,
  selectedFilter,
  projectId,
  user = {},
  tenant = {},
  typesenseMapping,
  urlParams = {},
) => {
  if (
    selectedFilter.finder === 'FIND_ALL' &&
    !selectedFilter.conditions.length &&
    selectedFilter.name === 'All Items'
  ) {
    return `projectId:=${projectId}`;
  }
  if (
    !selectedFilter ||
    !Array.isArray(selectedFilter.conditions) ||
    selectedFilter.conditions.length === 0
  ) {
    return `uuid:="nonexistent-value"`; //to return no results
  }
  const filterConditions = await Promise.all(
    selectedFilter.conditions.map(async (condition) => {
      let {
        conjunctionType,
        requiredExternal,
        query: { field, key, value, fieldType, refField, refCollection },
      } = condition;
      const isExcludedField = ['tenantId', 'createdBy'].includes(field);
      if (!isExcludedField) {
        const isFieldInMapping = typesenseMapping.some((schema) => schema.fieldName === field);
        if (!isFieldInMapping) {
          console.error(`${field} is not present in Typesense schema.`);
          return null;
        }
      }
      let filterValue = value;
      if (requiredExternal && urlParams[value]) {
        if (fieldType === 'reference' || fieldType === 'belongsTo') {
          filterValue = Array.isArray(urlParams[value]) ? urlParams[value] : [urlParams[value]];
        } else filterValue = urlParams[value];
      }
      const userSetting = await extractUserSettingFromUserAndTenantUsingIds(
        builderDB,
        dbConnection,
        projectId,
        user,
        tenant,
      );
      if (typeof filterValue === 'string' && filterValue.includes('::')) {
        const [source, fieldKey] = filterValue.split('::');
        if (source === 'CURRENT_TENANT' && tenant[fieldKey] !== undefined) {
          filterValue = tenant[fieldKey];
        } else if (source === 'CURRENT_USER' && user[fieldKey] !== undefined) {
          filterValue = user[fieldKey];
        } else if (source === 'CURRENT_SETTINGS' && userSetting[fieldKey] !== undefined) {
          filterValue = userSetting[fieldKey];
        }
      }
      if (field === 'createdBy' && filterValue === CURRENT_USER) {
        filterValue = user?.uuid || '';
      }
      if (
        (fieldType === 'reference' || fieldType === 'belongsTo') &&
        refField &&
        refCollection &&
        !requiredExternal
      ) {
        try {
          if (refCollection === CURRENT_USER) {
            if (refField === 'tenantId') {
              const allTenantIds = user[refField];
              const currentTenantId =
                allTenantIds.length === 1
                  ? allTenantIds[0]
                  : allTenantIds.find((t) => t === tenant.uuid);
              filterValue = currentTenantId;
            } else if (refField === 'userSettingId') {
              const allUserSettingIds = user[refField];
              const currentUserSettingId =
                allUserSettingIds.length === 1
                  ? allUserSettingIds[0]
                  : allUserSettingIds.find((setting) => setting === userSetting.uuid);
              filterValue = currentUserSettingId;
            } else filterValue = user[refField];
          } else if (refCollection === CURRENT_TENANT) {
            filterValue = tenant[refField];
          } else if (refCollection === CURRENT_SETTINGS) {
            filterValue = userSetting[refField];
          } else {
            const valueArray = Array.isArray(value) ? value : [value];
            const refDataArray = await Promise.all(
              valueArray.map(async (val) => {
                return await findOneItemByQuery(dbConnection, refCollection, { [refField]: val });
              }),
            );
            const uuidArray = refDataArray
              .filter((item) => item && item.uuid !== undefined)
              .map((item) => item.uuid);
            if (uuidArray.length > 0) {
              filterValue = uuidArray.length === 1 ? uuidArray[0] : uuidArray;
            } else {
              return null;
            }
          }
        } catch (error) {
          console.error(`Error fetching reference field from ${refCollection}:`, error);
          return null;
        }
      }
      if (filterValue === null || filterValue === undefined || filterValue === '') {
        console.warn(`Skipping filter: ${field} has an empty value.`);
        return null;
      }
      if (key === 'IN_LIST' || key === 'NOT_IN_LIST') {
        const valueArray = Array.isArray(filterValue) ? filterValue : filterValue.split(',');
        filterValue = `[${valueArray.map((v) => `"${v}"`).join(', ')}]`;
      }
      const operatorMap = {
        EQUALS: ':=',
        NOT_EQUALS: ':!=',
        GREATER_THAN: ':>',
        GREATER_THAN_OR_EQUALS: ':>=',
        LESS_THAN: ':<',
        LESS_THAN_OR_EQUALS: ':<=',
        IN_LIST: ':=',
        NOT_IN_LIST: ':!=',
      };
      const typesenseOperator = operatorMap[key] || ':=';
      const filterExpression = ['IN_LIST', 'NOT_IN_LIST'].includes(key)
        ? `${field}${typesenseOperator}${filterValue}`
        : `${field}${typesenseOperator}"${filterValue}"`;
      const conjunction = conjunctionType === 'AND' ? '&&' : '||';
      return { filterExpression, conjunction };
    }),
  );
  const validFilters = filterConditions.filter(Boolean);
  if (validFilters.length === 0) {
    return `uuid:="nonexistent-value"`; //to return no results
  }
  const finalFilterQuery = validFilters
    .map((condition, index) => {
      if (index > 0) {
        return `${condition.conjunction} ${condition.filterExpression}`;
      }
      return condition.filterExpression;
    })
    .join(' ');
  return `${finalFilterQuery} && projectId:=${projectId}`;
};

const typeMapping = {
  reference: 'string[]',
  belongsTo: 'string[]',
  static_option: 'string[]',
  dynamic_option: 'string[]',
  file: 'string[]',
  createdAt: 'int32',
  updatedAt: 'int32',
  number: 'int32',
  unix_timestamp: 'int32',
  date: 'int32',
};

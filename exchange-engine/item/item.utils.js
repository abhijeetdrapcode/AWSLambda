import { notFieldForExport, notFieldForImport, BelongsToReferenceField } from 'drapcode-constant';
import { parseValueFromData } from 'drapcode-utility';
import { prepareFunction } from '../utils/appUtils';
import _ from 'lodash';
import { extractUserSettingFromUserAndTenant } from '../middleware/tenant.middleware';
import { authenticateUser } from './item.service';

export const createCSVFile = async (collection, localFilePath, items) => {
  if (!Array.isArray(items)) {
    items = [items];
  }
  let columns = [];
  const { fields, finder } = collection;
  if (finder) {
    if (finder.fieldsInclude.length !== 1) {
      columns = finder.fieldsInclude;
    }
  }
  if (!columns || columns.length === 0) {
    fields.forEach((field) => {
      const { type } = field;
      if (!notFieldForExport.includes(type)) {
        columns.push(field.fieldName);
      }
    });
  }
  let headerColumns = [];
  let itemColumns = [];
  columns.forEach((col) => {
    if (col.includes('RF:') || col.includes('DF:')) {
      let field = col;
      if (col.startsWith('RF::')) {
        field = field.replace('RF::', '');
      } else if (col.startsWith('DF::')) {
        const derivedField = extractDerivedFieldFromMetaData(field);
        field = derivedField.name;
      }
      headerColumns.push({ key: field, header: field });
      itemColumns.push({
        key: field,
        fieldName: field,
        type: 'text',
        refCollectionField: '',
      });
    } else {
      const selectedField = fields.find((field) => field.fieldName === col);
      if (selectedField) {
        const { fieldTitle, fieldName, type, refCollection } = selectedField;
        headerColumns.push({ key: col, header: fieldTitle.en });
        itemColumns.push({
          key: col,
          fieldName: fieldName,
          type: type,
          refCollectionField: refCollection ? refCollection.collectionField : '',
        });
      }
    }
  });
  const finalData = [];
  items.forEach((item) => {
    const preparedItem = {};
    itemColumns.forEach((itemCol) => {
      const { key, fieldName, type, refCollectionField } = itemCol;
      let itemFieldData = parseValueFromData(item, fieldName);
      if (itemFieldData && itemFieldData !== 'undefined') {
        if (BelongsToReferenceField.includes(type)) {
          if (Array.isArray(itemFieldData)) {
            preparedItem[key] = itemFieldData.map((record) => record[refCollectionField]).join(',');
          } else {
            preparedItem[key] = itemFieldData[refCollectionField];
          }
        } else if (Array.isArray(itemFieldData)) {
          preparedItem[key] = itemFieldData.join(',');
        } else {
          preparedItem[key] = itemFieldData;
        }
      } else {
        preparedItem[key] = '';
      }
    });
    finalData.push(preparedItem);
  });
  return { finalData, headerColumns };
};

export const filterFieldsForCSVImport = (fields) => {
  return fields.filter((field) => {
    return !notFieldForImport.includes(field.type);
  });
};

export const getPlatform = (navigator) => {
  const { platform: navigatorPlatform, userAgent, userAgentData } = navigator ?? '';
  let os = '';
  let platform = userAgentData ? userAgentData.platform : navigatorPlatform;
  const MAC_OS_PLATFORMS = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K', 'macOS'];
  const WINDOWS_PLATFORMS = ['Win32', 'Win64', 'Windows', 'WinCE'];
  const IOS_PLATFORMS = ['iPhone', 'iPad', 'iPod'];

  if (MAC_OS_PLATFORMS.indexOf(platform) !== -1) {
    os = 'Mac OS';
  } else if (IOS_PLATFORMS.indexOf(platform) !== -1) {
    os = 'iOS';
  } else if (WINDOWS_PLATFORMS.indexOf(platform) !== -1) {
    os = 'Windows';
  } else if (/Android/.test(userAgent)) {
    os = 'Android';
  } else if (!os && /Linux/.test(platform)) {
    os = 'Linux';
  }
  return os;
};

// Todo: Can be moved to common module
export const processFieldsInclude = (finder, data, user) => {
  const isFieldInclude = finder && finder.fieldsInclude && finder.fieldsInclude.length;
  if (
    isFieldInclude &&
    ['FIND_ALL', 'FIND'].includes(finder.finder) &&
    finder.fieldsInclude[0] !== '*'
  ) {
    if (finder.fieldsInclude.some((incl) => incl.startsWith('RF::')))
      data = addReferenceFieldInclude(finder, data);
    if (finder.fieldsInclude.some((incl) => incl.startsWith('DF::')))
      data = addDerivedFieldInclude(finder, data, user);
    data = Array.isArray(data)
      ? data.map((item) => removeExtraFields(finder, item))
      : removeExtraFields(finder, data);
  }
  return data;
};

const addReferenceFieldInclude = (finder, data) => {
  const isArray = Array.isArray(data);
  let result = data;
  if (result) {
    result = isArray ? result : [result];
    const referenceFieldsInclude = finder.fieldsInclude.filter((field) => field.startsWith('RF::'));
    referenceFieldsInclude.forEach((exField) => {
      let field = exField.replace('RF::', '');
      if (field) {
        result = result.map((item) => {
          const value = parseValueFromData(item, field);
          item[field] = value ? value : '';
          return item;
        });
      }
    });
  }
  return isArray ? result : result[0];
};

const addDerivedFieldInclude = (finder, data, user) => {
  const isArray = Array.isArray(data);
  let result = data;
  if (result) {
    result = isArray ? result : [result];
    const derivedFieldsInclude = finder.fieldsInclude.filter((field) => field.startsWith('DF:'));
    derivedFieldsInclude.forEach((exField) => {
      const derivedField = extractDerivedFieldFromMetaData(exField);
      if (derivedField) {
        result = result.map((item) => {
          const value = prepareFunction(derivedField, item, user);
          item[derivedField.name] = value ? value : '';
          return item;
        });
      }
    });
  }
  return isArray ? result : result[0];
};

const removeExtraFields = (finder, data) => {
  let result = {};
  let refFieldsAdded = [];
  finder.fieldsInclude.forEach((fieldIncd) => {
    if (fieldIncd.startsWith('RF::')) {
      fieldIncd = fieldIncd.replace('RF::', '');
      const field = fieldIncd.split('.')[0];
      if (!refFieldsAdded.includes(field)) {
        result[field] = data[field];
        refFieldsAdded.push(field);
      }
    } else if (fieldIncd.startsWith('DF::')) {
      const derivedField = extractDerivedFieldFromMetaData(fieldIncd);
      fieldIncd = derivedField.name;
    }
    result[fieldIncd] = data[fieldIncd];
  });
  return result;
};

const extractDerivedFieldFromMetaData = (derivedFieldStr) => {
  let field = derivedFieldStr.replace('DF::', '');
  field = field.replaceAll('*#*#', '"');
  const derivedField = JSON.parse(field);
  return derivedField;
};

export const checkPermissionLevelSecurity = async (
  builderDB,
  db,
  projectId,
  authorization,
  permissionLevelSecurity,
  data,
) => {
  try {
    let currentUser = await authenticateUser(builderDB, db, projectId, authorization);
    if (!currentUser) {
      currentUser = {};
    }
    const { permissions: userPermissions = [], tenantId = [] } = currentUser;
    let currentTenant;
    if (tenantId && tenantId.length) {
      currentTenant = tenantId[0];
    }
    const currentUserSetting = extractUserSettingFromUserAndTenant(currentUser, currentTenant);
    const { permissions: userSettingsPermissions = [] } = currentUserSetting;
    const effectivePermissions = userSettingsPermissions.length
      ? userSettingsPermissions
      : userPermissions;
    const processItem = (item) => {
      permissionLevelSecurity.forEach((securityItem) => {
        const { fieldName, permission, allowedPermissions } = securityItem;
        // eslint-disable-next-line no-prototype-builtins
        if (item.hasOwnProperty(fieldName)) {
          if (permission === 'restricted') {
            const userHasPermission = allowedPermissions.some((perm) =>
              effectivePermissions.includes(perm),
            );
            if (!userHasPermission) {
              item[fieldName] = Array.isArray(item[fieldName]) ? [] : '';
            }
          } else if (permission === 'not_allowed') {
            item[fieldName] = Array.isArray(item[fieldName]) ? [] : '';
          }
        }
      });
    };
    if (Array.isArray(data)) {
      data.forEach((item) => processItem(item));
    } else {
      processItem(data);
    }
    return data;
  } catch (error) {
    console.error('Error while checking permission level security', error);
    return data;
  }
};

export const processConstructorData = (constructorData, context) => {
  const {
    headers,
    ipAddress,
    navigator,
    currentUser,
    previousActionResponse,
    previousActionFormData,
    sessionStorageData,
    localStorageData,
    cookiesData,
  } = context;

  return Object.fromEntries(
    Object.entries(constructorData).map(([key, value]) => {
      if (value && typeof value === 'string' && value.startsWith('{{')) {
        const valueKey = value.replace(/{{(.*?)}}/g, '$1');
        switch (valueKey) {
          case 'CURRENT_DATE_TIME':
            return [key, new Date()];
          case 'TIMESTAMP_IN_SEC':
            return [key, Math.round(Date.now() / 1000)];
          case 'TIMESTAMP_IN_MILLISEC':
            return [key, Date.now()];
          case 'USER_AGENT':
            return [key, headers['user-agent'] ?? ''];
          case 'IP_ADDRESS':
            return [key, ipAddress ?? ''];
          case 'PLATFORM':
            return [key, getPlatform(navigator) ?? ''];
          default:
            if (valueKey.startsWith('current_user.')) {
              const userKey = valueKey.split('.')[1];
              return [key, currentUser ? parseValueFromData(currentUser, userKey) : ''];
            } else if (valueKey.startsWith('current_session.')) {
              const sessionKey = valueKey.replace('current_session.', '');
              return [key, parseValueFromData(previousActionResponse, sessionKey)];
            } else if (valueKey.startsWith('form_data_session.')) {
              const sessionKey = valueKey.replace('form_data_session.', '');
              return [key, parseValueFromData(previousActionFormData, sessionKey)];
            } else if (valueKey.startsWith('SESSION_STORAGE.')) {
              const sessionKey = valueKey.replace('SESSION_STORAGE.', '');
              return [key, _.get(sessionStorageData, sessionKey)];
            } else if (valueKey.startsWith('LOCAL_STORAGE.')) {
              const sessionKey = valueKey.replace('LOCAL_STORAGE.', '');
              return [key, _.get(localStorageData, sessionKey)];
            } else if (valueKey.startsWith('COOKIES.')) {
              const sessionKey = valueKey.replace('COOKIES.', '');
              return [key, _.get(cookiesData, sessionKey)];
            }
        }
      }
      return [key, value];
    }),
  );
};

import { validateEmail, validateUuidString } from 'drapcode-utility';
import {
  EQUALS,
  GREATER_THAN,
  GREATER_THAN_EQUALS_TO,
  IN_LIST,
  IS_NOT_NULL,
  IS_NULL,
  LESS_THAN,
  LESS_THAN_EQUALS_TO,
  LIKE,
  NOT_IN_LIST,
} from 'drapcode-constant';
import {
  applyRowLevelSecurity,
  authenticateUser,
  findItemById,
  findOneItemByQueryC,
  generateQuery,
  processFinderConditions,
} from '../item/item.service';
import { sendDynamicEmailService, sendEmailTemplateService } from '../email/email.service';
import { findOneService } from '../collection/collection.service';
import { userCollectionName } from '../loginPlugin/loginUtils';
import { findTemplate } from '../email-template/template.service';
import { createAuditTrail } from '../logs/audit/audit.service';
import { extractUserSettingFromUserAndTenant } from '../middleware/tenant.middleware';
import {
  checkParams,
  formatDateFields,
  processQueryResult,
  processSearch,
} from '../utils/appUtils';

export const processItemsByFilter = async (
  builderDB,
  dbConnection,
  projectId,
  collection,
  filterUuid,
  headerToken,
  timezone,
  headers,
  queryData = {},
  count = 0,
  search = 0,
  stopNestedFilter = false,
  dateFormat,
  tenant = null,
) => {
  // Format date fields
  formatDateFields(queryData, dateFormat);

  let {
    collectionName,
    isPrivate,
    constants,
    externalParams,
    finder,
    noOfExternalParams,
    refCollectionFields,
    fields,
    enableLookup,
    lookups,
    rowLevelSecurityFilter,
  } = collection;
  const lookupConfig = { enableLookup, lookups };
  let currentUser;

  isPrivate = `${isPrivate}`;
  if (isPrivate == 'true') {
    currentUser = await authenticateUser(builderDB, dbConnection, projectId, headerToken);
    if (!currentUser) {
      return { code: 401, message: 'Authentication Failed. Please login.' };
    }
  }
  if (stopNestedFilter) finder.fieldsInclude = ['uuid']; // select uuid field from inner filter query

  if (noOfExternalParams != 0) {
    const result = checkParams(externalParams, queryData);
    if (!result) {
      return {
        code: 422,
        message: `External params should be in [${externalParams}]`,
      };
    }
  }

  // Handle search filters
  const { searchObj, searchQueryTypeObj } = processSearch(
    queryData,
    fields,
    externalParams,
    search,
  );

  const currentTenant = tenant ? tenant : currentUser?.tenantId?.[0] || '';
  const currentUserSettings = extractUserSettingFromUserAndTenant(currentUser, currentTenant);

  const commonSetting = {
    stopNestedFilter,
    queryData,
    searchObj,
    headers,
    currentUser,
    currentTenant,
    headerToken,
    timezone,
    dateFormat,
    lookupConfig,
    constants,
    currentUserSettings,
  };

  // Apply Row-Level Security (RLS)
  let rlsConfig = await applyRowLevelSecurity(
    dbConnection,
    builderDB,
    projectId,
    finder,
    rowLevelSecurityFilter,
    commonSetting,
  );

  // Process finder conditions
  await processFinderConditions(dbConnection, builderDB, projectId, finder, commonSetting);

  if (count) finder.finder = 'COUNT';
  console.log(')))))))))))))))))))))))))))))))))');
  ``;
  try {
    console.log('Generating query...');
    const query = await generateQuery(
      collectionName,
      finder,
      constants,
      queryData,
      currentUser,
      timezone,
      searchObj,
      refCollectionFields,
      searchQueryTypeObj,
      lookupConfig,
      rlsConfig,
      currentTenant,
      currentUserSettings,
    );
    console.log('Executing query...', JSON.stringify(query));

    let dbCollection = dbConnection.collection(collectionName);
    let result = await dbCollection
      .aggregate(JSON.parse(JSON.stringify(query)), {
        collation: { locale: 'en' },
        allowDiskUse: true,
      })
      .toArray();

    // Process results based on finder type
    result = processQueryResult(finder.finder, result, queryData);

    //It is used in item.service but not here, need to verify
    // result = processFieldsInclude(finder, result, currentUser);

    return { code: 200, message: 'success', result, count };
  } catch (error) {
    console.error('error :>> ', error);
    return { code: 400, message: error.message };
  }
};

//Duplicate of authenticateUser from
// export const processAuthentication = async (builderDB, dbConnection, projectId, headerToken) => {
//   if (!headerToken) return { code: 401, message: 'Authentication Failed. Please login.' };
//   const isValidToken = await verifyToken(headerToken);
//   if (
//     !isValidToken ||
//     Object.keys(isValidToken).length === 0 ||
//     !Object.keys(isValidToken).includes('sub')
//   ) {
//     return {
//       code: 403,
//       message: 'Authorization Failed. Please send valid token.',
//     };
//   }
//   const emailQuery = { email: { $regex: `^${isValidToken.sub}$`, $options: 'i' } };
//   const usernameQuery = { userName: { $regex: `^${isValidToken.sub}$`, $options: 'i' } };
//   const query = { $or: [emailQuery, usernameQuery] };

//   const userCollection = await userCollectionService(builderDB, projectId);
//   let { data } = await findItemById(
//     dbConnection,
//     builderDB,
//     projectId,
//     userCollection,
//     null,
//     query,
//   );
//   if (!data) return { code: 401, message: 'Authentication Failed. Please login.' };
//   return { code: 200, data };
// };

export const genericQuery = (value, fields) => {
  const { max = 100, offset } = value;
  if ('max' in value) {
    delete value.max;
  }
  if ('offset' in value) {
    delete value.offset;
  }
  if ('ids' in value) {
    delete value.ids;
  }
  let initialQuery = value;
  let filter = [{ $match: {} }];
  for (const property in initialQuery) {
    let [fieldName, condition] = property.split(':');
    let value = compareFieldsType({ fieldName, value: initialQuery[property], fields, condition });
    filter[0].$match[fieldName] = checkKey(condition, value);
  }
  filter.push({ $sort: { _id: -1 } });
  if (offset) {
    filter.push({ $skip: parseInt(offset) });
  }
  filter.push({ $limit: parseInt(max) });
  return filter;
};

const compareFieldsType = ({ fieldName, value, fields, condition }) => {
  let newValue = value;
  const selField = fields.find((_doc) => _doc.fieldName === fieldName);
  if (selField && selField.type === 'number') {
    newValue = +newValue;
  }

  if ([IN_LIST, NOT_IN_LIST].includes(condition) && newValue.includes(',')) {
    newValue = newValue.split(',');
    if (newValue.length) newValue = newValue.filter((val) => val);
  }
  return newValue;
};

const checkKey = (type, value) => {
  switch (type) {
    case IS_NOT_NULL:
      return { $ne: null };
    case IS_NULL:
      return null;
    case EQUALS:
      return { $regex: new RegExp(`^${value}$`, 'i') };
    case IN_LIST:
      if (!Array.isArray(value)) {
        value = [value];
      }
      return { $in: value };
    case NOT_IN_LIST:
      if (!Array.isArray(value)) {
        value = [value];
      }
      return { $nin: value };
    case LIKE:
      return { $regex: value, $options: 'i' };
    case LESS_THAN_EQUALS_TO:
      return { $lte: value };
    case GREATER_THAN_EQUALS_TO:
      return { $gte: value };
    case LESS_THAN:
      return { $lt: value };
    case GREATER_THAN:
      return { $gt: value };
  }
};

export const sendEmailService = async (req) => {
  const { builderDB, params, projectUrl } = req;
  let { sendTo, templateId } = params;
  let templateResponse = await findTemplate(builderDB, {
    uuid: templateId,
  });
  if (!templateResponse) throw { message: 'Template could not be found.' };
  if (!sendTo) throw { message: 'Please use a Valid email or uuid of the user' };
  if (!validateEmail(sendTo)) {
    if (validateUuidString(sendTo)) {
      const { field, error } = await getEmailFromItem(req, sendTo, userCollectionName);
      if (error) {
        throw { message: error };
      } else sendTo = field;
    } else throw { message: 'Please use a Valid email or uuid of the user' };
  }
  req.headers.origin = req.headers.origin ? req.headers.origin : `https://${projectUrl}`;
  req.body = { sendTo, previousActionResponse: {}, previousActionFormData: {} };
  return await sendEmailTemplateService(req);
};

export const dynamicEmailService = async (req) => {
  const { builderDB, params, projectUrl, body } = req;
  const { templateId, collectionItemId, sendToCollectionName } = params;
  //TODO: Ketan
  /**
   * Need to refactor this. We are fetching multi record
   * Case 1: multiple record with same field: Done
   * Case 2: multiple record with diff field: Pending
   * Case 3: single record with diff field: Pending
   */
  const { sendTo, emailCC, emailBCC, sendToField } = body;

  let templateResponse = await findTemplate(builderDB, {
    uuid: templateId,
  });
  if (!templateResponse) throw { message: 'Template could not be found.' };
  if (!sendTo || !sendTo.length) throw { message: 'Please use a Valid email or uuid of the user' };

  const { finalData: finalSendTo, errors: errSendTo } = await validateUserDetailsForEmail(
    req,
    sendTo,
    sendToCollectionName,
    sendToField,
  );
  const { finalData: finalCC, errors: errCC } = await validateUserDetailsForEmail(
    req,
    emailCC,
    sendToCollectionName,
    sendToField,
  );
  const { finalData: finalBCC, errors: errBCC } = await validateUserDetailsForEmail(
    req,
    emailBCC,
    sendToCollectionName,
    sendToField,
  );

  req.headers.origin = req.headers.origin ? req.headers.origin : `https://${projectUrl}`;
  let response = {};
  if (finalSendTo.length) {
    req.body = {
      sendTo: finalSendTo,
      cc: finalCC.length ? finalCC : [],
      bcc: finalBCC.length ? finalBCC : [],
      previousActionResponse: {},
      previousActionFormData: {},
      sessionStorageData: {},
      localStorageData: {},
      cookiesData: {},
      templatesRules: [{ templateId }],
      eventItemConfig: { dataItemId: collectionItemId },
    };
    response = await sendDynamicEmailService(req, true);
  }
  let error = [];
  if (errSendTo) error = [...error, ...errSendTo];
  if (errCC) error = [...error, ...errCC];
  if (errBCC) error = [...error, ...errBCC];
  return { ...response, error };
};

const validateUserDetailsForEmail = async (req, data, collectionName, sendToField) => {
  const finalData = [];
  const errors = [];
  if (data) {
    await Promise.all(
      data.map(async (sendTo) => {
        if (!validateEmail(sendTo)) {
          if (validateUuidString(sendTo)) {
            const { field, error } = await getEmailFromItem(
              req,
              sendTo,
              collectionName,
              sendToField,
            );
            if (error) {
              errors.push({ uuid: sendTo, message: error });
            } else {
              finalData.push(field);
            }
          } else {
            errors.push({ uuid: sendTo, message: 'Please use a Valid email or uuid of the user' });
          }
        } else {
          finalData.push(sendTo);
        }
      }),
    );
  }
  return { finalData, errors };
};

const getEmailFromItem = async (req, sendTo, collectionName, sendToField) => {
  const { builderDB, db, projectId } = req;
  let field = '';
  const collection = await findOneService(builderDB, {
    projectId,
    collectionName,
  });
  if (!collection) return { field, error: `${collectionName} Collection does not exist.` };
  const { data } = await findItemById(db, builderDB, projectId, collection, null, {
    uuid: sendTo,
  });
  if (!data || (data && !Object.keys(data).length))
    return { field, error: 'User does not exist with this id.' };
  let emailFieldName = sendToField ? sendToField : 'email';
  const emailFieldValue = data?.[emailFieldName];
  if (emailFieldValue) {
    field = emailFieldValue;
  } else {
    field = data?.['userName'];
  }
  if (field) {
    // if (validateEmail(field)) {
    return { field, error: '' };
    // } else return { field, error: 'User does not a Valid Email.' };
  } else return { field, error: 'Email or Username field does not exist.' };
};

export const findOneDevApisService = async (builderDB, query) => {
  const { url, projectId, method } = query;
  const regexPattern = `^${url.replace(/\/[^/]*$/, '')}/[^/]*$`;
  const regexUrl = { $regex: new RegExp(regexPattern) };

  let urlRes = await matchUrlResponse(regexUrl, projectId, builderDB);
  if (urlRes && urlRes.length > 0) {
    const result = checkMethodType(urlRes, method);
    return result;
  } else {
    return null;
  }
};
const matchUrlResponse = async (url, projectId, builderDB) => {
  const DevApis = builderDB.collection('devapis');
  const apisResult = await DevApis.find({
    projectId,
    url,
  }).toArray();
  return apisResult.length > 0 ? apisResult : null;
};
const checkMethodType = (urlRes, method) => {
  const result = urlRes ? urlRes.find((api) => api.method.split('_')[0] == method) : null;
  return result;
};

export const checkIpAddresses = (clientIp, ipAddresses) => {
  if (!ipAddresses || !ipAddresses.length) {
    return true;
  }
  if (typeof clientIp === 'string') {
    clientIp = clientIp.split(',').map((ip) => ip.trim());
  }
  return clientIp.find((ip) => ipAddresses.includes(ip));
};

export const bulkDeleteBuilder = async (db, collectionName, query) => {
  const dbCollection = await db.collection(collectionName);
  let result = await dbCollection.deleteMany(query);
  return result;
};

export const updateFileObjectById = async (
  body,
  db,
  enableAuditTrail,
  user,
  collectionName,
  itemUuid,
  fileObjectUuid,
  fieldName,
) => {
  try {
    if (itemUuid) {
      const query = { uuid: itemUuid };

      collectionName = collectionName.toString().toLowerCase();
      const dbCollection = await db.collection(collectionName);

      const fieldData = await findOneItemByQueryC(dbCollection, collectionName, query);
      if (fieldData) {
        const collItem = Object.assign({}, fieldData);
        let fileData = fieldData[fieldName];
        if (fileData) {
          const allowedUpdates = ['smallIcon', 'mediumIcon', 'largeIcon', 'originalName'];
          const invalidKeys = Object.keys(body).filter((key) => !allowedUpdates.includes(key));

          if (invalidKeys.length > 0) {
            return {
              code: 400,
              message: `Invalid properties: ${invalidKeys.join(
                ', ',
              )}. Only smallIcon, mediumIcon, largeIcon and originalName can be updated.`,
            };
          }

          let updatedFileData;
          if (Array.isArray(fileData)) {
            updatedFileData = fileData.map((file) =>
              file.uuid === fileObjectUuid ? { ...file, ...body } : file,
            );
          } else if (fileData.uuid === fileObjectUuid) {
            updatedFileData = { ...fileData, ...body };
          } else {
            return { code: 404, message: 'File object not found for the given UUID.' };
          }

          const updatedFieldData = {
            ...fieldData,
            [fieldName]: updatedFileData,
          };

          // FINAL: START:Audit Trail
          createAuditTrail(
            db,
            enableAuditTrail,
            'DEVELOPER_API',
            'update',
            user,
            collectionName,
            { [fieldName]: updatedFieldData },
            { [fieldName]: collItem[fieldName] },
          );
          // END:Audit Trail
          await dbCollection.updateOne(query, { $set: updatedFieldData });
          return { code: 200, message: 'File object updated successfully.' };
        } else {
          return { code: 404, message: 'File data not found for the given collection field.' };
        }
      } else {
        return { code: 404, message: 'Field data not found.' };
      }
    } else {
      return { code: 400, message: 'Item ID is required.' };
    }
  } catch (error) {
    console.error('Error while updating file object', error);
    return { code: 500, message: 'Internal server error.' };
  }
};

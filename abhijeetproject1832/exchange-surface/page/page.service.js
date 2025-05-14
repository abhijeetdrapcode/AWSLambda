import {
  fetchCollectionByName,
  fetchCollectionFilteredItemDataForPage,
  fetchCollectionItemDataForPage,
} from '../apiService/collection.service';
import { fetchExternalApi } from '../apiService/externalApi.service';
import { sendDataToExternalAPI } from '../apiService/externalApi.service';
import {
  addition,
  average,
  capitalize,
  count,
  dateDifference,
  divide,
  evaluateCurrency,
  evaluateCustomSentence,
  evaluateExpression,
  evaluateJSLogic,
  formatDate,
  getTimezoneOffset,
  htmlRegex,
  lowerCase,
  multiply,
  slugify,
  strJoin,
  substr,
  substraction,
  titleCase,
  trim,
  truncate,
  upperCase,
  markdownToHtml,
} from '../utils/util';
import _, { isEmpty, isNull } from 'lodash';
import {
  LESS_THAN_EQUALS_TO,
  GREATER_THAN,
  GREATER_THAN_EQUALS_TO,
  LESS_THAN,
  IS_NOT_NULL,
  IS_NULL,
  NOT_IN_LIST,
  IN_LIST,
  EQUALS,
  OptionTypeFields,
  BelongsToReferenceField,
} from 'drapcode-constant';
import jsdom from 'jsdom';
import flatpickr from 'flatpickr';
const { JSDOM } = jsdom;

export const getPageByUrl = async (builderDB, projectId, pageSlug) => {
  const query = pageSlug ? { projectId, slug: pageSlug } : { projectId, isDefaultPage: true };
  console.log('query', query);
  return await findOnePageByQuery(builderDB, query);
};

export const findOnePageByQuery = async (builderDB, query) => {
  let Page = builderDB.collection('pages');
  return await Page.findOne(query);
};

// JsDOM Add Project Env on Page
export const addProjectEnvOnPage = (req, pageContent) => {
  const { pEnvironment } = req;
  const envType = pEnvironment && pEnvironment.envType;
  const jsDom = new JSDOM(pageContent, { includeNodeLocations: true });
  const { window } = jsDom;
  const { document } = window;
  const timezoneElem = document.getElementById('project-timezone');
  if (timezoneElem) {
    timezoneElem.setAttribute('data-projectEnv', envType);
  }
  pageContent = jsDom.serialize();
  return pageContent;
};

// JsDOM elements handling of Page
export const jsDomPageContent = async (req, pageContent) => {
  const { pEnvironment } = req;
  let { user } = req;

  console.log('*************************');
  console.log('==> JSDOMing for a Page Starts...', user);
  console.log('*************************');

  const jsDom = new JSDOM(pageContent, { includeNodeLocations: true });
  const { window } = jsDom;
  const { document } = window;
  let visibilityElements = document.querySelectorAll('[data-vis-condition]');
  console.log('jsDomPageContent ~ visibilityElements.length:', visibilityElements.length);
  if (visibilityElements && visibilityElements.length) {
    let compVisibilityDataJson = {
      user,
      environment: pEnvironment,
    };

    visibilityElements.forEach((visibilityElem) => {
      processComponentVisibilityCondition(visibilityElem, compVisibilityDataJson);
    });
    pageContent = jsDom.serialize();
  }

  console.log('*************************');
  console.log('==> JSDOMing for a Page Ends...');
  console.log('*************************');

  return pageContent;
};

// JsDOM elements handling of Details Page
export const jsDomDetailPageContent = async (req, res, page, pageContent, s3Url) => {
  const { collectionFrom, collectionId, externalApiId } = page;
  const { originalUrl, pEnvironment } = req;
  let { user } = req;
  const envType = pEnvironment && pEnvironment.envType;
  let collectionItemId = '';

  const jsDom = new JSDOM(pageContent, { includeNodeLocations: true });
  const { window } = jsDom;
  const { document } = window;
  const timezoneElem = document.getElementById('project-timezone');
  if (timezoneElem) {
    timezoneElem.setAttribute('data-projectEnv', envType);
  }
  pageContent = jsDom.serialize();
  if (collectionId || externalApiId) {
    console.log('*************************');
    console.log('==> JSDOMing for Details Page Starts...');
    console.log('*************************');
    console.log(
      `Details Page Collection From: ${collectionFrom}, Collection Id: ${collectionId}, ExternalAPI Id: ${externalApiId}, User:`,
      user,
    );
    switch (collectionFrom) {
      case 'EXTERNAL_API':
        console.log('*************************');
        console.log('==> JSDOMing for External API Page...');
        console.log('*************************');
        // eslint-disable-next-line no-case-declarations
        const externalAPI = externalApiId ? await fetchExternalApi(req, res, externalApiId) : '';
        pageContent = await processForExternalApiPage(
          req,
          res,
          externalAPI,
          page,
          collectionItemId,
          originalUrl,
          collectionId,
          pageContent,
          user,
          s3Url,
        );
        break;
      case 'COLLECTION':
        console.log('*************************');
        console.log('==> JSDOMing for Collection Page...');
        console.log('*************************');
        pageContent = await processForCollectionPage(
          req,
          res,
          collectionFrom,
          originalUrl,
          collectionId,
          collectionItemId,
          pageContent,
          user,
          s3Url,
        );
        break;
      default:
        break;
    }
    console.log('*************************');
    console.log('==> JSDOMing for Details Page Ends...');
    console.log('*************************');
  }

  return pageContent;
};

// JsDOM elements clear visibility attribute
export const jsDomClearVisibilityAttr = (pageContent) => {
  console.log('*************************');
  console.log('==> JSDOMing to Clear Visibility Attribute Starts...');
  console.log('*************************');

  const jsDom = new JSDOM(pageContent, { includeNodeLocations: true });
  const { window } = jsDom;
  const { document } = window;
  let visibilityElements = document.querySelectorAll('[data-vis-condition]');
  console.log('jsDomClearVisibilityAttr ~ visibilityElements.length:', visibilityElements.length);

  if (visibilityElements && visibilityElements.length) {
    visibilityElements.forEach((visibilityElem) => {
      processComponentVisibilityAttr(visibilityElem);
    });
    pageContent = jsDom.serialize();
  }

  console.log('*************************');
  console.log('==> JSDOMing to Clear Visibility Attribute Ends...');
  console.log('*************************');

  return pageContent;
};

const doProcessForCollectionData = async (req, res, collectionItemId, collectionId, user) => {
  let result = {};
  if (collectionId && collectionItemId) {
    let collectionDataResponse = await fetchCollectionByName(req, res, collectionId);
    if (collectionItemId.includes('_')) {
      collectionItemId = collectionItemId.split('_')[1];
    }
    let itemData = {};
    if (collectionId !== 'reset-password') {
      let itemDataResponse = await fetchCollectionItemDataForPage(
        req,
        res,
        collectionId,
        collectionItemId,
        user,
      );
      itemData = itemDataResponse ? itemDataResponse : {};
    }
    result = {
      itemData,
      collectionId,
      collectionItemId,
      fields: collectionDataResponse ? collectionDataResponse.fields : '',
    };
  }
  return result;
};

const parseValueFromData = (data, fieldName) => {
  let value = '';
  if (fieldName.includes('functionType')) {
    fieldName = fieldName.replaceAll("'", '"');
    const parsedField = JSON.parse(`${fieldName}`);
    value = prepareFunction(parsedField, data);
    if (!value || value == 'undefined' || value === 'undefined') {
      value = '';
    }
    return value;
  } else {
    let valueIndex = '';
    let valueIndexFieldName = '';
    if (fieldName && fieldName.includes('.')) {
      let fullNameParts = fieldName.split('.');
      let prefix = '';
      let stack = data || {};
      for (let k = 0; k < fullNameParts.length; k++) {
        prefix = fullNameParts[k];
        if (stack && Array.isArray(stack)) {
          stack[prefix] = stack.map((item) => {
            if (item[prefix]) return item[prefix];
          });
        }
        if (stack && !stack[prefix]) {
          stack[prefix] = '';
        }
        stack = stack[prefix];
      }
      value = stack ? stack : '';
      if (Array.isArray(value)) {
        value = value.filter(() => true);
      }
    } else if (fieldName && fieldName.includes('[')) {
      //Todo: Need to Refactor
      let fullNameParts = fieldName.split('[');
      let prefix = '';
      let stack = data || {};
      for (let k = 0; k < fullNameParts.length - 1; k++) {
        const cValue = fullNameParts[k];
        const nValue = fullNameParts[k + 1];
        prefix = cValue ? (!cValue.includes(']') ? cValue : '') : '';
        valueIndex = nValue ? (nValue.includes(']') ? nValue.split(']')[0] : nValue) : '';

        if (stack && Array.isArray(stack)) {
          stack[prefix] = stack.map((item) => {
            if (item[prefix]) return item[prefix];
          });
        }
        if (stack && !stack[prefix]) {
          stack[prefix] = '';
        }
        stack = valueIndex ? stack[prefix][valueIndex] : stack[prefix];
        if (fieldName.includes(']:')) {
          valueIndexFieldName = nValue.split(']:')[1];
          if (valueIndexFieldName) {
            stack = stack[valueIndexFieldName];
          }
        }
      }
      value = stack ? stack : '';
      if (Array.isArray(value)) {
        value = value.filter(() => true);
      }
    } else {
      value = data ? data[fieldName] : '';
    }
    if (value && Array.isArray(value) && value.length === 1) return value[0];
    if (value && Array.isArray(value) && typeof value[0] === 'string') {
      return value.join(',');
    }
    if (!value || value == 'undefined' || value === 'undefined') {
      if (value === 0) {
        value = '0';
      } else {
        value = '';
      }
    }
    return value;
  }
};

const collectionFormDetailForUpdate = (form, item) => {
  const isDisableItemId = form && form.hasAttribute('disableitemid');
  if (!isDisableItemId) {
    form.method = 'put';
    form.setAttribute('action', form.getAttribute('action') + '/' + item.uuid);
  }
};

const replaceContentOfFileLinkElements = (s3Url, item, htmlElement, dataURLField = null) => {
  let fieldName;
  if (dataURLField) {
    fieldName = htmlElement.getAttribute(dataURLField);
  } else {
    fieldName = htmlElement.getAttribute('data-text-content');
  }
  const type = htmlElement.getAttribute('data-field-type');
  if (fieldName) {
    const value = parseValueFromData(item, fieldName);
    if (type === 'file') {
      let imageUrl = '';
      let fileName = '';
      let data = '';
      if (typeof value === 'object' && !Array.isArray(value)) {
        imageUrl = s3Url + value.key;
        fileName = value.originalName;
        if (value.isPrivate === true) {
          addDownloadAttributeForPrivateFiles(htmlElement, value, item.uuid);
        } else {
          htmlElement.href = imageUrl ? imageUrl : '';
        }
        htmlElement.innerText = fileName ? fileName : imageUrl;
      } else if (value && Array.isArray(value)) {
        data = value.map((record) => {
          const imageUrl = record && record.key ? s3Url + record.key : '';
          const fileName = record && record.originalName ? record.originalName : '';
          // eslint-disable-next-line no-undef
          const anchorLink = document.createElement('a');
          if (record.isPrivate === true) {
            addDownloadAttributeForPrivateFiles(anchorLink, record, item.uuid);
          } else {
            anchorLink.href = imageUrl;
          }
          anchorLink.innerText = fileName ? fileName : imageUrl;
          anchorLink.id = htmlElement.id;
          anchorLink.classList = htmlElement.classList;
          return anchorLink;
        });
        htmlElement.replaceWith(...data);
      }
      return;
    }
  }
};

const getIframeVideoUrlForYoutubeOrVimeo = (iframeSrc, data, videoType) => {
  if (videoType === 'youtube' || videoType === 'youtube-nocookie') {
    // eslint-disable-next-line no-useless-escape
    const videoId = data.match(/^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#\&\?]*).*/);
    const position = videoType === 'youtube' ? 30 : 39;
    return videoId && videoId[2]
      ? iframeSrc.slice(0, position) + videoId[2] + iframeSrc.slice(position)
      : '';
  }
  if (videoType === 'vimeo') {
    const videoId = data.match(
      // eslint-disable-next-line no-useless-escape
      /https?:\/\/(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/,
    );
    return videoId && videoId[3] ? iframeSrc.slice(0, 31) + videoId[3] + iframeSrc.slice(31) : '';
  }
};

const loadSnipcartItemData = (element, itemData, s3Url) => {
  const itemName = elementAttribute(element, 'data-item-name');
  const itemPrice = elementAttribute(element, 'data-item-price');
  const itemDescription = elementAttribute(element, 'data-item-description');
  const itemImageURL = elementAttribute(element, 'data-item-image');
  const collectionName = elementAttribute(element, 'data-collection-id');

  if (itemData[itemName]) {
    element.setAttribute('data-item-name', itemData[itemName]);
  }
  if (itemData[itemPrice]) {
    element.setAttribute('data-item-price', itemData[itemPrice]);
  }
  if (itemData[itemDescription]) {
    element.setAttribute('data-item-description', itemData[itemDescription]);
  }
  if (itemData[itemImageURL]) {
    if (typeof itemData[itemImageURL] === 'object') {
      const imgSrcURL =
        itemData[itemImageURL].isPrivate === true
          ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
          : s3Url + itemData[itemImageURL].key;
      element.setAttribute('data-item-image', imgSrcURL);
      if (itemData[itemImageURL].isPrivate === true) {
        addDownloadAttributeForPrivateFiles(element, itemData[itemImageURL], itemData.uuid);
      }
    } else {
      element.setAttribute('data-item-image', itemData[itemImageURL]);
    }
  }
  if (itemData['uuid'] && itemData[itemPrice]) {
    element.setAttribute(
      'data-item-url',
      `${collectionName}/${itemData['uuid']}/${itemData[itemPrice]}/validate-product.json`,
    );
  }
};

const addDynamicDataIntoFormElements = (document, req, itemData = null) => {
  let allForms = document.querySelectorAll('form');
  let forms = allForms ? allForms : '';
  const collectionKey = 'data-form-element-collection';
  let { dateFormat: projectDateFormat } = req;
  projectDateFormat = projectDateFormat || 'YYYY-MM-DD';
  forms.forEach((form) => {
    const collectionFormElements = form.querySelectorAll(`[${collectionKey}]`);
    collectionFormElements.forEach((collectionElement) => {
      let fieldName = collectionElement.getAttribute(collectionKey);
      //Override Field name based on Response Mapping for Non-Persistent Data
      let fieldValue = itemData && fieldName ? parseValueFromData(itemData, fieldName) : '';
      if (!fieldValue && collectionElement.type === 'number') {
        fieldValue = '0';
      }
      if (fieldValue && fieldValue !== 'undefined') {
        insertFormElementValue(fieldValue, collectionElement, projectDateFormat);
      }
    });
  });
};

const insertFormElementValue = (data, element, projectDateFormat) => {
  if (isCheckbox(element)) {
    if (data && !['boolean', 'object'].includes(typeof data) && data.includes(',')) {
      const dataArr = data.split(',');
      if (dataArr && dataArr.includes(element.value)) {
        element.setAttribute('checked', true);
      }
    } else if (data && element.value === data) {
      element.setAttribute('checked', true);
    }
  } else if (isRadio(element)) {
    if (data && element.value === data) {
      element.setAttribute('checked', true);
    }
  } else if (element.type === 'file') {
    let fileDisplay = element.parentElement.getElementsByClassName('file-list-display')[0];
    if (data && typeof data === 'object') {
      fileDisplay.innerHTML = data.originalName;
    }
    if (data && Array.isArray(data)) {
      const fileNameList = data.map((file) => {
        return file.originalName ? file.originalName : '';
      });
      fileDisplay.innerHTML = fileNameList.join(',');
    }
    const hiddenElement = element.parentElement.querySelector(
      `input[name="${element.name}"][type='hidden']`,
    );
    hiddenElement.setAttribute('value', typeof data === 'object' ? JSON.stringify(data) : '');
  } else if (['date', 'datetime-local'].includes(element.type)) {
    const showTime = element.type === 'datetime-local';
    const datenTime = getDateTimeFormat(projectDateFormat, showTime);
    const placeholder = element.placeholder;
    element.setAttribute('autocomplete', 'off');
    element.setAttribute(
      'placeholder',
      showTime ? `${placeholder} (YYYY-MM-DD HH:MM)` : `${placeholder}  ${projectDateFormat}`,
    );
    element.setAttribute('flat-picker-date-type', showTime ? 'datetime-local' : 'date');
    element.setAttribute('isprocessed', true);
    element.setAttribute('value', data ? flatpickr.formatDate(new Date(data), datenTime) : '');
  } else if (element.tagName === 'SELECT') {
    //TODO: For future
    console.log('This is for Select type');
  } else if (element.tagName === 'TEXTAREA' && element.hasAttribute('data-show-editor')) {
    element.setAttribute('value', data ? data : '');
  } else if (element.type === 'tel') {
    element.setAttribute('value', data ? data : '');
  } else if (element.type === 'slug') {
    element.setAttribute('value', data ? data : '');
  } else {
    if (!data || data == 'undefined' || data === 'undefined') {
      data = data === 0 ? '0' : '';
    }
    element.setAttribute('value', data);
  }
};

const getDateTimeFormat = (dateFormat, showTime) => {
  if (showTime) return 'Y-m-d H:i';
  switch (dateFormat) {
    case 'MM/DD/YY':
      return 'm/d/y';
    case 'MM-DD-YY':
      return 'm-d-y';
    case 'MM/DD/YYYY':
      return 'm/d/Y';
    case 'MM-DD-YYYY':
      return 'm-d-Y';
    case 'DD-MM-YY':
      return 'd-m-y';
    case 'DD/MM/YY':
      return 'd/m/y';
    case 'DD-MM-YYYY':
      return 'd-m-Y';
    case 'DD/MM/YYYY':
      return 'd/m/Y';
    case 'YYYY-MM-DD':
      return 'Y-m-d';
    case 'YYYY/MM/DD':
      return 'Y/m/d';
    case 'YYYY-DD-MM':
      return 'Y-d-m';
    case 'YYYY/DD/MM':
      return 'Y/d/m';
    default:
      return 'Y-m-d';
  }
};

const isCheckbox = (element) => element.type === 'checkbox';
const isRadio = (element) => element.type === 'radio';

const elementAttribute = (element, key) => {
  return element.getAttribute(key);
};

const processForCollectionPage = async (
  req,
  res,
  collectionFrom,
  originalUrl,
  collectionId,
  collectionItemId,
  pageContent,
  user,
  s3Url,
) => {
  if (collectionFrom && collectionFrom === 'COLLECTION' && originalUrl.includes(collectionId)) {
    collectionItemId = extractItemIdFromURL(originalUrl, collectionItemId);

    if (collectionItemId) {
      const result = await doProcessForCollectionData(
        req,
        res,
        collectionItemId,
        collectionId,
        user,
      );
      const { itemData } = result ? result : '';
      const itemHasTenantIds = itemData?.tenantId?.length > 0;
      if (itemHasTenantIds && !user?.isSuperAdmin) {
        const userHasTenantIds = user?.tenantId?.length > 0;

        const userIsNotAuthorized = !user?.tenantId
          .map((userTenant) => userTenant.uuid)
          .includes(itemData.tenantId[0].uuid);

        if (!userHasTenantIds || userIsNotAuthorized) {
          return 'You are not authorized to view this data!';
        }
      }

      pageContent = await jsDomUpdatePageContent(
        req,
        res,
        itemData,
        pageContent,
        collectionId,
        collectionItemId,
        user,
        s3Url,
      );
    }
  }
  return pageContent;
};

const extractItemIdFromURL = (originalUrl, collectionItemId) => {
  const urlArray = originalUrl.split('/');
  // const urlCollectionId = urlArray[urlArray.length - 2];
  collectionItemId = urlArray[urlArray.length - 1];
  return collectionItemId;
};

const doProcessExternalAPIResponseData = async (
  req,
  res,
  pageExternalApiData,
  collectionItemId,
  collectionId,
) => {
  let response = {};
  let itemData = {};
  let result = {};
  const {
    itemPath,
    uniqueKey,
    id: externalApiId,
    responseMapping,
  } = pageExternalApiData ? pageExternalApiData : '';
  let body = { data: pageExternalApiData, externalApiId };
  try {
    response = await sendDataToExternalAPI(req, res, body);
    if (response && (response.status === 200 || response.status == 'success')) {
      if (response.data) {
        const isItemPathExist = _.has(response.data, itemPath);
        const responseData = isItemPathExist ? response.data[itemPath] : response.data;
        if (responseData && !Array.isArray(responseData)) {
          let responseDataArr = [];
          responseDataArr.push(responseData);

          itemData =
            responseDataArr && responseDataArr.length
              ? responseDataArr.find((responseData) => responseData[uniqueKey] == collectionItemId)
              : {};

          //Fallback check #1
          if (typeof itemData === 'undefined') {
            //Handling response in case of JSON Objects
            const isNested = Object.keys(responseData).some(function (key) {
              return responseData[key] && typeof responseData[key] === 'object';
            });

            if (isNested) {
              responseDataArr = Object.keys(responseData).map((key) => {
                return responseData[key] ? responseData[key] : '';
              });

              itemData =
                responseDataArr && responseDataArr.length
                  ? responseDataArr.find(
                      (responseData) => responseData[uniqueKey] == collectionItemId,
                    )
                  : {};
            }
          }
          //Fallback check #2
          if (typeof itemData === 'undefined') {
            itemData = responseDataArr && responseDataArr.length ? responseData : {};
            console.log('==> itemData #2 :>> ', itemData);
          }
        } else {
          itemData =
            responseData && responseData.length
              ? responseData.find((responseData) => responseData[uniqueKey] == collectionItemId)
              : {};
        }
      }
      if (itemData) {
        let collectionDataResponse = await fetchCollectionByName(req, res, collectionId);
        const newItemData = buildItemData(itemData, responseMapping, collectionItemId, uniqueKey);
        result = {
          itemData: newItemData,
          collectionId,
          collectionItemId,
          fields: collectionDataResponse ? collectionDataResponse.fields : '',
        };
      }
    }
  } catch (error) {
    console.log('==> jsDomDetailPageContent doProcessExternalAPIResponseData error :>> ', error);
  }
  return result;
};

const buildItemData = (itemData, responseMapping, collectionItemId, uniqueKey) => {
  let newItemData = {};
  let responseMappingTranspose = [];

  responseMapping &&
    Object.keys(responseMapping).map((obj) => {
      const key = obj;
      const value = responseMapping[obj];
      if (value && typeof value === 'object') {
        if (responseMappingTranspose[key]) {
          responseMappingTranspose[key].push(value);
        } else {
          responseMappingTranspose[key] = value;
        }
      } else {
        if (responseMappingTranspose[value]) {
          responseMappingTranspose[value].push(key);
        } else {
          responseMappingTranspose[value] = [key];
        }
      }
    });

  if (responseMappingTranspose) {
    if (itemData) {
      Object.keys(itemData).map((itemKey) => {
        if (responseMappingTranspose[itemKey]) {
          let transposedData = responseMappingTranspose[itemKey];
          if (transposedData && transposedData.length > 1) {
            transposedData.map((transposedDataKey) => {
              newItemData[transposedDataKey] = itemData[itemKey];
            });
          } else {
            if (
              transposedData &&
              typeof transposedData === 'object' &&
              !Array.isArray(transposedData)
            ) {
              const { dataSourceField, refCollectionField } = transposedData || {};

              if (dataSourceField) {
                const itemDatasourceFieldObjKey = `${itemKey}.${dataSourceField}`;
                const isDatasourceFieldPropExist = _.has(itemData, itemDatasourceFieldObjKey);
                const itemRefCollectionFieldObjKey = `${itemKey}.${refCollectionField}`;
                const isRefCollectionPropExist = _.has(itemData, itemRefCollectionFieldObjKey);
                if (isDatasourceFieldPropExist) {
                  const itemKeyValue = itemData[itemKey];
                  newItemData[itemKey] = itemKeyValue;
                  const itemDatasourcePropKeyValue = _.get(itemData, itemDatasourceFieldObjKey);
                  if (!isRefCollectionPropExist) {
                    itemKeyValue[refCollectionField] = itemDatasourcePropKeyValue;
                    newItemData[itemKey] = itemKeyValue;
                  }
                } else {
                  newItemData[itemKey] = '';
                }
              } else {
                newItemData[transposedData[0]] = itemData[itemKey];
              }
            } else {
              newItemData[transposedData[0]] = itemData[itemKey];
            }
          }
        }
      });
      //Handling Reference Fields in Non-Persistent Data
      Object.keys(responseMappingTranspose)
        .filter((responseMapKey) => responseMapKey.includes('.') || responseMapKey.includes('['))
        .map((responseMapKey) => {
          let transposedRefData = responseMappingTranspose[responseMapKey];
          if (transposedRefData && transposedRefData.length > 1) {
            transposedRefData.map((transposedRefDataKey) => {
              let value = _.get(itemData, responseMapKey);
              newItemData[transposedRefDataKey] = value;
            });
          } else {
            let value = _.get(itemData, responseMapKey);
            newItemData[transposedRefData[0]] = value;
          }
        });
    }
  } else {
    newItemData = itemData;
  }

  if (!newItemData['uuid']) {
    newItemData['uuid'] =
      // eslint-disable-next-line no-prototype-builtins
      uniqueKey && itemData && itemData.hasOwnProperty(uniqueKey)
        ? itemData[uniqueKey]
        : collectionItemId;
  }
  if (!newItemData['_data_source_rest_api_primary_id']) {
    newItemData['_data_source_rest_api_primary_id'] =
      // eslint-disable-next-line no-prototype-builtins
      uniqueKey && itemData && itemData.hasOwnProperty(uniqueKey)
        ? itemData[uniqueKey]
        : collectionItemId;
  }
  if (!newItemData['isNonPersistentCollection']) {
    newItemData['isNonPersistentCollection'] = true;
  }
  if (!newItemData['nonPersistentCollectionResponseMapping']) {
    newItemData['nonPersistentCollectionResponseMapping'] = responseMapping;
  }

  return newItemData;
};

const processForExternalApiPage = async (
  req,
  res,
  externalAPI,
  page,
  collectionItemId,
  originalUrl,
  collectionId,
  pageContent,
  user,
  s3Url,
) => {
  let pageExternalApiData = {};

  if (externalAPI) {
    collectionItemId = processPageExternalApiData(
      page,
      externalAPI,
      pageExternalApiData,
      collectionItemId,
      originalUrl,
      collectionId,
    );
    const result = await doProcessExternalAPIResponseData(
      req,
      res,
      pageExternalApiData,
      collectionItemId,
      collectionId,
    );
    const { itemData } = result ? result : '';
    pageContent = await jsDomUpdatePageContent(
      req,
      res,
      itemData,
      pageContent,
      collectionId,
      collectionItemId,
      user,
      s3Url,
    );
  }
  return pageContent;
};

const loadDynamicFilterDataIntoElements = async (req, res, document, itemData) => {
  let filterElements = document.querySelectorAll('[data-filter-collection]');
  for (const element of filterElements) {
    const filterId = element.getAttribute('data-filter-id');
    const collection = element.getAttribute('data-filter-collection');
    const response = await fetchCollectionFilteredItemDataForPage(
      req,
      res,
      collection,
      filterId,
      element,
      itemData,
    );
    if (response && response.status === 200) {
      const filterResult = response.data;
      if (filterResult) {
        if (typeof filterResult !== 'object') {
          element.textContent = filterResult;
          element.style.display = 'block';
        }
      }
    }
  }
};

const searchQueryFromURL = (req, document) => {
  const searchQuery = req._parsedOriginalUrl.search;
  if (searchQuery && searchQuery.length > 0) {
    const searchParams = new URLSearchParams(searchQuery);
    let genericSearchFormElements = document.querySelectorAll('[data-gjs=page-search-form]');
    if (genericSearchFormElements) {
      genericSearchFormElements.forEach((element) => {
        for (let searchObj of searchParams.keys()) {
          const searchElement = element.querySelector('[name=' + searchObj + ']');
          if (searchElement) {
            searchElement.value = searchParams.get(searchObj);
          }
        }
      });
    }
  }
};

const processPageExternalApiData = (
  page,
  externalAPI,
  pageExternalApiData,
  collectionItemId,
  originalUrl,
  collectionId,
) => {
  let externalApiUniqueKey = '';
  let externalApiItemPath = '';
  let externalApiDataFrom = '';
  let externalApiResponseMapping = '';
  let externalApiRequestMapping = '';
  let externalApiId = page.externalApiId;
  const { responseDataMapping, bodyDataFrom, collectionMapping } = externalAPI;
  if (bodyDataFrom && bodyDataFrom === 'NON_PERSISTENT_COLLECTION') {
    externalApiDataFrom = bodyDataFrom;
  }
  const { selectedMapping } = responseDataMapping ? responseDataMapping : '';
  if (selectedMapping) {
    const uniqueItemKey = selectedMapping['_data_source_rest_api_primary_id']
      ? selectedMapping['_data_source_rest_api_primary_id']
      : 'id';
    if (uniqueItemKey) {
      externalApiUniqueKey = uniqueItemKey;
    }
    externalApiResponseMapping = selectedMapping;
  }
  const { itemsPath } = responseDataMapping ? responseDataMapping : '';
  if (itemsPath) {
    externalApiItemPath = itemsPath;
  }

  if (collectionMapping) {
    externalApiRequestMapping = collectionMapping;
  }
  pageExternalApiData['id'] = externalApiId;
  pageExternalApiData['uniqueKey'] = externalApiUniqueKey;
  pageExternalApiData['itemPath'] = externalApiItemPath;
  pageExternalApiData['dataFrom'] = externalApiDataFrom;
  pageExternalApiData['responseMapping'] = externalApiResponseMapping;
  pageExternalApiData['requestMapping'] = externalApiRequestMapping;

  collectionItemId = extractItemIdFromURL(originalUrl, collectionItemId);

  //Passing Item Id in External API URL
  if (collectionItemId && externalApiDataFrom === 'NON_PERSISTENT_COLLECTION') {
    pageExternalApiData['externalApiItem'] = {
      id: collectionItemId,
      uniqueKey: externalApiUniqueKey,
      _data_source_rest_api_primary_id: collectionItemId,
      nonPersistentCollectionItemId: collectionItemId,
      pageCollectionName: collectionId,
    };

    if (externalApiRequestMapping && externalApiRequestMapping.length > 0) {
      externalApiRequestMapping.forEach((reqMap) => {
        if (reqMap.value == 'uuid') {
          pageExternalApiData['externalApiItem'][reqMap.key] = collectionItemId;
        }
      });
    }
  }
  return collectionItemId;
};

const jsDomUpdatePageContent = async (
  req,
  res,
  itemData,
  pageContent,
  collectionId,
  collectionItemId,
  user,
  s3Url,
) => {
  if (itemData) {
    const jsDom = new JSDOM(pageContent, { includeNodeLocations: true });
    const { window } = jsDom;
    const { document } = window;

    let scriptText = `
    console.log('==> Going to set __ssr_dp_ keys in session storage...');
      Object.keys(window.sessionStorage).map(sessionKey => {
        if(sessionKey.startsWith('__ssr_dp_')) {
        window.sessionStorage.removeItem(sessionKey);
        }
      })
      window.sessionStorage.setItem('${`__ssr_dp_colItem_${collectionId}_${collectionItemId}`}', '${JSON.stringify(
      itemData,
    )}')
    window.sessionStorage.setItem('__ssr_dp_colId', '${collectionId}')
    window.sessionStorage.setItem('__ssr_dp_colItemId', '${collectionItemId}')
    `;
    let script = document.createElement('script');
    script.type = 'text/javascript';
    const inlineCode = document.createTextNode(scriptText);
    script.appendChild(inlineCode);
    let head = document.getElementsByTagName('head')[0];
    head.appendChild(script);

    let visibilityElements = document.querySelectorAll('[data-vis-condition]');

    if (visibilityElements && visibilityElements.length) {
      let compVisibilityDataJson = {
        user,
        itemData,
      };

      visibilityElements.forEach((visibilityElem) => {
        processComponentVisibilityCondition(visibilityElem, compVisibilityDataJson);
      });
    }

    searchQueryFromURL(req, document);
    await loadDynamicFilterDataIntoElements(req, res, document, itemData);
    const dataField = `data-${collectionId}`;
    const dataURLField = `data-url-${collectionId}`;
    const dataImageTag = `data-img-src-${collectionId}`;
    const dataVideoTag = `data-video-src-${collectionId}`;
    const dataAudioTag = `data-audio-src-${collectionId}`;

    let hyperLinks = document.querySelectorAll('[data-path-collection-name]');
    let imageElements = document.querySelectorAll(`[${dataImageTag}]`);
    let videoElements = document.querySelectorAll(`[${dataVideoTag}]`);
    let audioElements = document.querySelectorAll(`[${dataAudioTag}]`);
    let textContentElements = document.querySelectorAll(`[${dataField}], [data-filter-id]`);
    let urlContentElements = document.querySelectorAll(`[${dataURLField}]`);
    let allPageButtonsAndLinks = document.querySelectorAll('a, button');

    if (
      (textContentElements || imageElements || hyperLinks || urlContentElements || videoElements) &&
      collectionId &&
      collectionItemId
    ) {
      textContentElements.forEach((textElement) => {
        let fieldName = textElement.getAttribute(dataField);

        let type = textElement.getAttribute('type');
        if (!fieldName) {
          textElement.style.display = 'block';
        } else {
          if (fieldName.includes('"') && 'functionType' in JSON.parse(fieldName)) {
            textElement.textContent = getDerivedFieldData(fieldName, itemData, req);
          } else {
            if (BelongsToReferenceField.includes(type)) {
              const { nestedFieldName } = JSON.parse(textElement.getAttribute('metaData'));
              if (!fieldName.includes('.')) {
                fieldName = fieldName + '.' + nestedFieldName;
              }
            }
            const fieldType = textElement.getAttribute('data-field-type');
            //Override Field name based on Response Mapping for Non-Persistent Data
            console.log('==> TEXT itemData :>> ', itemData);
            console.log('==> TEXT fieldName :>> ', fieldName);
            // fieldName = checkAndOverrideFieldForNonPersistentCollection(itemData, fieldName);

            const value = parseValueFromData(itemData, fieldName) || '';
            if (htmlRegex.test(value)) {
              textElement.innerHTML = value;
            } else if (fieldType === 'boolean') {
              textElement.textContent = value ? 'Yes' : 'No';
            } else {
              textElement.textContent = value ? value : value === 0 ? 0 : '';
            }
          }
          textElement.style.display = 'block';
        }
      });

      hyperLinks.forEach((element) => {
        const fieldName = element.getAttribute('data-path-field-name');
        if (fieldName && !element.getAttribute('data-path-collection-item-id-from')) {
          if (
            !(
              element.hasAttribute('data-gjs') &&
              element.getAttribute('data-gjs') === 'data-table-link'
            )
          ) {
            const href = element.getAttribute('href');
            let fieldHref = fieldName ? parseValueFromData(itemData, fieldName) : '';

            if (fieldHref && typeof fieldHref === 'string' && fieldHref.includes(',')) {
              fieldHref = fieldHref.split(', ');
              fieldHref = fieldHref[0];
            }

            const replaceHref = href.replace(fieldName, fieldHref);
            element.setAttribute('href', replaceHref);
          }
        }
      });

      urlContentElements.forEach((element) => {
        const fieldType = element.getAttribute('data-field-type');
        if (fieldType === 'file') {
          replaceContentOfFileLinkElements(s3Url, itemData, element, dataURLField);
        } else {
          const fieldName = element.getAttribute(dataURLField);
          const href = element.getAttribute(dataURLField);
          const replaceHref = href.replace(fieldName, parseValueFromData(itemData, fieldName));
          element.setAttribute('href', replaceHref);
        }
      });

      imageElements.forEach((imageElement) => {
        const fieldName = imageElement.getAttribute(dataImageTag);
        const previewIcon = elementAttribute(imageElement, 'data-preview-icon');
        let itemImageData = fieldName ? parseValueFromData(itemData, fieldName) : '';
        if (Array.isArray(itemImageData)) {
          itemImageData = itemImageData[0];
        }
        let imageSrcUrl;
        if (itemImageData) {
          if (typeof itemImageData === 'object') {
            const imageKey = itemImageData.key;
            imageSrcUrl = previewIcon
              ? itemImageData[previewIcon]
              : itemImageData.isExternalUrl
              ? itemImageData.url
              : itemImageData.isPrivate === true
              ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
              : imageKey
              ? `${s3Url}${imageKey}`
              : imageSrcUrl;

            if (itemImageData.isPrivate === true) {
              addDownloadAttributeForPrivateFiles(imageElement, itemImageData, itemData.uuid);
            }
          } else if (typeof itemImageData === 'string' && itemImageData.startsWith('http')) {
            imageSrcUrl = itemImageData;
          }
          imageElement.src = imageSrcUrl;
        }
      });

      videoElements.forEach((videoElement) => {
        const fieldName = videoElement.getAttribute(dataVideoTag);
        const videoType = videoElement.getAttribute('data-video-type');
        let itemVideoData = fieldName ? parseValueFromData(itemData, fieldName) : '';
        if (itemVideoData && ['youtube-nocookie', 'youtube', 'vimeo'].includes(videoType)) {
          const iframeVideoSrc = videoElement.getAttribute('src');
          videoElement.src = iframeVideoSrc
            ? getIframeVideoUrlForYoutubeOrVimeo(iframeVideoSrc, itemVideoData, videoType)
            : '';
        } else if (itemVideoData) {
          videoElement.src = itemVideoData;
        } else {
          videoElement.src = '';
        }
      });

      audioElements.forEach((audioElement) => {
        const fieldName = audioElement.getAttribute(dataAudioTag);
        const audioType = audioElement.getAttribute('data-audio-type');
        const isAutoplay = audioElement.hasAttribute('autoplay')
          ? audioElement.getAttribute('autoplay')
          : false;
        const itemAudioData = fieldName ? parseValueFromData(itemData, fieldName) : '';

        if (itemAudioData) {
          if (audioType === 'file') {
            audioElement.src =
              itemAudioData.isPrivate === true
                ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-audio.png`
                : `${s3Url}${itemAudioData.key}`;

            if (itemAudioData.isPrivate === true) {
              addDownloadAttributeForPrivateFiles(audioElement, itemAudioData, itemData.uuid);
            }
          } else {
            audioElement.src = itemAudioData;
          }
          if (isAutoplay) {
            audioElement.autoplay = true;
            audioElement.play();
          }
        } else {
          audioElement.src = '';
        }
      });

      allPageButtonsAndLinks.forEach((element) => {
        const isParentIsCMS = element.closest(
          '[data-js="data-table"], [data-js="data-group"], [data-js="child-data-group"], [data-js="data-list"],[data-js="search-form"], [data-js="child-data-group-file"] ',
        );
        if (
          element?.tagName === 'A' &&
          element.getAttribute('data-path-collection-item-id-from') === 'pageCollection'
        ) {
          const fieldName = element.getAttribute('data-path-field-name');
          if (fieldName) {
            if (
              !(
                element.hasAttribute('data-gjs') &&
                element.getAttribute('data-gjs') === 'data-table-link'
              )
            ) {
              const href = element.getAttribute('href');
              let fieldHref = fieldName ? parseValueFromData(itemData, fieldName) : '';

              if (fieldHref && typeof fieldHref === 'string' && fieldHref.includes(',')) {
                fieldHref = fieldHref.split(', ');
                fieldHref = fieldHref[0];
              }

              const replaceHref = href.replace(fieldName, fieldHref);
              element.setAttribute('href', replaceHref);
            }
          }
        }
        if (!isParentIsCMS) {
          element.setAttribute('data-item-id', itemData['uuid']);
          element.setAttribute('data-collection-id', collectionId);

          const snipCartElem = document.getElementById('snipcart');
          const isSnipCartActive = typeof snipCartElem != 'undefined' && snipCartElem != null;
          if (isSnipCartActive && element.classList.contains('snipcart-add-item')) {
            loadSnipcartItemData(element, itemData, s3Url);
          }
        }
      });
    }

    loadLoggednInUserDataIntoElements(window, user, req, s3Url);
    loadLoggednInUserTenantDataIntoElements(window, user, req, s3Url);
    loadLoggedInUserSettingsDataIntoElements(window, user, req, s3Url);

    const allForms = document.querySelectorAll('[data-form-collection=' + collectionId + ']');
    let forms = allForms ? allForms : '';
    forms &&
      forms.forEach((formEl) => {
        collectionFormDetailForUpdate(formEl, itemData);
      });
    addDynamicDataIntoFormElements(document, req, itemData);
    pageContent = jsDom.serialize();
  }
  return pageContent;
};

const loadLoggednInUserDataIntoElements = (window, user, req, s3Url) => {
  const { document } = window;
  let sessionAttributes = document.querySelectorAll('[data-session]');

  if (sessionAttributes) {
    if (user && user !== 'undefined') {
      const loggedInUser = user;
      sessionAttributes.forEach((element) => {
        const fieldName = element.getAttribute('data-session');
        loadDataIntoElements(element, fieldName, loggedInUser, req, s3Url);
      });
    }
  }
};

const loadLoggednInUserTenantDataIntoElements = (window, user, req, s3Url) => {
  const { document } = window;
  let sessionAttributes = document.querySelectorAll('[data-session-tenant]');

  if (sessionAttributes) {
    console.log('loadLoggednInUserTenantDataIntoElements ~ user:', user);
    if (user && user !== 'undefined' && user.tenantId && user.tenantId.length) {
      const loggedInUserTenants = user.tenantId;
      const loggedInUserTenant =
        loggedInUserTenants && loggedInUserTenants.length > 0 ? loggedInUserTenants[0] : '';
      console.log(
        'loadLoggednInUserTenantDataIntoElements ~ loggedInUserTenant:',
        loggedInUserTenant,
      );
      sessionAttributes.forEach((element) => {
        const fieldName = element.getAttribute('data-session-tenant');
        loadDataIntoElements(element, fieldName, loggedInUserTenant, req, s3Url);
      });
    }
  }
};

const loadLoggedInUserSettingsDataIntoElements = (window, user, req, s3Url) => {
  const { document } = window;
  let sessionAttributes = document.querySelectorAll('[data-session-user-settings]');
  if (sessionAttributes) {
    console.log('loadLoggedInUserSettingsDataIntoElements ~ user:', user);
    if (user && user !== 'undefined' && user.userSettingId && user.userSettingId.length) {
      const loggedInUserSettings = user.userSettingId;
      const loggedInUserSetting =
        loggedInUserSettings && loggedInUserSettings.length > 0 ? loggedInUserSettings[0] : '';
      console.log(
        'loadLoggedInUserSettingsDataIntoElements ~ loggedInUserSetting:',
        loggedInUserSetting,
      );
      sessionAttributes.forEach((element) => {
        const fieldName = element.getAttribute('data-session-user-settings');
        loadDataIntoElements(element, fieldName, loggedInUserSetting, req, s3Url);
      });
    }
  }
};

const loadDataIntoElements = (element, fieldName, data, req, s3Url) => {
  const fieldType = element.getAttribute('data-field-type');
  const previewIcon = elementAttribute(element, 'data-preview-icon');
  //TODO:need more reliable way to fix this
  if ((fieldType && fieldType === 'file') || element?.tagName === 'IMG') {
    let itemImageData = fieldName ? parseValueFromData(data, fieldName) : '';
    if (Array.isArray(itemImageData)) {
      itemImageData = itemImageData[0];
    }
    let imageSrcUrl;
    if (itemImageData) {
      if (typeof itemImageData === 'object') {
        const imageKey = itemImageData.key;
        if (imageKey)
          imageSrcUrl = previewIcon
            ? itemImageData[previewIcon]
            : itemImageData.isPrivate === true
            ? `https://drapcode-static.s3.amazonaws.com/img/placeholder-img.png`
            : s3Url + imageKey;
      } else if (typeof itemImageData === 'string' && itemImageData.startsWith('http')) {
        imageSrcUrl = itemImageData;
      }
      element.src = imageSrcUrl;
      if (itemImageData.isPrivate === true) {
        addDownloadAttributeForPrivateFiles(element, itemImageData, data.uuid);
      }
    }
  } else if (
    element?.tagName === 'A' &&
    element.getAttribute('data-path-collection-item-id-from') === 'session'
  ) {
    //TODO: Check if it can be handled with JsDom
    // if (element.id) {
    //   const elementWithHrefWithItemValue = renderLinkColumnData(
    //     window,
    //     loggedInUserTenant,
    //     element,
    //   );
    //   document.getElementById(element.id).replaceWith(elementWithHrefWithItemValue);
    // }
  } else {
    //TODO: this style is temporary solution to show hidden element which we hide on proejct build->
    //default text does not appear on page load
    element.style.display = 'block';
    if (fieldName.includes('"') && 'functionType' in JSON.parse(fieldName)) {
      element.textContent = getDerivedFieldData(fieldName, data, req);
    } else {
      element.textContent = data ? parseValueFromData(data, fieldName) : '';
    }
  }
};

const getDerivedFieldData = (derivedFieldData, item, user, req) => {
  const functionDef = JSON.parse(derivedFieldData);
  const { parentFieldName } = functionDef;
  let textContent = '';
  if (parentFieldName) {
    textContent =
      item[parentFieldName] &&
      item[parentFieldName]
        .map((innerItem) => {
          return prepareFunction(functionDef, innerItem, user, req);
        })
        .join(', ');
  } else {
    textContent = prepareFunction(functionDef, item, user, req);
  }
  return textContent;
};

const prepareFunction = (functionDef, field, user, req) => {
  let formatType,
    restToLower,
    whitespace,
    noSplitopt,
    type,
    length,
    endopt,
    startString,
    endString,
    separator,
    unixType,
    expression,
    currency,
    maxFraction,
    position = '';
  let startLength = 0;
  let endLength = 0;
  let args = [];
  const SPACE_KEYWORD_REGEX = /#SPACE#/g; //Handling Spaces in Date Format
  let loggedInUserData = user ? user : {};
  functionDef.args.forEach((element) => {
    const { name, key } = element;
    const excludes = [
      'formatType',
      'restToLower',
      'whitespace',
      'type',
      'noSplitopt',
      'length',
      'endopt',
      'startLength',
      'endLength',
      'startString',
      'endString',
      'separator',
      'expression',
      'unixType',
      'currency',
      'maxFraction',
      'position',
    ];

    if (name === 'formatType') {
      formatType = key;
    } else if (name === 'restToLower') {
      restToLower = key;
    } else if (name === 'whitespace') {
      whitespace = key;
    } else if (name === 'type') {
      type = key;
    } else if (name === 'noSplitopt') {
      noSplitopt = key;
    } else if (name === 'length') {
      length = key;
    } else if (name === 'endopt') {
      endopt = key;
    } else if (name === 'startLength') {
      startLength = key;
    } else if (name === 'endLength') {
      endLength = key;
    } else if (name === 'startString') {
      startString = key;
    } else if (name === 'endString') {
      endString = key;
    } else if (name === 'separator') {
      separator = key;
    } else if (name === 'expression') {
      expression = key;
    } else if (name === 'unixType') {
      unixType = key;
    } else if (name === 'currency') {
      currency = key;
    } else if (name === 'position') {
      position = key;
    } else if (name === 'maxFraction') {
      maxFraction = key;
    }
    let innerArgs = [];
    if (!excludes.includes(name)) {
      if (Array.isArray(key)) {
        key.forEach((k) => {
          innerArgs.push(field[k]);
        });
        args.push(innerArgs);
      } else if (key === 'CURRENT_DATE_TIME') {
        args.push(key);
      } else {
        args.push(field[key]);
      }
    }
  });
  const timezone = req ? getTimezoneOffset(req.timezone) : 0;
  switch (functionDef.functionType) {
    case 'CAPITALIZE':
      return capitalize(args[0], restToLower);
    case 'LOWER_CASE':
      return lowerCase(args[0]);
    case 'UPPER_CASE':
      return upperCase(args[0]);
    case 'SLUGIFY':
      return slugify(args[0]);
    case 'TRIM':
      return trim(args[0], whitespace, type);
    case 'TITLE_CASE':
      return titleCase(args[0], noSplitopt);
    case 'TRUNCATE':
      return truncate(args[0], length, endopt);
    case 'SUB_STRING':
      return substr(args[0], startLength, endLength);
    case 'STRING_JOIN':
      return strJoin(args[0], separator, startString, endString);
    case 'CUSTOM_SENTENCE':
      return evaluateCustomSentence(expression, field, loggedInUserData);
    case 'ADDITION':
      return addition(formatType, { numbers: args[0] });
    case 'AVERAGE':
      return average(formatType, { numbers: args[0] });
    case 'MULTIPLY':
      return multiply(formatType, { numbers: args[0] });
    case 'DIVIDE':
      return divide(formatType, { number1: args[0], number2: args[1] });
    case 'CUSTOM_CALCULATION':
      return evaluateExpression(expression, field, loggedInUserData, formatType);
    case 'CUSTOM_JS_LOGIC':
    case 'CUSTOM_JAVASCRIPT_LOGIC':
      return evaluateJSLogic(expression, field, loggedInUserData);
    case 'SUBSTRACTION':
      return substraction(formatType, { numbers1: args[0], numbers2: args[1] });
    case 'COUNT':
      return count(args[0]);
    case 'FORMAT_DATE':
      return formatDate(formatType.replace(SPACE_KEYWORD_REGEX, ' '), args[0], timezone, unixType);
    case 'DATE_DIFFERENCE':
      return dateDifference(formatType, args[0], args[1], timezone);
    case 'CURRENCY_FORMAT':
      return evaluateCurrency(formatType, args[0], currency, position, maxFraction);
    case 'MARKDOWN_TO_HTML':
      return markdownToHtml(args[0]);
    default:
      return '';
  }
};

export const processComponentVisibilityConditionExp = (
  visConditionJson,
  compVisExpression,
  itemData,
) => {
  const visWhenCollectionField = visConditionJson['visWhenCollectionField'];
  const visWhenCollectionFieldType = visConditionJson['visWhenCollectionFieldType'];
  const visWhenCondition = visConditionJson['visWhenCondition'];
  const visWhenCollectionFieldValue = visConditionJson['visWhenCollectionFieldValue'];
  const visWhenCollectionFieldFixedValue = visConditionJson['visWhenCollectionFieldFixedValue'];

  if (visWhenCondition) {
    if (itemData && Object.keys(itemData).length) {
      processVisWhenConditionForItem(
        itemData,
        visWhenCondition,
        visWhenCollectionField,
        visWhenCollectionFieldFixedValue,
        visWhenCollectionFieldValue,
        visWhenCollectionFieldType,
        compVisExpression,
      );
    }
  }
};

function processVisWhenConditionForItem(
  itemData,
  visWhenCondition,
  visWhenCollectionField,
  visWhenCollectionFieldFixedValue,
  visWhenCollectionFieldValue,
  visWhenCollectionFieldType,
  compVisExpression,
) {
  let result = false;
  const isStaticOrDynamicOptionField =
    visWhenCollectionFieldType && OptionTypeFields.includes(visWhenCollectionFieldType);
  const isNumberField = visWhenCollectionFieldType && visWhenCollectionFieldType === 'number';
  const leftSideValue = itemData[visWhenCollectionField];
  let rightSideValue = '';

  switch (visWhenCollectionFieldType) {
    case 'number':
      rightSideValue = Number(
        visWhenCollectionFieldFixedValue
          ? visWhenCollectionFieldFixedValue
          : visWhenCollectionFieldValue || 0,
      );
      break;
    default:
      rightSideValue = visWhenCollectionFieldFixedValue
        ? visWhenCollectionFieldFixedValue
        : visWhenCollectionFieldValue || '';
      break;
  }
  console.log('🚀 ~ file: page.service.js:1461 ~ LHS:', leftSideValue, ' ~ RHS:', rightSideValue);

  switch (visWhenCondition) {
    case EQUALS:
      if (isStaticOrDynamicOptionField && leftSideValue && Array.isArray(leftSideValue)) {
        result = leftSideValue.includes(rightSideValue);
      } else {
        result = leftSideValue && leftSideValue === rightSideValue;
      }
      result = Boolean(result);
      break;
    case 'NOT_EQUALS':
      if (isStaticOrDynamicOptionField && leftSideValue && Array.isArray(leftSideValue)) {
        result = !leftSideValue.includes(rightSideValue);
      } else {
        result = leftSideValue && leftSideValue !== rightSideValue;
      }
      result = Boolean(result);
      break;
    case IN_LIST:
      if (isStaticOrDynamicOptionField && leftSideValue && Array.isArray(leftSideValue)) {
        result = leftSideValue.includes(rightSideValue);
      }
      result = Boolean(result);
      break;
    case NOT_IN_LIST:
      if (isStaticOrDynamicOptionField && leftSideValue && Array.isArray(leftSideValue)) {
        result = !leftSideValue.includes(rightSideValue);
      }
      result = Boolean(result);
      break;
    case IS_NULL:
      if (itemData && Object.keys(itemData).length) {
        // eslint-disable-next-line no-prototype-builtins
        if (itemData.hasOwnProperty(visWhenCollectionField)) {
          if (Array.isArray(leftSideValue)) {
            result = leftSideValue.length === 0;
          } else {
            result =
              typeof leftSideValue === 'undefined' ||
              isNull(leftSideValue) ||
              isEmpty(leftSideValue);
          }
        } else {
          result =
            typeof leftSideValue === 'undefined' || isNull(leftSideValue) || isEmpty(leftSideValue);
        }
      }
      result = Boolean(result);
      break;
    case IS_NOT_NULL:
      if (itemData && Object.keys(itemData).length) {
        // eslint-disable-next-line no-prototype-builtins
        if (itemData.hasOwnProperty(visWhenCollectionField)) {
          if (Array.isArray(leftSideValue)) {
            result = leftSideValue.length > 0;
          } else {
            result = !(
              typeof leftSideValue === 'undefined' ||
              isNull(leftSideValue) ||
              isEmpty(leftSideValue)
            );
          }
        }
      }
      result = Boolean(result);
      break;
    case LESS_THAN:
      result =
        !isStaticOrDynamicOptionField &&
        isNumberField &&
        leftSideValue &&
        leftSideValue < rightSideValue;
      result = Boolean(result);
      break;
    case GREATER_THAN:
      result =
        !isStaticOrDynamicOptionField &&
        isNumberField &&
        leftSideValue &&
        leftSideValue > rightSideValue;
      result = Boolean(result);
      break;
    case LESS_THAN_EQUALS_TO:
      result =
        !isStaticOrDynamicOptionField &&
        isNumberField &&
        leftSideValue &&
        leftSideValue <= rightSideValue;
      result = Boolean(result);
      break;
    case GREATER_THAN_EQUALS_TO:
      result =
        !isStaticOrDynamicOptionField &&
        isNumberField &&
        leftSideValue &&
        leftSideValue >= rightSideValue;
      result = Boolean(result);
      break;
    default:
      break;
  }
  compVisExpression.push(result);
}

function processComponentVisibilityCondition(visibilityElem, compVisibilityDataJson) {
  const { user, environment, itemData } = compVisibilityDataJson || '';
  const { tenant, userSettingId } = user || '';
  const userSetting = userSettingId && userSettingId.length > 0 ? userSettingId[0] : '';
  const visConditionJson = parseVisibilityCondition(visibilityElem);
  console.log('visibilityElements.forEach ~ visConditionJson:', visConditionJson);
  const visThenCondition = visConditionJson['visThenCondition'];
  const visWhenUserStatus = visConditionJson['visWhenUserStatus'];
  const visWhenCollectionFrom = visConditionJson['visWhenCollectionFrom'];
  const visWhenCollection = visConditionJson['visWhenCollection'];
  const visEnvHide = visConditionJson['visEnvHide'];
  const visThenAddClass = visConditionJson['visThenAddClass'];
  const visThenRemoveClass = visConditionJson['visThenRemoveClass'];
  let componentVisibility = visThenCondition;
  let shouldRenderVisibility = true;
  let compVisExpression = [];

  if (visEnvHide && visEnvHide.length && environment) {
    if (visEnvHide.includes(environment.envType)) {
      componentVisibility = 'HIDE';
      compVisExpression.push(true);
    }
  } else {
    if (visWhenUserStatus) {
      switch (visWhenUserStatus) {
        case 'LOGGED_IN':
          if (!user) {
            compVisExpression.push(false);
          } else {
            compVisExpression.push(true);
          }
          break;
        case 'NOT_LOGGED_IN':
          if (user) {
            compVisExpression.push(false);
          } else {
            compVisExpression.push(true);
          }
          break;
        default:
          break;
      }
    }

    if (visWhenCollectionFrom && visWhenCollection) {
      switch (visWhenCollectionFrom) {
        case 'CURRENT_LOGGEDIN_USER':
          processComponentVisibilityConditionExp(visConditionJson, compVisExpression, user);
          break;
        case 'CURRENT_LOGGEDIN_TENANT':
          processComponentVisibilityConditionExp(visConditionJson, compVisExpression, tenant);
          break;
        case 'PAGE_COLLECTION':
          processComponentVisibilityConditionExp(visConditionJson, compVisExpression, itemData);
          break;
        case 'CURRENT_LOGGEDIN_USER_SETTINGS':
          processComponentVisibilityConditionExp(visConditionJson, compVisExpression, userSetting);
          break;
        default:
          break;
      }
    }
  }

  if (compVisExpression && compVisExpression.length) {
    if (compVisExpression.includes(false)) {
      shouldRenderVisibility = false;
    }
  } else {
    shouldRenderVisibility = false;
  }

  if (shouldRenderVisibility || componentVisibility === 'SHOW') {
    renderComponentVisibility(
      componentVisibility,
      visibilityElem,
      shouldRenderVisibility,
      visWhenCollectionFrom,
      user,
      itemData,
      tenant,
      userSetting,
      visThenAddClass,
      visThenRemoveClass,
    );
  }
}

function renderComponentVisibility(
  componentVisibility,
  visibilityElem,
  shouldRenderVisibility,
  visWhenCollectionFrom,
  user,
  itemData,
  tenant,
  userSetting,
  visThenAddClass,
  visThenRemoveClass,
) {
  console.log(
    '🚀 ~ file: page.service.js:1754 ~ componentVisibility:',
    componentVisibility,
    'visWhenCollectionFrom:',
    visWhenCollectionFrom,
    'visThenAddClass:',
    visThenAddClass,
    'visThenRemoveClass:',
    visThenRemoveClass,
  );
  switch (componentVisibility) {
    case 'SHOW':
      switch (visWhenCollectionFrom) {
        case 'CURRENT_LOGGEDIN_USER':
          if (user && Object.keys(user).length) {
            showOrRemoveVisibilityElem(shouldRenderVisibility, visibilityElem);
          } else {
            visibilityElem.removeAttribute('data-vis-condition');
            visibilityElem.remove();
          }
          break;
        case 'CURRENT_LOGGEDIN_TENANT':
          if (tenant && Object.keys(tenant).length) {
            showOrRemoveVisibilityElem(shouldRenderVisibility, visibilityElem);
          } else {
            visibilityElem.removeAttribute('data-vis-condition');
            visibilityElem.remove();
          }
          break;
        case 'CURRENT_LOGGEDIN_USER_SETTINGS':
          if (userSetting && Object.keys(userSetting).length) {
            showOrRemoveVisibilityElem(shouldRenderVisibility, visibilityElem);
          } else {
            visibilityElem.removeAttribute('data-vis-condition');
            visibilityElem.remove();
          }
          break;
        case 'PAGE_COLLECTION':
          if (itemData && Object.keys(itemData).length) {
            showOrRemoveVisibilityElem(shouldRenderVisibility, visibilityElem);
          }
          break;
        case 'PARENT_CMS_COMPONENT':
          break;
        default:
          showOrRemoveVisibilityElem(
            shouldRenderVisibility,
            visibilityElem,
            visThenAddClass,
            visThenRemoveClass,
          );
          break;
      }
      break;
    case 'HIDE':
    case 'DONT_SHOW':
      handleClassChanges(visibilityElem, visThenAddClass, visThenRemoveClass);
      visibilityElem.removeAttribute('data-vis-condition');
      visibilityElem.remove();
      break;
    case 'DISABLED':
    case 'SHOW_DISABLED':
      visibilityElem.classList.add('disabled');
      visibilityElem.setAttribute('disabled', true);
      console.log('🚀 ~ file: page.service.js:1831 ~ visThenAddClass:', visThenAddClass);
      handleClassChanges(visibilityElem, visThenAddClass, visThenRemoveClass);
      visibilityElem.removeAttribute('data-vis-condition');
      break;
    case 'READ_ONLY':
    case 'SHOW_READ_ONLY':
      visibilityElem.setAttribute('readonly', true);
      handleClassChanges(visibilityElem, visThenAddClass, visThenRemoveClass);
      visibilityElem.removeAttribute('data-vis-condition');
      break;
    default:
      handleClassChanges(visibilityElem, visThenAddClass, visThenRemoveClass);
      break;
  }
}

function showOrRemoveVisibilityElem(
  shouldRenderVisibility,
  visibilityElem,
  visThenAddClass,
  visThenRemoveClass,
) {
  console.log(
    '🚀 ~ file: page.service.js:1828 ~ showOrRemoveVisibilityElem ~ shouldRenderVisibility:',
    shouldRenderVisibility,
    'visThenAddClass:',
    visThenAddClass,
    'visThenRemoveClass:',
    visThenRemoveClass,
  );
  if (shouldRenderVisibility) {
    visibilityElem.classList.remove('d-none');
    visibilityElem.classList.remove('hide');
    visibilityElem.classList.remove('hidden');
    visibilityElem.classList.add('d-block');
    let elementStyleDisplayValue = visibilityElem.style.display;
    visibilityElem.style.display =
      elementStyleDisplayValue && elementStyleDisplayValue !== 'none'
        ? elementStyleDisplayValue
        : 'block';
    visibilityElem.style.visibility = 'visible';
    handleClassChanges(visibilityElem, visThenAddClass, visThenRemoveClass);
    visibilityElem.removeAttribute('data-vis-condition');
  } else {
    visibilityElem.removeAttribute('data-vis-condition');
    visibilityElem.remove();
  }
}

function processComponentVisibilityAttr(visibilityElem) {
  const visConditionJson = parseVisibilityCondition(visibilityElem);
  console.log('processComponentVisibilityAttr ~ visConditionJson:', visConditionJson);
  const visThenCondition = visConditionJson['visThenCondition'];
  const visWhenUserStatus = visConditionJson['visWhenUserStatus'];
  const visWhenCollectionFrom = visConditionJson['visWhenCollectionFrom'];
  const visWhenCollection = visConditionJson['visWhenCollection'];
  const visEnvHide = visConditionJson['visEnvHide'];

  if (visWhenCollectionFrom && visWhenCollection) {
    if (
      [
        'CURRENT_LOGGEDIN_USER',
        'CURRENT_LOGGEDIN_TENANT',
        'PAGE_COLLECTION',
        'CURRENT_LOGGEDIN_USER_SETTINGS',
      ].includes(visWhenCollectionFrom) &&
      visibilityElem.hasAttribute('data-vis-condition')
    ) {
      visibilityElem.removeAttribute('data-vis-condition');
    }
  } else if (
    ((visEnvHide && visEnvHide.length) || visWhenUserStatus) &&
    visibilityElem.hasAttribute('data-vis-condition')
  ) {
    visibilityElem.removeAttribute('data-vis-condition');
  } else if (
    visConditionJson &&
    Object.keys(visConditionJson).length === 1 &&
    visThenCondition &&
    visibilityElem.hasAttribute('data-vis-condition')
  ) {
    visibilityElem.removeAttribute('data-vis-condition');
  }
}

function parseVisibilityCondition(element) {
  let conditionString = element.getAttribute('data-vis-condition');
  conditionString = conditionString ? conditionString.replaceAll("'", '"') : '';
  return conditionString ? JSON.parse(conditionString) : '';
}

function handleClassChanges(element, classToAdd, classToRemove) {
  // Handle adding classes
  if (classToAdd) {
    const classesToAdd = classToAdd
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    element.classList.add(...classesToAdd);
  }

  // Handle removing classes
  if (classToRemove) {
    const classesToRemove = classToRemove
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    classesToRemove.forEach((className) => {
      if (element.classList.contains(className)) {
        element.classList.remove(className);
      }
    });
  }
}

const addDownloadAttributeForPrivateFiles = (element, itemImageData, itemUuid) => {
  const { uuid, collectionName, collectionField = '', originalName } = itemImageData;
  element.setAttribute(
    'onclick',
    `fetchFile("${itemUuid}","${uuid}","${collectionName}","${collectionField}","${originalName}")`,
  );
};

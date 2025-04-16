// Todo: Can be moved to common modules
import { mergeObjects } from 'external-api-util';
import { getDataTransferObject } from '../external-api/external-api.service';

export const transformDataToMapping = (
  data,
  mapping,
  collection,
  user = {},
  tenant = {},
  userSetting = {},
  sessionValue = {},
  sessionFormValue = {},
  environment = {},
  projectConstants = {},
  browserStorageData = {},
  refArrayFormat = false,
) => {
  const { collectionFields, collectionDerivedFields, collectionConstants } = collection;
  const currentUserDerivedFields = {};
  const finalData = [];
  let commonObj = {
    formData: {},
    collectionFields,
    collectionConstants,
    collectionDerivedFields,
    environment,
    projectConstants,
  };
  const { localStorageData: localStorageValue, cookiesData: cookiesValue } =
    browserStorageData || {};
  data.forEach((item) => {
    const customJsonDataObj = {
      collectionItemId: item?.uuid ? item.uuid : '',
      dataToSendToExternalApi: item,
      ...commonObj,
    };
    const dataTransferObject = getDataTransferObject(
      { headers: mapping, url: '', params: [] },
      item,
      customJsonDataObj,
      user,
      tenant,
      userSetting,
      currentUserDerivedFields,
      browserStorageData,
    );
    let mappedData = mergeObjects(
      mapping,
      item,
      user,
      tenant,
      userSetting,
      sessionValue,
      environment.constants,
      sessionFormValue,
      dataTransferObject,
      localStorageValue,
      cookiesValue,
    );
    mappedData = convertRefStrToArr(item, mappedData, mapping, refArrayFormat);
    finalData.push(mappedData);
  });
  return finalData;
};
const convertRefStrToArr = (item, mappedData, mapping, refArrayFormat) => {
  let finalData = {};
  let referenceFieldsKeys = [];
  let referenceItemFieldKeys = [];
  mapping.forEach((obj) => {
    if (obj.value.includes('RF::')) {
      if (!obj.value.includes('.')) {
        referenceFieldsKeys.push(obj.key);
      } else if (refArrayFormat) {
        referenceItemFieldKeys.push(obj.key);
      }
    }
  });
  Object.keys(mappedData).forEach((key) => {
    let value = mappedData[key];
    if (referenceFieldsKeys.length && referenceFieldsKeys.includes(key)) {
      finalData[key] = item[key];
    } else if (referenceItemFieldKeys.length && referenceItemFieldKeys.includes(key)) {
      finalData[key] = value && value.includes(', ') ? value.split(', ') : [value];
    } else finalData[key] = value;
  });
  return finalData;
};

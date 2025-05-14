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
    const mappedData = mergeObjects(
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
    finalData.push(mappedData);
  });
  return finalData;
};

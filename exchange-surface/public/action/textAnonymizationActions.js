const nlpAnonymization = async (args) => {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ nlpAnonymization ~ actionEnabled:', actionEnabled);
  if (actionEnabled) {
    // Force promise to support Safari browser & fix Unhandled Promise Rejection on IOS device browsers
    new Promise(function (resolve, reject) {
      resolve(args);
    });
    const { parameters } = args;
    const previousResponse = args.response;
    let response = {};
    let previousActionResponse = sessionStorage.getItem('previousActionResponse');
    const parsedJson = previousActionResponse ? JSON.parse(previousActionResponse) : {};
    let itemId = args.targetElement.getAttribute('data-item-id');
    if (
      typeof itemId === 'undefined' ||
      ['', 'undefined', 'null', undefined, null].includes(itemId)
    )
      itemId = '';
    if (!itemId && previousResponse) {
      const { collectionSaveOrUpdateResponse } = previousResponse;
      if (collectionSaveOrUpdateResponse) {
        const { data: collectionItemData } = collectionSaveOrUpdateResponse;
        itemId = collectionItemData.uuid;
      }
    }
    const dynamicKey = Object.keys(parsedJson)[0];
    if (!itemId && dynamicKey) {
      const { [dynamicKey]: collectionValue } = parsedJson;
      itemId = collectionValue.uuid;
    }
    const { collection, fieldForSourceText, fieldForAnonymizedText, successMessage, errorMessage } =
      parameters;
    try {
      const endpoint = `open/collection-form/${collection}/items/${itemId}/nlp_anonymization/${fieldForSourceText}/${fieldForAnonymizedText}`;
      const result = await unSecuredPostCall({}, endpoint);
      if (result.status === 200)
        toastr.success(successMessage || 'NLP anonymization successful.', 'Success');
      response.data = { ...previousResponse, ...result };
      response.data.collectionSaveOrUpdateResponse = result;
      response.data.nlpAnonymization = result;
      response.status = 'success';
      await handleTextAnonymizationActivityTracker(response.data.data);
    } catch (error) {
      if (error.response) {
        response.data = error.response;
        response.status = 'error';
        toastr.error(errorMessage || 'NLP anonymization Failed', 'Error');
      }
    }
    return response;
  } else {
    return disabledActionResponse(args);
  }
};

const customTermsAnonymization = async (args) => {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ customTermsAnonymization ~ actionEnabled:', actionEnabled);
  if (actionEnabled) {
    // Force promise to support Safari browser & fix Unhandled Promise Rejection on IOS device browsers
    new Promise(function (resolve, reject) {
      resolve(args);
    });
    const { parameters } = args;
    const previousResponse = args.response;
    let response = {};
    let previousActionResponse = sessionStorage.getItem('previousActionResponse');
    const parsedJson = previousActionResponse ? JSON.parse(previousActionResponse) : {};
    let itemId = args.targetElement.getAttribute('data-item-id');
    if (
      typeof itemId === 'undefined' ||
      ['', 'undefined', 'null', undefined, null].includes(itemId)
    )
      itemId = '';
    if (!itemId && previousResponse) {
      const { collectionSaveOrUpdateResponse } = previousResponse;
      if (collectionSaveOrUpdateResponse) {
        const { data: collectionItemData } = collectionSaveOrUpdateResponse;
        itemId = collectionItemData.uuid;
      }
    }
    const dynamicKey = Object.keys(parsedJson)[0];
    if (!itemId && dynamicKey) {
      const { [dynamicKey]: collectionValue } = parsedJson;
      itemId = collectionValue.uuid;
    }
    const {
      collection,
      fieldForSourceText,
      fieldForCustomTerms,
      fieldForAnonymizedText,
      successMessage,
      errorMessage,
    } = parameters;
    try {
      const endpoint = `open/collection-form/${collection}/items/${itemId}/custom_terms_anonymization/${fieldForSourceText}/${fieldForCustomTerms}/${fieldForAnonymizedText}`;
      const result = await unSecuredPostCall({}, endpoint);
      if (result.status === 200)
        toastr.success(successMessage || 'Custom terms anonymization successful.', 'Success');
      response.data = { ...previousResponse, ...result };
      response.data.collectionSaveOrUpdateResponse = result;
      response.data.customTermsAnonymization = result;
      response.status = 'success';
      await handleTextAnonymizationActivityTracker(response.data.data);
    } catch (error) {
      if (error.response) {
        response.data = error.response;
        response.status = 'error';
        toastr.error(errorMessage || 'Custom terms anonymization Failed', 'Error');
      }
    }
    return response;
  } else {
    return disabledActionResponse(args);
  }
};

const handleTextAnonymizationActivityTracker = async (responseData) => {
  try {
    const { createdBy, uuid, termDetails } = responseData;
    const textAnonymizationPlugin = await fetchInstalledPluginByCode(
      'TEXT_ANONYMIZATION_ACTIVITY_TRACKER',
    );
    if (!(textAnonymizationPlugin && termDetails)) {
      return;
    }
    await termDetails.forEach(async (termDetail) => {
      let { original, replaced, context } = termDetail;
      const itemData = {
        itemId: uuid,
        originalTerm: original,
        replacedTerm: replaced,
        context,
        anonymizedBy: createdBy,
      };
      const urlEndpoint = 'open/collection-form/text_anonymization_activity/items';
      await unSecuredPostCall(itemData, urlEndpoint);
    });
  } catch (error) {
    console.error('An error occurred while handling the activity tracker:', error);
  }
};

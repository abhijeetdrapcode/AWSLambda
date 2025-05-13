const anyFileToText = async (args) => {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ anyFileToText ~ actionEnabled:', actionEnabled);
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
    const { collection, fieldForPdf, fieldForText, successMessage, errorMessage } = parameters;
    try {
      const endpoint = `open/collection-form/${collection}/items/${itemId}/anyfile-to-text/${fieldForPdf}/${fieldForText}`;
      const result = await unSecuredPostCall({}, endpoint);
      if (result.status === 'success')
        toastr.success(successMessage || 'Set Text in Field', 'Success');
      response.data = { ...previousResponse, ...result };
      response.data.collectionSaveOrUpdateResponse = result;
      response.data.pdfTotext = result;
      response.status = 'success';
    } catch (error) {
      if (error.response) {
        response.data = error.response;
        response.status = 'error';
        toastr.error(errorMessage || `Cannot Set Pdf's text now., Error `);
      }
    }
    return response;
  } else {
    return disabledActionResponse(args);
  }
};

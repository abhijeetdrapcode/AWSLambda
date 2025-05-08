const initiateDocusign = async (args) => {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ initiateDocusign ~ actionEnabled:', actionEnabled);
  if (actionEnabled) {
    const { parameters } = args;
    const {
      successRedirectUrl = '',
      errorRedirectUrl = '',
      successMessage = '',
      errorMessage = '',
    } = parameters;
    let obj = {
      successRedirectUrl,
      errorRedirectUrl,
      successMessage,
      errorMessage,
    };
    let endpoint = `/auth/docusign`;
    obj = JSON.stringify(obj);
    const params = btoa(obj);
    endpoint = `${endpoint}/?params=${params}`;
    window.open(endpoint, '_self');
  } else {
    return disabledActionResponse(args);
  }
};

const sendForEsign = async function (args) {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ sendForEsign ~ actionEnabled:', actionEnabled);
  if (actionEnabled) {
    const { parameters, targetElement } = args;
    let itemId = targetElement ? targetElement.getAttribute('data-item-id') : '';
    let propagateItemId = '';
    const previousResponse = args.response;
    if (!itemId && previousResponse) {
      const { collectionSaveOrUpdateResponse } = previousResponse;
      if (collectionSaveOrUpdateResponse) {
        const { data: collectionItemData } = collectionSaveOrUpdateResponse;
        itemId = collectionItemData.uuid;
      }
    }
    let previousActionResponse = sessionStorage.getItem('previousActionResponse');
    previousActionResponse = previousActionResponse ? JSON.parse(previousActionResponse) : {};
    if (previousActionResponse) {
      let collectionKey = `parentCollectionToPropagate`;
      if (previousActionResponse[collectionKey]) {
        let collectionName = previousActionResponse[collectionKey].name;
        let collectionItemId = previousActionResponse[collectionKey].uuid;
        propagateItemId = collectionItemId;
      }
    }
    let previousActionFormData = sessionStorage.getItem('previousActionFormData');
    previousActionFormData = previousActionFormData ? JSON.parse(previousActionFormData) : {};
    // Get Browser Storage Data Object
    const browserData = getBrowserData();
    const formData = {
      itemId: itemId,
      propagateItemId,
      templatesRules: parameters.templatesRules,
      previousActionResponse,
      previousActionFormData,
      ...browserData,
    };
    let response = {};
    let result = {};
    if (parameters) {
      try {
        const endpoint = 'docusign/send-for-esign/';
        result = await unSecuredPostCall(formData, endpoint);
        const resultFlag = result?.data?.[0]?.status;
        if (resultFlag === 'success') {
          toastr.success(`Mail sent successfully.`, 'Success!');
        } else if (resultFlag === 'failure') {
          toastr.error('Failed to sent email', 'Error');
        }
        response.data = { ...previousResponse, ...result };
        response.status = 'success';
        await handleDocusignActivityTracker(response.data.data);
      } catch (error) {
        console.log('%c==> Error :>> ', 'color:yellow', error);
        if (error.response) {
          response.data = error.response;
          response.status = 'error';
        }
      }
    }
    return response;
  } else {
    return disabledActionResponse(args);
  }
};

const handleDocusignActivityTracker = async (responseData) => {
  try {
    const {
      bccTo = [],
      ccTo = [],
      sendTo = [],
      agreementTemplateBody = '',
      emailSubject = '',
      envelopeStatus = '',
      sender = '',
      envelopeId = '',
    } = responseData[0];
    const contentLength = agreementTemplateBody?.length?.toString();
    const docusignPlugin = await fetchInstalledPluginByCode('DOCUSIGN');
    if (docusignPlugin) {
      const itemData = {
        senderId: sender.uuid,
        sender: sender.userName,
        receiver: sendTo.join(' '),
        bcc: bccTo.join(' '),
        cc: ccTo.join(' '),
        subject: emailSubject,
        status: envelopeStatus,
        envelopeId: envelopeId,
        contentLength: contentLength,
      };
      const urlEndpoint = 'open/collection-form/docusign_activity_tracker/items';
      await unSecuredPostCall(itemData, urlEndpoint);
    }
  } catch (error) {
    console.error('An error occurred while handling the activity tracker:', error);
  }
};

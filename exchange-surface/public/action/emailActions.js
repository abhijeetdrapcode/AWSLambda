const sendEmail = async function (args) {
  const { element, parameters } = args;
  const { sendTo, emailTemplate } = parameters;
  console.log('sendTo: ', sendTo, 'Email Template: ', emailTemplate);
  let toEmailAddress = element.elements[sendTo].value;
  const previousActionResponse = args.response;
  const emailTemplateData = previousActionResponse ? previousActionResponse.data : {};
  toEmailAddress = previousActionResponse ? previousActionResponse.data[sendTo] : toEmailAddress;
  let previousActionRes = sessionStorage.getItem('previousActionResponse');
  previousActionRes = previousActionRes ? JSON.parse(previousActionRes) : {};
  let previousActionFormData = sessionStorage.getItem('previousActionFormData');
  previousActionFormData = previousActionFormData ? JSON.parse(previousActionFormData) : {};
  // Get Browser Storage Data Object
  const browserData = getBrowserData();
  const formData = {
    sendTo: toEmailAddress,
    templateData: emailTemplateData,
    previousActionResponse: previousActionRes,
    previousActionFormData,
    ...browserData,
  };
  if (toEmailAddress && emailTemplate) {
    const endpoint = 'email/send/' + emailTemplate;
    const response = await publicPostCall(formData, endpoint);
    return response;
  } else {
    console.log('Please provide email address and email template');
  }
  return null;
};

const sendDynamicEmail = async function (args) {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ sendDynamicEmail ~ actionEnabled:', actionEnabled);
  if (actionEnabled) {
    // Force promise to support Safari browser & fix Unhandled Promise Rejection on IOS device browsers
    new Promise(function (resolve, reject) {
      resolve(args);
    });
    const { parameters, targetElement } = args;
    const eventItemConfig = { dataItemId: '', previousStepId: '', propagateItemId: '' };
    let itemId = targetElement ? targetElement.getAttribute('data-item-id') : '';
    eventItemConfig['dataItemId'] = itemId || '';
    const previousResponse = args.response;
    if (previousResponse) {
      const { collectionSaveOrUpdateResponse } = previousResponse;
      if (collectionSaveOrUpdateResponse) {
        const { data: collectionItemData } = collectionSaveOrUpdateResponse;
        eventItemConfig['previousStepId'] = collectionItemData?.uuid || '';
      }
    }
    let previousActionResponse = sessionStorage.getItem('previousActionResponse');
    previousActionResponse = previousActionResponse ? JSON.parse(previousActionResponse) : {};
    if (previousActionResponse) {
      let collectionKey = `parentCollectionToPropagate`;
      if (previousActionResponse[collectionKey]) {
        let collectionItemId = previousActionResponse[collectionKey].uuid;
        eventItemConfig['propagateItemId'] = collectionItemId;
      }
    }
    let previousActionFormData = sessionStorage.getItem('previousActionFormData');
    previousActionFormData = previousActionFormData ? JSON.parse(previousActionFormData) : {};
    // Get Browser Storage Data Object
    const browserData = getBrowserData();
    const formData = {
      eventItemConfig,
      templatesRules: parameters.templatesRules,
      previousActionResponse,
      previousActionFormData,
      ...browserData,
    };
    let response = {};
    let result = {};
    if (parameters) {
      try {
        const endpoint = 'email/send-dynamic-mail/';
        result = await unSecuredPostCall(formData, endpoint);
        response.data = { ...previousResponse, ...result };
        response.status = 'success';
        await handleAwsSesEmailActivityTracker(response.data.data);
      } catch (error) {
        console.log('%c==> Error :>> ', 'color:yellow', error);
        console.log('here is handleAwsSesEmailActivityTracker error', error);
        if (error.response) {
          response.data = error.response;
          response.status = 'error';
        }
      }
    }
    console.log('here is handleAwsSesEmailActivityTracker response', response);
    return response;
  } else {
    return disabledActionResponse(args);
  }
};

const sendResetPasswordEmail = async function (args) {
  const actionEnabled = isActionEnabled(args);
  console.log('🚀 ~ sendResetPasswordEmail ~ actionEnabled:', actionEnabled);
  if (actionEnabled) {
    // Force promise to support Safari browser & fix Unhandled Promise Rejection on IOS device browsers
    new Promise(function (resolve, reject) {
      resolve(args);
    });
    const { element, parameters } = args;
    const { sendTo, emailTemplate } = parameters;
    console.log('sendTo: ', sendTo, 'Email Template: ', emailTemplate);
    const toEmailAddress = element.elements[sendTo].value;
    let alertMessageDiv = element.getElementsByClassName('alert-message')[0];
    let successMessageDiv = element.getElementsByClassName('success-message')[0];
    let emailResponse = null;
    // Get Browser Storage Data Object
    const browserData = getBrowserData();
    try {
      const emailApiEndpoint = 'email/send/' + emailTemplate;
      const emailFormData = {
        sendTo: toEmailAddress,
        ...browserData,
      };
      emailResponse = await publicPostCall(emailFormData, emailApiEndpoint);
      if (emailResponse.status === 200) {
        element.reset();
        successMessageDiv.innerHTML = 'An email has been sent to this ' + toEmailAddress;
        successMessageDiv.style.display = 'block';
        alertMessageDiv.style.display = 'none';
      }
    } catch (e) {
      console.log(e.response);
      alertMessageDiv.innerHTML = e.response.data['message'];
      alertMessageDiv.style.display = 'block';
      successMessageDiv.style.display = 'none';
    }
    return emailResponse;
  } else {
    return disabledActionResponse(args);
  }
};

const handleAwsSesEmailActivityTracker = async (responseData) => {
  try {
    const {
      bccTo = [],
      ccTo = [],
      sendTo = [],
      emailBody = '',
      emailSubject = '',
      status = '',
      sender = '',
      error = '',
    } = responseData[0];
    const awsSesPlugin = await fetchInstalledPluginByCode('AWS_SES');
    if (awsSesPlugin) {
      const itemData = {
        senderId: sender.uuid,
        sender: sender.userName,
        receiver: sendTo.join(' '),
        bcc: bccTo.join(' '),
        cc: ccTo.join(' '),
        subject: emailSubject,
        emailSentStatus: status,
        contentLength: emailBody.length,
        errorMessage: error,
      };
      const urlEndpoint = 'open/collection-form/aws_ses_activity_tracker/items';
      await unSecuredPostCall(itemData, urlEndpoint);
    }
  } catch (error) {
    console.error('An error occurred while handling the activity tracker:', error);
  }
};

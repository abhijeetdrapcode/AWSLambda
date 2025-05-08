import { findTemplate, listTemplates } from '../email-template/template.service';
import { findInstalledPlugin, loadS3PluginConfig } from '../install-plugin/installedPlugin.service';
import { findItemById } from '../item/item.service';
import { getTokenExpireTime, issueJWTToken } from '../loginPlugin/jwtUtils';
import { userCollectionName } from '../loginPlugin/loginUtils';
import { prepareFunction } from '../utils/appUtils';
import {
  findCollectionsByQuery,
  findOneService,
  userCollectionService,
} from '../collection/collection.service';
import { pluginCode } from 'drapcode-constant';
import {
  createS3Client,
  cryptFile,
  drapcodeEncryptDecrypt,
  getEncryptedReferenceFieldsQuery,
  parseValueFromData,
  processItemEncryptDecrypt,
  processKMSDecryption,
  replaceValueFromSource,
} from 'drapcode-utility';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { getProjectEncryption } from '../middleware/encryption.middleware';
import _ from 'lodash';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { findProjectByQuery } from '../project/project.service';
const fs = require('fs');
const APP_ENV = process.env.APP_ENV;

export const sendEmailService = async (emailBody) => {
  console.log('emailBody', emailBody);
  // const { toEmail, subject, htmlBody } = emailBody;
  // const sendEmailStats = await sendEmailUsingSes(toEmail, subject, htmlBody);
  // console.log(sendEmailStats);
  // return sendEmailStats;
};

//TODO: Ali -> Handle browserStorageData and remove previousActionResponse,previousActionFormData
export const sendEmailTemplateService = async (req) => {
  const { builderDB, db, body, params, projectId, projectName, environment, user, tenant } = req;
  const {
    sendTo,
    previousActionResponse,
    previousActionFormData,
    sessionStorageData,
    localStorageData,
    cookiesData,
  } = body;
  const browserStorageDTO = {
    sessionValue: previousActionResponse,
    sessionFormValue: previousActionFormData,
    sessionStorageData,
    localStorageData,
    cookiesData,
  };
  const { uuid } = user ? user : '';
  const userCollection = await userCollectionService(builderDB, projectId);
  let currentUser = uuid
    ? (await findItemById(db, builderDB, projectId, userCollection, uuid, null))?.data
    : {};
  let templateResponse = await findTemplate(builderDB, {
    uuid: params.templateId,
  });
  let itemDataOfTemplateCollection = {};
  let tenantTemplateResponse = {};
  let tenantTemplates = [];
  let isTenantTemplateOverride = false;
  const siteUrl = req?.headers?.origin;
  itemDataOfTemplateCollection.siteUrl = siteUrl;
  itemDataOfTemplateCollection.projectName = projectName;

  const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
  if (templateResponse && templateResponse.collectionId === userCollectionName && sendTo) {
    const emailQuery = { email: { $regex: `^${sendTo}$`, $options: 'i' } };
    const usernameQuery = { userName: { $regex: `^${sendTo}$`, $options: 'i' } };
    const query = { $or: [emailQuery, usernameQuery] };
    let { data: user } = await findItemById(db, builderDB, projectId, userCollection, null, query);

    if (enableEncryption && encryption) {
      const userCollectionFields = userCollection ? userCollection.fields : [];
      const query = getEncryptedReferenceFieldsQuery(userCollectionFields, projectId);
      const encrypedRefCollections = await findCollectionsByQuery(builderDB, query);
      const cryptResponse = await processItemEncryptDecrypt(
        user,
        userCollectionFields,
        encryption,
        true,
        encrypedRefCollections,
      );
      user = cryptResponse;
      console.log('*** sendEmailTemplateService Decrypted ~ user:', user);
    }

    let userTenantIds = [];
    if (user && user.tenantId) {
      userTenantIds = user.tenantId.map((tenant) => tenant.uuid);
    }
    tenantTemplates = await listTemplates(builderDB, {
      parentTemplateId: params.templateId,
    });
    tenantTemplates.forEach((tenantTemplate) => {
      if (isTenantTemplateOverride) {
        return;
      }
      const tenantTemplateTenantIds =
        tenantTemplate && tenantTemplate.tenants
          ? tenantTemplate.tenants.map((tenant) => tenant.uuid)
          : [];

      let tenantIds = [];
      if (
        tenantTemplateTenantIds &&
        tenantTemplateTenantIds.length &&
        userTenantIds &&
        userTenantIds.length
      ) {
        tenantIds = tenantTemplateTenantIds.filter((templateTenantId) =>
          userTenantIds.includes(templateTenantId),
        );
      }

      isTenantTemplateOverride = !!(tenantIds && tenantIds.length);
      console.log(
        '*** sendEmailTemplateService isTenantTemplateOverride:',
        isTenantTemplateOverride,
      );
      if (isTenantTemplateOverride) {
        tenantTemplateResponse = tenantTemplate;
        return;
      }
    });

    itemDataOfTemplateCollection = { ...itemDataOfTemplateCollection, ...user };
    const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
    console.log('tokenExpireTime', tokenExpireTime);
    let authorizationToken = await issueJWTToken(itemDataOfTemplateCollection, tokenExpireTime);

    console.log('authorizationToken', authorizationToken);
    authorizationToken = authorizationToken.token;
    console.log('authorizationToken', authorizationToken);
    if (authorizationToken && authorizationToken.startsWith('Bearer ')) {
      authorizationToken = authorizationToken.substring(7, authorizationToken.length);
    }
    itemDataOfTemplateCollection.autorizationToken = authorizationToken; //?INFO: To handle typo in Existing Project Email Templates
    itemDataOfTemplateCollection.authorizationToken = authorizationToken;
  }

  if (isTenantTemplateOverride && tenantTemplateResponse) {
    templateResponse = tenantTemplateResponse;
  }
  const templateCollection = await findOneService(builderDB, {
    projectId,
    collectionName: templateResponse.collectionId,
  });

  if (enableEncryption && encryption) {
    const userCollectionFields = userCollection ? userCollection.fields : [];
    const query = getEncryptedReferenceFieldsQuery(userCollectionFields, projectId);
    const encrypedRefCollections = await findCollectionsByQuery(builderDB, query);
    const currentUserCryptResponse = await processItemEncryptDecrypt(
      currentUser,
      userCollectionFields,
      encryption,
      true,
      encrypedRefCollections,
    );
    currentUser = currentUserCryptResponse;
    console.log('*** sendEmailTemplateService Decrypted ~ currentUser:', currentUser);
  }

  const subjectContent = templateResponse.subject;
  const bodyContent = templateResponse.content;
  const emailSubject = replaceFieldsIntoTemplate(
    subjectContent,
    itemDataOfTemplateCollection || {},
    currentUser,
    environment,
    templateCollection,
    userCollection,
    browserStorageDTO,
  );

  const emailBody = replaceFieldsIntoTemplate(
    bodyContent,
    itemDataOfTemplateCollection || {},
    currentUser,
    environment,
    templateCollection,
    userCollection,
    browserStorageDTO,
  );
  console.log('\n emailSubject :>> ', emailSubject);
  console.log('\n emailBody :>> ', emailBody);
  const emailPlugin = await findInstalledPlugin(builderDB, { code: pluginCode.AWS_SES, projectId });
  console.log('*** sendEmailTemplateService ~ emailPlugin:', emailPlugin);
  let fromEmailAndName = '';
  let replyTo = '';
  let ccTo = '';
  let bccTo = '';
  let config = {
    region: process.env.AWS_SES_REGION,
    Credential: {
      accessKeyId: process.env.AWS_SES_SECRET_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SES_SECRET_SECRET_KEY,
    },
  };
  if (emailPlugin) {
    let { access_key, access_secret, region, from_email, from_name, reply_to, cc_to, bcc_to } =
      emailPlugin.setting;
    console.log('**%%**%%**%%**%%**%%');
    console.log('tenant sendEmailTemplateService', tenant);
    console.log('**%%**%%**%%**%%**%%');
    access_key = replaceValueFromSource(access_key, environment, tenant);
    access_secret = replaceValueFromSource(access_secret, environment, tenant);
    region = replaceValueFromSource(region, environment, tenant);
    from_email = replaceValueFromSource(from_email, environment, tenant);
    from_name = replaceValueFromSource(from_name, environment, tenant);
    reply_to = replaceValueFromSource(reply_to, environment, tenant);
    cc_to = replaceValueFromSource(cc_to, environment, tenant);
    bcc_to = replaceValueFromSource(bcc_to, environment, tenant);
    fromEmailAndName = `${from_name} <${from_email}>`;
    console.log('fromEmailAndName', fromEmailAndName);
    replyTo = reply_to;
    ccTo = cc_to;
    bccTo = bcc_to;
    config = {
      region: region,
      credentials: {
        accessKeyId: access_key,
        secretAccessKey: access_secret,
      },
    };
  }
  const sendEmailStats = await sendEmailUsingSes(
    config,
    sendTo,
    emailSubject,
    emailBody,
    fromEmailAndName,
    replyTo,
    ccTo,
    bccTo,
  );
  console.log(sendEmailStats);
};

export const sendEmailUsingSes = async (
  config,
  toEmail,
  subject,
  htmlBody,
  fromEmailAndName = null,
  replyTo = null,
  ccTo = null,
  bccTo = null,
  attachmentFiles,
  builderDB,
  projectId,
  environment,
) => {
  console.log('🚀 ~ sendEmailUsingSes ~ toEmail:', toEmail);

  fromEmailAndName = fromEmailAndName || process.env.AWS_SES_ADMIN_FROM_EMAIL_NAME;
  const ses = new SESClient(config);
  const destinationSetting = { ToAddresses: Array.isArray(toEmail) ? toEmail : [toEmail] };
  if (ccTo) {
    destinationSetting.CcAddresses = Array.isArray(ccTo) ? ccTo : [ccTo];
  }
  if (bccTo) {
    destinationSetting.BccAddresses = Array.isArray(bccTo) ? bccTo : [bccTo];
  }

  let attachments = [];
  if (attachmentFiles && attachmentFiles.length > 0) {
    attachments = await attachmentHandlingInEmail(
      attachmentFiles,
      builderDB,
      projectId,
      environment,
    );
  }

  let rawMessage = `From: ${fromEmailAndName}\n`;
  rawMessage += `To: ${Array.isArray(toEmail) ? toEmail.join(', ') : toEmail}\n`;
  rawMessage += `Subject: ${subject}\n`;

  if (ccTo) {
    rawMessage += `Cc: ${Array.isArray(ccTo) ? ccTo.join(', ') : ccTo}\n`;
  }
  if (bccTo) {
    rawMessage += `Bcc: ${Array.isArray(bccTo) ? bccTo.join(', ') : bccTo}\n`;
  }

  if (replyTo) {
    rawMessage += `Reply-To: ${Array.isArray(replyTo) ? replyTo.join(', ') : replyTo}\n`;
  }

  rawMessage += `Content-Type: multipart/mixed; boundary="boundary12345"\n\n`;

  rawMessage += `--boundary12345\n`;
  rawMessage += `Content-Type: text/html; charset="UTF-8"\n\n`;
  rawMessage += `${htmlBody}\n\n`;

  if (attachments.length > 0) {
    for (const attachment of attachments) {
      rawMessage += `--boundary12345\n`;
      rawMessage += `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\n`;
      rawMessage += `Content-Disposition: attachment; filename="${attachment.filename}"\n`;
      rawMessage += `Content-Transfer-Encoding: ${attachment.encoding}\n\n`;
      rawMessage += `${attachment.content}\n\n`;
    }
  }

  rawMessage += `--boundary12345--`;

  const params = {
    RawMessage: {
      Data: rawMessage,
    },
  };

  try {
    const command = new SendRawEmailCommand(params);
    const result = await ses.send(command);
    console.log('Email sent:', result.MessageId);
    return { sentEmailId: result.MessageId, status: 'success', code: 200 };
  } catch (error) {
    console.error('Failed to send email:', error.message);
    return { status: 'failure', error: error.message, code: 500 };
  }
};

export const replaceFieldsIntoTemplate = function (
  emailContent,
  data,
  user,
  environment,
  collection,
  userCollection,
  browserStorageDTO = {},
  projectConstants = {},
  tenant = {},
  tenantCollection = null,
) {
  try {
    if (Object.keys(data).length <= 0) {
      return emailContent;
    }
    const contentList = emailContent.match(/{{(.*?)}}/g)?.map((b) => b.replace(/{{(.*?)}}/g, '$1'));
    contentList?.forEach((prop) => {
      emailContent = replaceProp(
        prop,
        emailContent,
        data,
        user,
        environment,
        collection,
        userCollection,
        browserStorageDTO,
        projectConstants,
        tenant,
        tenantCollection,
      );
    });
    return emailContent;
  } catch (error) {
    console.log('\n error :>> ', error);
  }
};

const replaceProp = (
  prop,
  emailContent,
  data,
  user,
  environment,
  collection,
  userCollection,
  browserStorageDTO = {},
  projectConstants = {},
  tenant = {},
  tenantCollection = null,
) => {
  const {
    sessionValue: previousActionResponse,
    sessionFormValue: previousActionFormData,
    sessionStorageData,
    localStorageData,
    cookiesData,
  } = browserStorageDTO || {};
  const { utilities } = collection;
  const needle = `{{${prop}}}`;
  let dataOfItem = '';
  const { constants } = environment;
  if (prop.startsWith('DF::')) {
    dataOfItem = replaceDerivedFields(utilities, prop, data, user, constants, browserStorageDTO);
  } else if (prop.startsWith('CC::')) {
    // Replacing Collection Constant
    const cleanProp = prop.replace('CC::', '');
    const collectionConstants = collection ? collection.constants : null;
    dataOfItem = collectionConstants.find((constant) => constant.name === cleanProp)?.value;
  } else if (prop.startsWith('PC::')) {
    // Replacing Project Constant
    const cleanProp = prop.replace('PC::', '');
    const projectConstant = projectConstants.find((constant) => constant.name === cleanProp);
    dataOfItem = String(projectConstant?.value);
  } else if (prop.startsWith('RF::')) {
    // Replacing Reference Field
    const cleanProp = prop.replace('RF::', '');
    dataOfItem = parseValueFromData(data, cleanProp);
  } else if (prop.startsWith('current_user.')) {
    if (userCollection) {
      let cleanProp = prop.replace('current_user.', '');
      dataOfItem = replaceMoreProp(
        userCollection,
        cleanProp,
        user,
        user,
        constants,
        browserStorageDTO,
      );
    }
  } else if (prop.startsWith('current_tenant.')) {
    if (tenantCollection) {
      let cleanProp = prop.replace('current_tenant.', '');
      dataOfItem = replaceMoreProp(
        tenantCollection,
        cleanProp,
        tenant,
        user,
        constants,
        browserStorageDTO,
      );
    }
  } else if (prop.startsWith('environment_variable.')) {
    // Replacing Environment Variable
    const cleanProp = prop.replace('environment_variable.', '');
    dataOfItem = environment.constants.find((constant) => constant.name === cleanProp)?.value;
  } else if (prop.startsWith('current_session.')) {
    // Replacing Session Data
    const cleanProp = prop.replace('current_session.', '');
    dataOfItem = parseValueFromData(previousActionResponse, cleanProp);
  } else if (prop.startsWith('form_data_session.')) {
    // Replacing Session Form Data
    const cleanProp = prop.replace('form_data_session.', '');
    dataOfItem = parseValueFromData(previousActionFormData, cleanProp);
  } else if (prop.startsWith('SESSION_STORAGE.')) {
    // Replacing Session Form Data
    const cleanProp = prop.replace('SESSION_STORAGE.', '');
    dataOfItem = _.get(sessionStorageData, cleanProp);
  } else if (prop.startsWith('LOCAL_STORAGE.')) {
    // Replacing Session Form Data
    const cleanProp = prop.replace('LOCAL_STORAGE.', '');
    dataOfItem = _.get(localStorageData, cleanProp);
  } else if (prop.startsWith('COOKIES.')) {
    // Replacing Session Form Data
    const cleanProp = prop.replace('COOKIES.', '');
    dataOfItem = _.get(cookiesData, cleanProp);
  } else {
    // Replacing Item Data
    dataOfItem = parseValueFromData(data, prop);
    const { fields } = collection;
    const field = fields.find((field) => field.fieldName === prop);
    if (field && field.type === 'boolean') {
      dataOfItem = dataOfItem ? 'Yes' : 'No';
    }
  }
  emailContent = findMyText(needle, dataOfItem, emailContent);
  return emailContent;
};

const replaceDerivedFields = (utilities, prop, data, user, constants, browserStorageDTO) => {
  if (!utilities || utilities.length <= 0) {
    return '';
  }

  const cleanProp = prop.replace('DF::', '');
  const derivedField = utilities.find((field) => field.name === cleanProp);
  if (!derivedField) {
    return '';
  }
  return prepareFunction(derivedField, data, user, constants, browserStorageDTO);
};
const replaceMoreProp = (collection, prop, data, user, constants, browserStorageDTO) => {
  const { fields, utilities } = collection;
  let cleanProp = prop.replace('current_user.', '');
  if (cleanProp.startsWith('DF::')) {
    return replaceDerivedFields(utilities, cleanProp, data, user, constants, browserStorageDTO);
  } else {
    let dataOfItem = parseValueFromData(data, cleanProp);
    const field = fields.find((field) => field.fieldName === prop);
    if (field && field.type === 'boolean') {
      dataOfItem = dataOfItem ? 'Yes' : 'No';
    }
    return dataOfItem;
  }
};

export const findMyText = function (needle, replacement, haystackText) {
  const match = new RegExp(needle, 'ig');
  if (replacement && replacement.length > 0) {
    return haystackText.replace(match, replacement);
  } else {
    replacement = ''; //Set empty value
    return haystackText.replace(match, replacement);
  }
};

//TODO: Ali -> Handle browserStorageData and remove previousActionResponse,previousActionFormData
export const sendDynamicEmailService = async (req, isDeveloperApi = false) => {
  const {
    builderDB,
    body,
    db,
    projectId,
    user,
    projectConstants,
    environment,
    projectName,
    tenant,
  } = req;

  try {
    const {
      templatesRules,
      previousActionResponse,
      previousActionFormData,
      sessionStorageData,
      localStorageData,
      cookiesData,
      eventItemConfig,
    } = body;
    const browserStorageDTO = {
      sessionValue: previousActionResponse,
      sessionFormValue: previousActionFormData,
      sessionStorageData,
      localStorageData,
      cookiesData,
    };
    const emailPlugin = await findInstalledPlugin(builderDB, {
      code: pluginCode.AWS_SES,
      projectId,
    });
    if (!templatesRules || !templatesRules.length) throw new Error('No template rules provided.');
    let fromEmailAndName = '';
    let replyTo = '';
    let ccTo = '';
    let bccTo = '';
    let config = {
      region: process.env.AWS_SES_REGION,
      Credential: {
        accessKeyId: process.env.AWS_SES_SECRET_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SES_SECRET_SECRET_KEY,
      },
    };
    if (emailPlugin) {
      let { access_key, access_secret, region, from_email, from_name, reply_to, cc_to, bcc_to } =
        emailPlugin.setting;
      access_key = replaceValueFromSource(access_key, environment, tenant);
      access_secret = replaceValueFromSource(access_secret, environment, tenant);
      region = replaceValueFromSource(region, environment, tenant);
      from_email = replaceValueFromSource(from_email, environment, tenant);
      from_name = replaceValueFromSource(from_name, environment, tenant);
      reply_to = replaceValueFromSource(reply_to, environment, tenant);
      cc_to = replaceValueFromSource(cc_to, environment, tenant);
      bcc_to = replaceValueFromSource(bcc_to, environment, tenant);

      replyTo = reply_to;
      ccTo = cc_to;
      bccTo = bcc_to;
      fromEmailAndName = `${from_name} <${from_email}>`;
      config = {
        region,
        credentials: {
          accessKeyId: access_key.trim(),
          secretAccessKey: access_secret.trim(),
        },
      };
    }
    let sendTo = '';
    let emailSubject = '';
    let emailBody = '';
    let currentUser = {};

    const { enableEncryption, encryption } = await getProjectEncryption(projectId, builderDB);
    const userCollection = await userCollectionService(builderDB, projectId);

    if (user && user.uuid) {
      const userData = await findItemById(
        db,
        builderDB,
        projectId,
        userCollection,
        user.uuid,
        null,
      );
      currentUser = userData?.data || {};

      if (enableEncryption && encryption) {
        const userCollectionFields = userCollection ? userCollection.fields : [];
        const query = getEncryptedReferenceFieldsQuery(userCollectionFields, projectId);
        const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
        const cryptResponse = await processItemEncryptDecrypt(
          currentUser,
          userCollectionFields,
          encryption,
          true,
          encryptedRefCollections,
        );
        currentUser = cryptResponse;
        console.log('*** sendDynamicEmailService Decrypted ~ currentUser:', currentUser);
      }
    }

    const siteUrl = req?.headers?.origin;
    const userTenantIds = user ? user.tenantId || [] : [];
    let messages = [];
    for (const templateRule of templatesRules) {
      const {
        templateId,
        emailFields,
        emailCcFields,
        emailBccFields,
        sendToPropagate,
        getItemIdFrom,
      } = templateRule;

      try {
        let templateResponse = await findTemplate(builderDB, { uuid: templateId });
        if (!templateResponse) {
          console.log(`Template with ID ${templateId} not found.`);
          continue;
        }
        const itemIdForTemplate = getItemIdForTemp(getItemIdFrom, eventItemConfig, sendToPropagate);
        const collectionName = templateResponse.collectionId;
        let tenantTemplateResponse = {};
        let isTenantTemplateOverride = false;

        if (userTenantIds.length > 0) {
          const tenantTemplates =
            (await listTemplates(builderDB, { parentTemplateId: templateId })) || [];
          for (const tenantTemplate of tenantTemplates) {
            const tenantTemplateTenantIds = tenantTemplate?.tenants?.map((t) => t.uuid) || [];
            const tenantIds = tenantTemplateTenantIds.filter((tid) => userTenantIds.includes(tid));
            if (tenantIds.length > 0) {
              tenantTemplateResponse = tenantTemplate;
              isTenantTemplateOverride = true;
              break;
            }
          }
        }

        if (isTenantTemplateOverride && tenantTemplateResponse) {
          templateResponse = tenantTemplateResponse;
        }

        const collection = await findOneService(builderDB, {
          projectId,
          collectionName,
        });
        let itemDataOfTemplateCollection = collectionName
          ? (await findItemById(db, builderDB, projectId, collection, itemIdForTemplate, null))
              ?.data || {}
          : {};

        if (!Object.keys(itemDataOfTemplateCollection).length) {
          console.log(
            `Item with ID ${itemIdForTemplate} not found in collection ${collectionName}. Default data will be used.`,
          );
          itemDataOfTemplateCollection = {};
        }

        const templateCollection = await findOneService(builderDB, {
          projectId,
          collectionName: templateResponse.collectionId,
        });
        if (enableEncryption && encryption) {
          const templateCollectionFields = templateCollection ? templateCollection.fields : [];
          const query = getEncryptedReferenceFieldsQuery(templateCollectionFields, projectId);
          const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
          const cryptResponse = await processItemEncryptDecrypt(
            itemDataOfTemplateCollection,
            templateCollectionFields,
            encryption,
            true,
            encryptedRefCollections,
          );
          itemDataOfTemplateCollection = cryptResponse;
          console.log(
            '*** sendDynamicEmailService Decrypted ~ itemDataOfTemplateCollection:',
            itemDataOfTemplateCollection,
          );
        }

        itemDataOfTemplateCollection.siteUrl = siteUrl;

        if (collectionName === userCollectionName) {
          const tokenExpireTime = await getTokenExpireTime(builderDB, projectId, environment);
          let authorizationToken = await issueJWTToken(
            itemDataOfTemplateCollection,
            tokenExpireTime,
          );
          authorizationToken = authorizationToken.token;
          if (authorizationToken && authorizationToken.startsWith('Bearer ')) {
            authorizationToken = authorizationToken.substring(7);
          }
          itemDataOfTemplateCollection.authorizationToken = authorizationToken;
          itemDataOfTemplateCollection.autorizationToken = authorizationToken; //?INFO: To handle typo in Existing Project Email Templates
        }

        itemDataOfTemplateCollection.projectName = projectName;

        const subjectContent = templateResponse.subject;
        emailSubject = replaceFieldsIntoTemplate(
          subjectContent,
          itemDataOfTemplateCollection,
          currentUser,
          environment,
          templateCollection,
          userCollection,
          browserStorageDTO,
        );
        if (environment.envType === 'BETA') {
          emailSubject = `[Sandbox] ${emailSubject}`;
        } else if (environment.envType === 'PREVIEW') {
          emailSubject = `[Preview] ${emailSubject}`;
        }
        const bodyContent = templateResponse.content;
        emailBody = replaceFieldsIntoTemplate(
          bodyContent,
          itemDataOfTemplateCollection,
          currentUser,
          environment,
          templateCollection,
          userCollection,
          browserStorageDTO,
        );
        const attachmentField = templateResponse.attachmentField;
        let attachmentFiles = itemDataOfTemplateCollection[attachmentField];
        if (attachmentFiles && !Array.isArray(attachmentFiles)) {
          attachmentFiles = [attachmentFiles];
        }
        let ccTo, bccTo;
        if (isDeveloperApi) {
          sendTo = body.sendTo;
          ccTo = body.cc;
          bccTo = body.bcc;
        } else {
          sendTo = getEmailAddressesToSendEmail(
            emailFields,
            itemDataOfTemplateCollection,
            projectConstants,
            user,
          );
          if (emailCcFields && emailCcFields.length) {
            ccTo = getEmailAddressesToSendEmail(
              emailCcFields,
              itemDataOfTemplateCollection,
              projectConstants,
              user,
            );
          }
          if (emailBccFields && emailBccFields.length) {
            bccTo = getEmailAddressesToSendEmail(
              emailBccFields,
              itemDataOfTemplateCollection,
              projectConstants,
              user,
            );
          }
        }

        const sendEmailStats = await sendEmailUsingSes(
          config,
          sendTo,
          emailSubject,
          emailBody,
          fromEmailAndName,
          replyTo,
          ccTo,
          bccTo,
          attachmentFiles,
          builderDB,
          projectId,
          environment,
        );

        messages.push({
          templateId,
          sender: user,
          itemId: eventItemConfig?.dataItemId || '',
          sendTo,
          ccTo,
          bccTo,
          emailSubject,
          emailBody,
          status: 'success',
          ...sendEmailStats,
        });
        console.log('sendEmailStats', sendEmailStats);
      } catch (error) {
        console.error(`Failed to process template rule with ID ${templateId}:`, error.message);
        messages.push({
          templateId,
          sender: user,
          itemId: eventItemConfig?.dataItemId || '',
          sendTo,
          ccTo,
          bccTo,
          emailSubject,
          emailBody,
          status: 'failure',
          error: error.message,
        });
      }
    }

    return messages;
  } catch (error) {
    console.error('Error in sendDynamicEmailService:', error);
    throw error;
  }
};

const getItemIdForTemp = (getItemIdFrom, eventItemConfig, sendToPropagate = false) => {
  let itemIdForTemplate = '';
  const { dataItemId, previousStepId, propagateItemId } = eventItemConfig;
  if (!getItemIdFrom) {
    itemIdForTemplate = sendToPropagate ? propagateItemId : dataItemId;
  } else {
    switch (getItemIdFrom) {
      case 'previousResponse':
        itemIdForTemplate = previousStepId;
        break;
      case 'sendToPropagate':
        itemIdForTemplate = propagateItemId;
        break;
      case 'collectionUuid':
      default:
        itemIdForTemplate = dataItemId;
        break;
    }
  }
  return itemIdForTemplate;
};

export const getEmailAddressesToSendEmail = (
  emailFields,
  itemDataOfTemplateCollection,
  projectConstants,
  user,
) => {
  let emailAddresses = [];
  emailFields.forEach((field) => {
    const { fieldFrom, fieldName, name } = JSON.parse(field);
    let emailFieldValue = '';
    if (fieldFrom === 'collection') {
      emailFieldValue = parseValueFromData(itemDataOfTemplateCollection, fieldName);
    } else if (fieldFrom === 'projectConstant' && name) {
      const emailConstant = projectConstants ? projectConstants.find((e) => e.name === name) : '';
      emailFieldValue = emailConstant?.value;
    } else if (fieldFrom === 'session' && user) {
      emailFieldValue = parseValueFromData(user, fieldName);
    }

    if (emailFieldValue && typeof emailFieldValue === 'string') {
      emailAddresses.push(emailFieldValue);
    }
  });
  console.log('>>>>>>>>emailAddresses>>>>>>', emailAddresses);
  return emailAddresses;
};

const attachmentHandlingInEmail = async (attachmentFiles, builderDB, projectId, environment) => {
  try {
    const { enableEncryption, encryptions } = await findProjectByQuery(builderDB, {
      uuid: projectId,
    });
    const encryption = encryptions
      ? encryptions.find((enc) => enc.envType.toLowerCase() === APP_ENV.toLowerCase())
      : null;
    if (enableEncryption && encryption) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
        } else {
          return result;
        }
      }
      const { awsConfig, encryptionType, dataKey } = encryption;
      if (encryptionType === 'KMS') {
        const { accessKeyId, secretAccessKey, region } = awsConfig;
        const config = {
          region,
          accessKeyId,
          secretAccessKey,
        };
        const plainTextData = await processKMSDecryption(config, dataKey, {});
        if (plainTextData.status === 'FAILED') {
          return plainTextData;
        }
        encryption.dataKey = plainTextData.data;
      }
    }
    const s3Plugin = await loadS3PluginConfig(builderDB, projectId, environment);
    const { region, accessKeyId, secretAccessKey, bucket } = s3Plugin;
    const awsConfig = {
      region: region,
      accessKey: accessKeyId,
      accessSecret: secretAccessKey,
    };
    const s3client = createS3Client(awsConfig);
    let attachments = [];
    if (attachmentFiles && attachmentFiles.length > 0) {
      for (const file of attachmentFiles) {
        const { key, originalName, contentType, isEncrypted } = file;
        try {
          const s3Params = {
            Bucket: bucket,
            Key: key,
          };
          const { Body } = await s3client.send(new GetObjectCommand(s3Params));
          let fileBuffer = await Body.transformToByteArray();
          if (isEncrypted) {
            const keyParts = key.split('/');
            const encryptedFilePath = `${process.env.FILE_UPLOAD_PATH}${
              keyParts[keyParts.length - 1]
            }.enc`;
            await fs.promises.writeFile(encryptedFilePath, fileBuffer);
            const result = await cryptFile(encryptedFilePath, encryption, true);
            fs.unlinkSync(encryptedFilePath);
            const data = await fs.promises.readFile(result);
            if (data) {
              fileBuffer = data;
              fs.unlinkSync(result);
            }
          }
          const attachment = {
            filename: originalName,
            content: Buffer.from(fileBuffer).toString('base64'),
            encoding: 'base64',
            contentType: contentType || 'application/octet-stream',
          };
          attachments.push(attachment);
        } catch (error) {
          console.error(`Error fetching file from S3 (Key: ${key}):`, error.message);
        }
      }
    }
    return attachments;
  } catch (error) {
    console.error('Error in attachmentHandlingInEmail function:', error.message);
    throw new Error('Error processing email attachments.');
  }
};

import { findTemplate, listTemplates } from '../email-template/template.service';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';
import { findItemById } from '../item/item.service';
import { getTokenExpireTime, issueJWTToken } from '../loginPlugin/jwtUtils';
import { userCollectionName } from '../loginPlugin/loginUtils';
// import { prepareFunction } from '../utils/appUtils';
import {
  findCollectionsByQuery,
  findOneService,
  userCollectionService,
} from '../collection/collection.service';
import {
  getEncryptedReferenceFieldsQuery,
  parseValueFromData,
  processItemEncryptDecrypt,
  replaceValueFromSource,
} from 'drapcode-utility';
import axios from 'axios';
// import qs from 'qs';
import { Buffer } from 'buffer';
import { htmlToText } from 'html-to-text';
import PDFDocument from 'pdfkit';
import { saveItem } from '../item/item.service';
import { atob } from 'buffer';
import { list } from '../item/item.service';
import { getProjectEncryption } from '../middleware/encryption.middleware';
import { replaceFieldsIntoTemplate, getEmailAddressesToSendEmail } from '../email/email.service';
import { executeLastRecordBuilder } from '../item/item.builder.service';

export const findMyText = function (needle, replacement, haystackText) {
  const match = new RegExp(needle, 'ig');
  if (replacement && replacement.length > 0) {
    return haystackText.replace(match, replacement);
  } else {
    replacement = ''; //Set empty value
    return haystackText.replace(match, replacement);
  }
};

export const textToPdf = async (textContent) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        const pdfBase64 = pdfData.toString('base64');
        resolve(pdfBase64);
      });
      doc.text(textContent);
      doc.end();
    } catch (error) {
      console.error('Error:', error);
      reject(error);
    }
  });
};

export const htmlToPdf = async (htmlContent) => {
  try {
    const textContent = htmlToText(htmlContent, {
      wordwrap: 130,
    });
    const PDFDocument = await textToPdf(textContent);
    return PDFDocument;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

const sendForEsignUsingDocusign = async (
  name,
  sendTo,
  ccTo,
  bccTo,
  emailSubject,
  agreementTemplateBody,
  accessToken,
  accountId,
  baseUrl,
) => {
  const documentBase64 = await htmlToPdf(agreementTemplateBody);
  const documentId = 1;

  const createRecipient = (
    email,
    name,
    recipientId,
    routingOrder,
    roleName,
    accessCode = null,
    phoneNumber = null,
    secondaryDeliveryMethod = null,
  ) => {
    const recipient = {
      email,
      name,
      recipientId,
      routingOrder,
      roleName,
    };
    if (accessCode) recipient.accessCode = accessCode;
    if (phoneNumber) recipient.recipientPhoneNumber = phoneNumber;
    if (secondaryDeliveryMethod) recipient.secondaryDeliveryMethod = secondaryDeliveryMethod;
    return recipient;
  };

  const signers = (sendTo || []).map((email, index) =>
    createRecipient(
      email,
      Array.isArray(name) ? name[index] || `Signer ${index + 1}` : name,
      `${index + 1}`,
      '1',
      'Signer',
      null,
      null,
      null,
    ),
  );

  const carbonCopies = (ccTo || []).map((email, index) =>
    createRecipient(
      email,
      `CC Recipient ${index + 1}`,
      `${(sendTo || []).length + index + 1}`,
      '2',
      'Carbon Copy',
      null,
      null,
      null,
    ),
  );

  const certifiedDeliveries = (bccTo || []).map((email, index) =>
    createRecipient(
      email,
      `BCC Recipient ${index + 1}`,
      `${(sendTo || []).length + (ccTo || []).length + index + 1}`,
      '3',
      'Certified Delivery',
      null,
      null,
      null,
    ),
  );

  const recipients = {
    signers,
    carbonCopies,
    certifiedDeliveries,
  };

  const data = {
    documents: [
      {
        documentBase64: documentBase64,
        documentId: documentId,
        fileExtension: 'pdf',
        name: 'document',
      },
    ],
    emailSubject: emailSubject,
    recipients: recipients,
    status: 'sent',
  };

  const config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: `${baseUrl}/v2.1/accounts/${accountId}/envelopes`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    data: data,
  };

  try {
    const response = await axios.request(config);
    const envelopeId = response?.data?.envelopeId;
    const status = response?.data?.status;
    return { envelopeId, status };
  } catch (error) {
    console.error('Detailed Error:', {
      errorMessage: error.message,
      errorResponse: error.response?.data,
      errorConfig: error.config,
    });
    throw error;
  }
};

export const saveDocusignTokens = async (req) => {
  const { projectId, builderDB, db, body, user, decrypt, enableAuditTrail, environment } = req;
  const { params, accessToken, refreshToken, profile, collectionName } = body;
  let paramsObj = atob(params);
  paramsObj = JSON.parse(paramsObj);
  const { successRedirectUrl, errorRedirectUrl, successMessage, errorMessage } = paramsObj;
  const tokens = {
    authorizationToken: accessToken,
    refreshToken: refreshToken,
  };
  let finalData = {};
  const eventConfig = {
    successRedirectUrl,
    errorRedirectUrl,
    successMessage,
    errorMessage,
  };
  try {
    const lastItem = await executeLastRecordBuilder(db, collectionName);
    if (lastItem?.length) await db.dropCollection(collectionName);
    await saveItem(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      tokens,
      user,
      req.headers,
      decrypt,
    );
    finalData = {
      projectId,
      eventConfig,
      profile,
    };
    return finalData;
  } catch (error) {
    console.error('Error saving token:', error.response ? error.response.data : error.message);
    throw error;
  }
};

export const docusignTokenGen = async (req) => {
  try {
    const { projectId, builderDB, db, user, decrypt, environment, tenant, enableAuditTrail } = req;
    const docusignTokensCollection = 'docusign_tokens';
    let result = await list(builderDB, db, projectId, docusignTokensCollection);
    const refreshToken = result?.[0]?.refreshToken;
    if (!refreshToken) {
      throw new Error({ status: 402, message: 'Please initiate DocuSign first' });
    }

    const docusignPlugin = await findInstalledPlugin(builderDB, { code: 'DOCUSIGN', projectId });
    if (!docusignPlugin) {
      throw new Error({ status: 402, message: 'DocuSign Plugin is not Installed.' });
    }
    let { integration_key, secret_key, domain_path } = docusignPlugin.setting;
    integration_key = replaceValueFromSource(integration_key, environment, tenant);
    secret_key = replaceValueFromSource(secret_key, environment, tenant);
    domain_path = replaceValueFromSource(domain_path, environment, tenant);
    const clientID = integration_key ?? '';
    const clientSecret = secret_key ?? '';
    const url = `https://${domain_path}/oauth/token`;
    const basicToken = Buffer.from(`${clientID}:${clientSecret}`).toString('base64');

    const headers = {
      Authorization: `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString();
    const response = await axios.post(url, data, { headers });
    if (!response.data) throw new Error('Error in getting token');
    const { access_token, refresh_token } = response.data;
    const tokens = {
      authorizationToken: access_token,
      refreshToken: refresh_token,
    };
    const lastItem = await executeLastRecordBuilder(db, docusignTokensCollection);
    if (lastItem?.length) await db.dropCollection(docusignTokensCollection);
    await saveItem(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      docusignTokensCollection,
      tokens,
      user,
      req.headers,
      decrypt,
    );
    return tokens;
  } catch (error) {
    console.warn(error);
    throw error;
  }
};

const getNameToSendEmail = (nameFields, itemDataOfTemplateCollection, projectConstants, user) => {
  let names = [];
  nameFields.forEach((field) => {
    const { fieldFrom, fieldName, name } = JSON.parse(field);
    let nameFieldValue = '';
    if (fieldFrom === 'collection') {
      nameFieldValue = parseValueFromData(itemDataOfTemplateCollection, fieldName || name);
    } else if (fieldFrom === 'projectConstant' && name) {
      const nameConstant = projectConstants ? projectConstants.find((e) => e.name === name) : '';
      nameFieldValue = nameConstant?.value;
    } else if (fieldFrom === 'session' && user) {
      nameFieldValue = parseValueFromData(user, fieldName || name);
    }

    if (nameFieldValue && typeof nameFieldValue === 'string') {
      names.push(nameFieldValue);
    }
  });
  return names;
};

export const sendForEsignService = async (req, tokens, isDeveloperApi = false) => {
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
      itemId,
      propagateItemId,
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
    const { authorizationToken: accessToken } = tokens;
    const docusignPlugin = await findInstalledPlugin(builderDB, { code: 'DOCUSIGN', projectId });
    if (!templatesRules || !templatesRules.length) throw new Error('No template rules provided.');
    let accountId = '';
    let baseUrl = '';
    if (docusignPlugin) {
      let { account_id, base_url } = docusignPlugin.setting;

      console.log('%%$$%%$$%%$$%%$$%%$$');
      console.log('tenant sendForEsignService', tenant);
      console.log('%%$$%%$$%%$$%%$$%%$$');
      accountId = replaceValueFromSource(account_id, environment, tenant);
      baseUrl = replaceValueFromSource(base_url, environment, tenant);
    }
    let name = 'unknown';
    let sendTo = '';
    let ccTo = '';
    let bccTo = '';
    let emailSubject = '';
    let agreementTemplateBody = '';
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
        console.log('*** sendForEsignService Decrypted ~ currentUser:', currentUser);
      }
    }

    const siteUrl = req?.headers?.origin;
    const userTenantIds = user ? user.tenantId || [] : [];
    let messages = [];
    for (const templateRule of templatesRules) {
      const {
        templateId,
        nameFields,
        emailFields,
        emailCcFields,
        emailBccFields,
        sendToPropagate,
      } = templateRule;

      try {
        let templateResponse = await findTemplate(builderDB, { uuid: templateId });
        if (!templateResponse) {
          console.log(`Template with ID ${templateId} not found.`);
          continue;
        }
        const itemIdForTemplate = sendToPropagate ? propagateItemId : itemId;
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
          const encrypedRefCollections = await findCollectionsByQuery(builderDB, query);
          const cryptResponse = await processItemEncryptDecrypt(
            itemDataOfTemplateCollection,
            templateCollectionFields,
            encryption,
            true,
            encrypedRefCollections,
          );
          itemDataOfTemplateCollection = cryptResponse;
          console.log(
            '*** sendForEsignService Decrypted ~ itemDataOfTemplateCollection:',
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
        agreementTemplateBody = replaceFieldsIntoTemplate(
          bodyContent,
          itemDataOfTemplateCollection,
          currentUser,
          environment,
          templateCollection,
          userCollection,
          browserStorageDTO,
        );
        let ccTo, bccTo;
        if (isDeveloperApi) {
          name = body.sendTo;
          sendTo = body.sendTo;
          ccTo = body.cc;
          bccTo = body.bcc;
        } else {
          name = getNameToSendEmail(
            nameFields,
            itemDataOfTemplateCollection,
            projectConstants,
            user,
          );
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
        const { envelopeId, status } = await sendForEsignUsingDocusign(
          name,
          sendTo,
          ccTo,
          bccTo,
          emailSubject,
          agreementTemplateBody,
          accessToken,
          accountId,
          baseUrl,
        );
        messages.push({
          templateId,
          sender: user,
          itemId,
          sendTo,
          ccTo,
          bccTo,
          emailSubject,
          agreementTemplateBody,
          envelopeId,
          envelopeStatus: status,
          status: 'success',
        });
      } catch (error) {
        console.error(`Failed to process template rule with ID ${templateId}:`, error.message);
        messages.push({
          templateId,
          sender: user,
          itemId,
          sendTo,
          ccTo,
          bccTo,
          emailSubject,
          agreementTemplateBody,
          status: 'failure',
          error: error.message,
        });
      }
    }

    return messages;
  } catch (error) {
    console.error('Error in sendForEsignService:', error);
    throw error;
  }
};

import { AppError } from 'drapcode-utility';
import { findItemById, updateItemById } from '../item/item.service';
import { addDynamicDataIntoElement, convertHtmlToPdf } from '../utils/appUtils';
import { findTemplate } from './snippet.service';
import { addLocalizationDataIntoElements } from '../project/build-utils';
import { findOneService } from '../collection/collection.service';
import { cryptService } from '../middleware/encryption.middleware';
import { UPLOAD_ROUTE } from '../route-constants';
import axios from 'axios';
import FormData from 'form-data';
import { findTemplate as findEmailTemplate } from '../email-template/template.service';
import { replaceFieldsIntoTemplate } from '../email/email.service';

export const showTemplateContent = async (req, res, next) => {
  try {
    const { builderDB, projectId, query, params } = req;
    const { lang } = query;
    const { templateId } = params;
    const response = await findTemplate(builderDB, { uuid: templateId });
    delete response.content['nocode-assets'];
    response.content = await replaceLocalizationContent(
      builderDB,
      projectId,
      lang,
      response.content,
    );
    res.status(200).send(response.content);
  } catch (e) {
    console.error('show template content ~ error:', e);
    next(e);
  }
};
// TODO: can be refactor or removed
export const findTemplateByUuid = async (req, res, next) => {
  try {
    const { builderDB, projectId, query, params } = req;
    const { lang } = query;
    const { templateId } = params;
    const response = await getTemplate(builderDB, projectId, lang, { uuid: templateId });
    res.status(200).send(response);
  } catch (e) {
    console.error('find template by uuid ~ error:', e);
    next(e);
  }
};

export const findModalTemplate = async (req, res, next) => {
  try {
    const { builderDB, projectId, query, params } = req;
    const { lang } = query;
    const { templateId } = params;
    const response = await getTemplate(builderDB, projectId, lang, {
      snippetType: 'MODAL',
      uuid: templateId,
    });
    res.status(200).send(response);
  } catch (e) {
    console.error('find modal template ~ error:', e);
    next(e);
  }
};

export const downloadPDFTemplateContent = async (req, res, next) => {
  try {
    const {
      builderDB,
      db,
      params,
      headers,
      query,
      projectId,
      timezone,
      dateFormat,
      tenant,
      body,
      user,
      environment,
    } = req;
    const { lang } = query;
    const { templateId } = params;
    const {
      collectionName,
      itemId,
      pdfDownloadOptions,
      saveToCollection = false,
      collection: collectionToSave,
      collectionField,
    } = body;
    const { format } = pdfDownloadOptions;
    const pdfTemplate = await findTemplate(builderDB, { uuid: templateId });
    let item = { data: null };

    let pdfContent = pdfTemplate.content;
    const pdfCollectionName = pdfTemplate.collectionId;
    const pdfTemplateName = pdfTemplate.name;
    if (pdfCollectionName && collectionName) {
      if (pdfCollectionName === collectionName) {
        //Get Collection
        const collection = await findOneService(builderDB, { projectId, collectionName });
        // Get Item data
        item = await findItemById(db, projectId, collection, itemId);
        // Decrypt data
        let decryptedResponse;
        if (item.data) {
          decryptedResponse = await cryptService(
            item.data,
            builderDB,
            projectId,
            collection,
            true,
            false,
            true,
          );
        }
        if (decryptedResponse) {
          if (decryptedResponse.status === 'FAILED') {
            res.status(400).send({ message: decryptedResponse.message });
          } else item.data = decryptedResponse;
        }
      } else {
        const error = new AppError('Collection is not similar to Template Collection');
        res.status(400).send(error);
      }
    }
    pdfContent = await replaceLocalizationContent(builderDB, projectId, lang, pdfContent);
    let scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;
    let pdfContentHtml = pdfContent['nocode-html']
      ? pdfContent['nocode-html'].replace(scriptRegex, '')
      : '';
    let pdfContentCss = pdfContent['nocode-css'] ? pdfContent['nocode-css'] : '';
    pdfContentHtml = await addDynamicDataIntoElement(
      pdfContentHtml,
      pdfContentCss,
      collectionName,
      itemId,
      item.data,
      builderDB,
      db,
      headers,
      projectId,
      timezone,
      dateFormat,
      tenant,
      user,
      environment,
      format,
    );
    const host = req.get('host');
    const pdfObj = {
      host,
      pdfTemplateName,
      pdfContent: pdfContentHtml,
      pdfDownloadOptions,
      saveToCollection,
      collectionToSave,
      collectionField,
      itemId,
      collectionName,
    };
    await pdfFromSnippet(builderDB, db, projectId, pdfObj, res);
  } catch (e) {
    console.error('downloadPDFTemplateContent ~ error:', e);
    next(e);
  }
};

export const downloadAgreementTemplateContent = async (req, res, next) => {
  try {
    const { builderDB, db, params, projectId, body, user, environment } = req;
    const { templateId } = params;
    const {
      collectionName,
      itemId,
      pdfDownloadOptions,
      saveToCollection = false,
      collection: collectionToSave,
      collectionField,
    } = body;
    const pdfTemplate = await findEmailTemplate(builderDB, { uuid: templateId });
    let item = { data: null };
    let pdfContent = pdfTemplate.content;
    const pdfCollectionName = pdfTemplate.collectionId;
    const pdfTemplateName = pdfTemplate.name;

    if (pdfCollectionName && collectionName) {
      if (pdfCollectionName === collectionName) {
        //Get Collection
        const collection = await findOneService(builderDB, { projectId, collectionName });
        // Get Item data
        item = await findItemById(db, projectId, collection, itemId);
        // Decrypt data
        let decryptedResponse;
        if (item.data) {
          decryptedResponse = await cryptService(
            item.data,
            builderDB,
            projectId,
            collection,
            true,
            false,
            true,
          );
        }
        if (decryptedResponse) {
          if (decryptedResponse.status === 'FAILED') {
            res.status(400).send({ message: decryptedResponse.message });
          } else item.data = decryptedResponse;
        }
      } else {
        const error = new AppError('Collection is not similar to Template Collection');
        res.status(400).send(error);
      }
    }

    const templateCollection = await findOneService(builderDB, {
      projectId,
      collectionName: pdfTemplate.collectionId,
    });
    const userCollection = await findOneService(builderDB, {
      projectId,
      collectionName: 'user',
    });
    pdfContent = replaceFieldsIntoTemplate(
      pdfContent,
      item.data,
      user,
      environment,
      templateCollection,
      userCollection,
      {},
    );
    const host = req.get('host');
    const pdfObj = {
      host,
      pdfTemplateName,
      pdfContent,
      pdfDownloadOptions,
      saveToCollection,
      collectionToSave,
      collectionField,
      itemId,
      collectionName,
    };
    await pdfFromSnippet(builderDB, db, projectId, pdfObj, res);
  } catch (e) {
    console.error('downloadPDFTemplateContent ~ error:', e);
    next(e);
  }
};

export const pdfFromSnippet = async (builderDB, db, projectId, pdfObj, res) => {
  let {
    host,
    pdfTemplateName,
    pdfContent,
    pdfDownloadOptions,
    saveToCollection,
    collectionToSave,
    collectionField,
    itemId,
    collectionName,
  } = pdfObj;
  const { marginTop, marginBottom, marginLeft, marginRight, printBackground, format } =
    pdfDownloadOptions;

  let margin = {};
  if (marginTop) margin.top = `${marginTop}cm`;
  if (marginBottom) margin.bottom = `${marginBottom}cm`;
  if (marginLeft) margin.left = `${marginLeft}cm`;
  if (marginRight) margin.right = `${marginRight}cm`;
  const pdfOptions = {
    printBackground: printBackground || false,
    preferCSSPageSize: true,
    format: format ? format : 'A4',
    margin,
  };
  let pdfName = `${pdfTemplateName}`;
  if (collectionName) pdfName += '_' + collectionName;
  if (itemId) pdfName += '_' + itemId;
  const pdfBuffer = await convertHtmlToPdf(pdfContent, pdfOptions);
  if (saveToCollection) {
    const uploadResponse = await savePDFToCollection(
      pdfBuffer,
      builderDB,
      db,
      projectId,
      collectionToSave,
      collectionField,
      itemId,
      host,
    );
    if (uploadResponse.code === 201 || uploadResponse.code === 200) {
      res.status(200).send({
        message: 'PDF saved to collection successfully',
        data: uploadResponse,
        status: 200,
      });
    } else {
      res
        .status(500)
        .send({ message: 'Failed to save PDF to collection', error: uploadResponse.error });
    }
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', pdfName);
    res.status(200).send(pdfBuffer);
  }
};

const savePDFToCollection = async (
  pdfBuffer,
  builderDB,
  db,
  projectId,
  collectionName,
  collectionField,
  itemId,
  host,
) => {
  try {
    const formData = new FormData();
    const fileName = `${collectionName}_${itemId}.pdf`;
    const file = Buffer.from(pdfBuffer);
    formData.append('file', file, {
      filename: fileName,
      contentType: 'application/pdf',
    });
    const endpoint = `https://${host}${UPLOAD_ROUTE}/upload/${collectionName}/${collectionField}`;
    const requestHeaders = {
      ...formData.getHeaders(),
    };
    const response = await axios.post(endpoint, formData, {
      headers: requestHeaders,
    });
    if (response.data) {
      const itemData = { [collectionField]: response.data };
      const addItem = await updateItemById(
        builderDB,
        db,
        projectId,
        collectionName,
        itemId,
        itemData,
      );
      return addItem;
    }
  } catch (error) {
    console.error('savePDFToCollection ~ error:', error);
    return { status: 'failure', error: error.message };
  }
};

const replaceLocalizationContent = async (builderDB, projectId, lang, content) => {
  const localizations = await fetchLocalization(builderDB, projectId);
  console.log('localizations', localizations);
  const localization =
    lang && !['null', 'undefined'].includes(lang) && !['null', 'undefined'].includes(typeof lang)
      ? localizations.find((local) => local.language === lang)
      : localizations.find((local) => local.isDefault);
  content['nocode-html'] = addLocalizationDataIntoElements(content['nocode-html'], localization);
  return content;
};

const fetchLocalization = async (builderDB, projectId) => {
  const Localization = builderDB.collection('localization');
  return Localization.find({ projectId }).toArray();
};

const getTemplate = async (builderDB, projectId, lang, query) => {
  const response = await findTemplate(builderDB, query);
  if (response?.content) {
    response.content = await replaceLocalizationContent(
      builderDB,
      projectId,
      lang,
      response.content,
    );
  }
  return response;
};

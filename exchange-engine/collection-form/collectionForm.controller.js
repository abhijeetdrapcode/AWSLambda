import { checkCollectionByName, findOneService } from '../collection/collection.service';
import {
  addToItemFieldById,
  removeFromItemFieldById,
  removeItemById,
  saveItem,
  importItemFromCSV,
  findOneItemByQuery,
  downloadPDF,
  extractTextFromPDF,
  downloadFile,
  updateBulkData,
  updateItemById,
} from '../item/item.service';
import { COLLECTION_NOT_EXIST_MSG } from '../utils/appUtils';
import { processSingleDocument } from './anyfile-to-text/document-processor';
import fs from 'fs';
import {
  processNlpAnonymization,
  processCustomTermsAnonymization,
} from './anyfile-to-text/anonymization-processor';

export const createItem = async (req, res, next) => {
  const {
    builderDB,
    params,
    db,
    body,
    user,
    projectId,
    decrypt,
    enableAuditTrail,
    headers,
    environment,
  } = req;
  const { constructorId, collectionName, survey } = params;
  const isSurveySubmission = survey ? survey === 'survey' : false;

  try {
    if (isSurveySubmission && body.answers && body.answers.length) {
      let errorResponse = null;
      let responseDataArr = [];
      await Promise.all(
        body.answers.map(async (element) => {
          if (!errorResponse) {
            const submissionBody = {
              batch_id: body.batch_id,
              questionnaire_survey: body.questionnaire_survey,
              question: element.question,
              answer: element.answer,
            };

            const response = await saveItem(
              builderDB,
              db,
              projectId,
              environment,
              enableAuditTrail,
              collectionName,
              submissionBody,
              constructorId,
              user,
              headers,
              decrypt,
            );
            if (response.code === 201) {
              responseDataArr[element.question] = response.data;
            } else {
              errorResponse = response;
            }
          }
        }),
      );

      //ToDO: Need to do better error handling for Answers
      if (errorResponse) {
        return res.status(errorResponse.code).send(errorResponse.data);
      } else {
        return res.status(200).send(responseDataArr);
      }
    } else {
      if (['file_activity_tracker', 'user_activity_tracker'].includes(collectionName)) {
        const ipAddress = headers['x-user-ip'];
        body.ipAddress = ipAddress;
        body.userId = body.userId ? body.userId : user.userName;
      }
      const response = await saveItem(
        builderDB,
        db,
        projectId,
        environment,
        enableAuditTrail,
        collectionName,
        body,
        constructorId,
        user,
        headers,
        decrypt,
      );

      return res.status(response.code).send(response.data);
    }
  } catch (err) {
    next(err);
  }
};

export const importFromCSV = async (req, res, next) => {
  const { builderDB, params, db, body, user, tenant, projectId } = req;
  const { collectionName } = params;
  try {
    const result = await importItemFromCSV(
      builderDB,
      db,
      projectId,
      collectionName,
      user,
      body,
      tenant,
    );
    if (result.status === 200) {
      res.status(result.status).json({
        insertedCount: result.data.insertedCount,
        errors: result.errors,
      });
    } else if (result.status === 404) {
      return res.status(result.status).json({ message: result.msg });
    } else {
      return res.status(result.status).json({ message: result.msg, errors: result.errors });
    }
  } catch (error) {
    next(error);
  }
};

export const update = async (req, res, next) => {
  const { builderDB, params, db, body, user, projectId, decrypt, enableAuditTrail, environment } =
    req;
  const { collectionName, itemId } = params;
  const collectionData = await findOneService(builderDB, { projectId, collectionName });

  if (!collectionData) {
    return res.status(404).send('Collection not found with provided name');
  }

  try {
    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionData,
      itemId,
      body,
      user,
      req.headers,
      decrypt,
    );

    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};

export const bulkUpdate = async (req, res, next) => {
  const {
    builderDB,
    params,
    db,
    body,
    user,
    projectId,
    enableAuditTrail,
    decrypt,
    headers,
    environment,
  } = req;
  const { collectionName } = params;
  try {
    const { selectedItemsIds } = body;
    const selectedItemsIdsArr = selectedItemsIds ? selectedItemsIds.split(',') : [];

    if (!selectedItemsIdsArr.length)
      return res.status(400).json({
        status: 'error',
        type: 'Invalid IDs',
        message: 'Missing Ids to update',
        data: 'Missing Ids to update',
      });

    const response = await updateBulkData(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      selectedItemsIdsArr,
      body,
      user,
      headers,
      decrypt,
    );

    if (!response.success) {
      const { errorResponse } = response;
      if (errorResponse) {
        return res.status(errorResponse.code).send(errorResponse.data);
      }
      return res.status(400).json({
        status: 'error',
        type: 'Error',
        message: 'Failed',
        data: 'Failed',
      });
    }
    const { responseData } = response;
    return res.status(200).send(responseData);
  } catch (err) {
    next(err);
  }
};

export const addToItemField = async (req, res, next) => {
  const { builderDB, params, db, body, user, projectId, enableAuditTrail, environment } = req;
  const { collectionName, itemId, collectionFieldId } = params;

  try {
    const response = await addToItemFieldById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      itemId,
      collectionFieldId,
      body,
      user,
    );
    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};

export const removeFromItemField = async (req, res, next) => {
  const { builderDB, db, params, body, user, projectId, enableAuditTrail, environment } = req;
  const { collectionName, itemId, collectionFieldId } = params;
  try {
    const response = await removeFromItemFieldById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      itemId,
      collectionFieldId,
      body,
      user,
    );
    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};

export const deleteItem = async (req, res, next) => {
  try {
    const { builderDB, db, params, projectId, enableAuditTrail, environment } = req;
    let { itemId, collectionName } = params;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);
    let data = await removeItemById(
      db,
      builderDB,
      projectId,
      environment,
      enableAuditTrail,
      collectionName,
      itemId,
    );
    return res.status(data.code || 500).send(data);
  } catch (error) {
    next(error);
  }
};

export const pdfToTextField = async (req, res, next) => {
  try {
    const { builderDB, db, params, projectId, user, environment, enableAuditTrail } = req;
    const { collectionName, itemId, fieldForPdf, fieldForText } = params;
    const collectionData = await findOneService(builderDB, { projectId, collectionName });
    if (!collectionData) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);

    const itemByQuery = await findOneItemByQuery(db, collectionName, {
      uuid: itemId,
    });
    if (!itemByQuery) {
      console.error('Item not found');
      res.status(400).send('Item not found');
    }
    let key;
    let isEncrypted;

    if (
      itemByQuery[fieldForPdf] &&
      typeof itemByQuery[fieldForPdf] === 'object' &&
      !Array.isArray(itemByQuery[fieldForPdf])
    ) {
      key = itemByQuery[fieldForPdf].key;
      isEncrypted = itemByQuery[fieldForPdf].isEncrypted;
    } else if (Array.isArray(itemByQuery[fieldForPdf])) {
      key = itemByQuery[fieldForPdf][0]?.key;
      isEncrypted = itemByQuery[fieldForPdf][0]?.isEncrypted;
    }
    let text = '';
    if (key) {
      const pdfPath = await downloadPDF(key, builderDB, projectId, isEncrypted, environment);
      if (!pdfPath) {
        console.error('Unable to download');
        res.status(404).send('Unable to download');
      }
      text = await extractTextFromPDF(pdfPath);
      if (!text) {
        console.error('Unable to extract your PDF');
        res.status(404).send('Unable to extract your PDF');
      }
    }
    const body = {
      [fieldForText]: text,
    };
    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionData,
      itemId,
      body,
      user,
      req.headers,
    );
    return res.status(response.code).send(response.data);
  } catch (error) {
    next(error);
  }
};

export const anyFileToText = async (req, res, next) => {
  let files = [];
  try {
    const { builderDB, db, params, projectId, user, environment, enableAuditTrail } = req;
    const { collectionName, itemId, fieldForPdf, fieldForText } = params;
    let collectionData = await findOneService(builderDB, { projectId, collectionName });
    if (!collectionData) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);

    const itemByQuery = await findOneItemByQuery(db, collectionName, {
      uuid: itemId,
    });
    if (!itemByQuery) {
      throw new Error({ message: 'Item not found' });
    }
    const documents = itemByQuery[fieldForPdf];
    let text = '';
    if (documents) {
      const isEncrypted = documents.isEncrypted;
      let documents_array = Array.isArray(documents) ? documents : [documents];
      const filePromises = documents_array.map(async (document) => {
        try {
          const file = await downloadFile(document, builderDB, projectId, isEncrypted, environment);
          return file;
        } catch (error) {
          console.error(`Error downloading file for key ${document}:`, error);
          return { error: new Error(`Download failed for document ${document}`) };
        }
      });
      files = await Promise.all(filePromises);
      const results = [];
      const maxConcurrentProcessing = 3;
      const totalDocs = files?.length;
      if (totalDocs && totalDocs === 1) {
        const file = files?.[0];
        const fileText = await processSingleDocument(file);
        results.push(fileText);
      } else {
        for (let i = 0; i < files.length; i += maxConcurrentProcessing) {
          const batch = files.slice(i, i + maxConcurrentProcessing);
          const batchResults = await Promise.all(
            batch.map(async (file) => {
              const fileName = file.originalname;
              const fileText = await processSingleDocument(file);
              return `${fileName}:\n${fileText}`;
            }),
          );
          results.push(...batchResults);
        }
      }
      text = results.filter(Boolean).join('\n\n');
      if (!text) {
        console.error('Unable to extract your PDF');
        res.status(404).send('Unable to extract your PDF');
      }
    } else {
      console.warn('No document found!');
    }

    const body = {
      [fieldForText]: text,
    };
    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionData,
      itemId,
      body,
      user,
      req.headers,
    );
    return res.status(response.code).send(response.data);
  } catch (error) {
    next(error);
  } finally {
    try {
      files.forEach((file) => {
        if (file && file.path) {
          fs.unlinkSync(file.path);
        }
      });
    } catch (cleanupError) {
      console.error('Error cleaning up files:', cleanupError);
    }
  }
};

const processAnonymization = async (req, res, next, processFunction) => {
  try {
    const { builderDB, db, params, projectId, user, enableAuditTrail, environment } = req;
    const {
      collectionName,
      itemId,
      fieldForSourceText,
      fieldForCustomTerms,
      fieldForAnonymizedText,
    } = params;

    const collectionData = await findOneService(builderDB, { projectId, collectionName });
    if (!collectionData) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);

    const itemByQuery = await findOneItemByQuery(db, collectionName, {
      uuid: itemId,
    });
    if (!itemByQuery) {
      console.error('Item not found');
      return res.status(400).send('Item not found');
    }

    const sourceText =
      typeof itemByQuery[fieldForSourceText] === 'string' ? itemByQuery[fieldForSourceText] : null;

    const customTerms =
      typeof itemByQuery[fieldForCustomTerms] === 'string'
        ? itemByQuery[fieldForCustomTerms]
        : null;

    const { processedContent, termDetails } = sourceText
      ? await processFunction(sourceText, customTerms)
      : '';

    const body = {
      [fieldForAnonymizedText]: processedContent,
    };

    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      environment,
      enableAuditTrail,
      collectionData,
      itemId,
      body,
      user,
      req.headers,
    );
    response.data.termDetails = termDetails;
    return res.status(response.code).send(response.data);
  } catch (error) {
    next(error);
  }
};

export const nlpAnonymization = (req, res, next) =>
  processAnonymization(req, res, next, processNlpAnonymization);

export const customTermsAnonymization = (req, res, next) =>
  processAnonymization(req, res, next, processCustomTermsAnonymization);

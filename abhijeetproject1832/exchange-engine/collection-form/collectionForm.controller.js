import { checkCollectionByName } from '../collection/collection.service';
import {
  addToItemFieldById,
  removeFromItemFieldById,
  removeItemById,
  saveItem,
  updateItemById,
  importItemFromCSV,
  findOneItemByQuery,
  downloadPDF,
  extractTextFromPDF,
  downloadFile,
} from '../item/item.service';
import { COLLECTION_NOT_EXIST_MSG } from '../utils/appUtils';
import { findForLog, storeLogs } from '../utils/auditLogs.utils';
import { getUserIp } from '../utils/utils';
import { processSingleDocument } from './anyfile-to-text/document-processor';
import fs from 'fs';
import { processAnonymization } from './anyfile-to-text/anonymization-processor';

export const createItem = async (req, res, next) => {
  const { builderDB, params, db, body, user, projectId, ip, decrypt } = req;
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
              collectionName,
              submissionBody,
              constructorId,
              user,
              req.headers,
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
      if (
        collectionName === 'file_activity_tracker' ||
        collectionName === 'user_activity_tracker'
      ) {
        const ipAddress = await getUserIp();
        body.ipAddress = ipAddress;
        body.userId = body.userId ? body.userId : user.userName;
      }
      const response = await saveItem(
        builderDB,
        db,
        projectId,
        collectionName,
        body,
        constructorId,
        user,
        req.headers,
        decrypt,
      );
      storeLogs(user, ip, req.headers['user-agent'], {}, response.data, 'create');
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
  const { builderDB, params, db, body, user, projectId, ip, decrypt } = req;
  const { collectionName, itemId } = params;
  try {
    let prevData = await findForLog(db, collectionName, itemId);
    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      collectionName,
      itemId,
      body,
      user,
      req.headers,
      decrypt,
    );
    storeLogs(user, ip, req.headers['user-agent'], prevData, { uuid: itemId }, 'update');
    return res.status(response.code).send(response.data);
  } catch (err) {
    next(err);
  }
};

export const bulkUpdate = async (req, res, next) => {
  const { builderDB, params, db, body, user, projectId } = req;
  const { collectionName } = params;
  try {
    const { selectedItemsIds } = body;
    const selectedItemsIdsArr = selectedItemsIds ? selectedItemsIds.split(',') : [];
    let errorResponse = null;
    let responseData = {};

    if (selectedItemsIdsArr.length > 0) {
      await Promise.all(
        selectedItemsIdsArr.map(async (itemId) => {
          if (!errorResponse) {
            const response = await updateItemById(
              builderDB,
              db,
              projectId,
              collectionName,
              itemId,
              body,
              user,
            );
            if (response.code === 200) {
              responseData[itemId] = response.data;
            } else {
              errorResponse = response;
            }
          }
        }),
      );
    }

    //ToDO: Need to do better error handling for Bulk Update
    if (errorResponse) {
      return res.status(errorResponse.code).send(errorResponse.data);
    } else {
      return res.status(200).send(responseData);
    }
  } catch (err) {
    next(err);
  }
};

export const addToItemField = async (req, res, next) => {
  const { builderDB, params, db, body, user, projectId } = req;
  const { collectionName, itemId, collectionFieldId } = params;

  try {
    const response = await addToItemFieldById(
      builderDB,
      db,
      projectId,
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
  const { builderDB, db, params, body, user, projectId } = req;
  const { collectionName, itemId, collectionFieldId } = params;
  try {
    const response = await removeFromItemFieldById(
      builderDB,
      db,
      projectId,
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
    const { builderDB, db, params, projectId, ip, user } = req;
    let { itemId, collectionName } = params;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);

    let prevData = await findForLog(db, collectionName, itemId);
    let data = await removeItemById(db, collectionName, itemId);

    storeLogs(user, ip, req.headers['user-agent'], prevData, { uuid: itemId }, 'delete');
    return res.status(data.code || 500).send(data);
  } catch (error) {
    next(error);
  }
};

export const pdfToTextField = async (req, res, next) => {
  try {
    const { builderDB, db, params, projectId, user, environment } = req;
    const { collectionName, itemId, fieldForPdf, fieldForText } = params;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);
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
      console.log('pdfPath', pdfPath);
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
      collectionName,
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
    const { builderDB, db, params, projectId, user, environment } = req;
    const { collectionName, itemId, fieldForPdf, fieldForText } = params;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);
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
      for (let i = 0; i < files.length; i += maxConcurrentProcessing) {
        const batch = files.slice(i, i + maxConcurrentProcessing);
        const batchResults = await Promise.all(batch.map((file) => processSingleDocument(file)));
        results.push(...batchResults);
      }
      text = results.join('\n');
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
      collectionName,
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

export const textAnonymization = async (req, res, next) => {
  try {
    const { builderDB, db, params, projectId, user } = req;
    const {
      collectionName,
      itemId,
      fieldForSourceText,
      fieldForCustomTerms,
      fieldForAnonymizedText,
    } = params;
    let isExist = await checkCollectionByName(builderDB, projectId, collectionName);
    if (!isExist) return res.status(404).send(COLLECTION_NOT_EXIST_MSG);

    const itemByQuery = await findOneItemByQuery(db, collectionName, {
      uuid: itemId,
    });
    if (!itemByQuery) {
      console.error('Item not found');
      res.status(400).send('Item not found');
    }
    let sourceText, customTerms;
    const sourceVal = itemByQuery[fieldForSourceText];
    const customTermVal = itemByQuery[fieldForCustomTerms];

    if (sourceVal && typeof sourceVal === 'string') {
      sourceText = sourceVal;
    }
    if (customTermVal && typeof customTermVal === 'string') {
      customTerms = customTermVal;
    }
    let processedContent = '';
    if (sourceText) {
      processedContent = await processAnonymization(sourceText, customTerms);
    }
    const body = {
      [fieldForAnonymizedText]: processedContent,
    };
    const response = await updateItemById(
      builderDB,
      db,
      projectId,
      collectionName,
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

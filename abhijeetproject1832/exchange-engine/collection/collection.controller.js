import { AppError } from 'drapcode-utility';
import { checkUniqueValidationFromCollection } from '../item/item.service';
import { findOneService } from './collection.service';
import { createProfilerService, updateProfilerService } from '../profiling/profiler.service';
import { v4 as uuidv4 } from 'uuid';
import { API } from '../utils/enums/ProfilerType';

export const findByName = async (req, res, next) => {
  const { builderDB, db, projectId, params, enableProfiling } = req;
  const apiEnterUuid = uuidv4();
  try {
    const { collectionName } = params;
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiEnterUuid,
      API,
      `COLLECTION -> findByName`,
      {
        collectionName,
      },
    );
    const result = await findOneService(builderDB, { collectionName, projectId });
    updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
    if (result) {
      return res.send(result);
    } else {
      next(new AppError(`No collection data has found for ${collectionName}`, 500));
    }
  } catch (err) {
    next(err);
  }
};

export const findById = async (req, res, next) => {
  const { builderDB, db, projectId, params, enableProfiling } = req;
  const apiEnterUuid = uuidv4();
  try {
    const { uuid } = params;
    createProfilerService(
      db,
      projectId,
      enableProfiling,
      apiEnterUuid,
      API,
      `COLLECTION -> findById`,
      {
        collectionId: uuid,
      },
    );
    const result = await findOneService(builderDB, { uuid, projectId });
    updateProfilerService(db, projectId, enableProfiling, apiEnterUuid);
    if (result) {
      return res.send(result);
    } else {
      next(new AppError(`No collection data has found for ${uuid}`, 500));
    }
  } catch (err) {
    next(err);
  }
};

export const checkUniqueValidation = async (req, res) => {
  const { query, db, params } = req;
  const { collectionName } = params;
  const result = await checkUniqueValidationFromCollection(db, collectionName, query);
  res.status(200).send(`${result}`);
};

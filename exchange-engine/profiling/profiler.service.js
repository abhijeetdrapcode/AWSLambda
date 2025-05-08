import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { logger } from 'drapcode-logger';
import { isNew } from '../utils/appUtils';
require('./profiler.model');

export const saveProfiler = async (dbConnection, data) => {
  let Profiler = dbConnection.model('Profiler');
  data.uuid = data.uuid || uuidv4();
  data.startTime = data.startTime || moment.now();
  const profiler = new Profiler(data);
  return profiler.save();
};

export const updateProfiler = async (dbConnection, uuid, data) => {
  const query = { uuid: uuid };
  const collectionName = 'profilers';
  let dbCollection = await dbConnection.collection(collectionName);
  let profiler = await dbCollection.findOne(query);
  if (profiler) {
    const endTimeMills = Number(data.endTime);
    const startTimeMills = Number(profiler.startTime);

    data.duration = endTimeMills - startTimeMills;
    data.updatedAt = new Date();
    let newValues = { $set: data, $inc: { __v: 1 } };
    await dbCollection.findOneAndUpdate(query, newValues, isNew);
  }
};

export const clearProfilerData = async (dbConnection, collectionName = 'profilers') => {
  try {
    const collection = await dbConnection.collection(collectionName);
    if (collection) await collection.drop();
  } catch (error) {
    logger.error(`Error clearProfilerData :>> ${error}`, { label: collectionName });
  }
};

export const listProfilerData = async (dbConnection, collectionName = 'profilers', page, limit) => {
  try {
    const collection = await dbConnection.collection(collectionName);
    const pageNumber = page ? Number(page) : 1;
    const pageSize = limit ? Number(limit) : 10;
    const skipValue = (pageNumber - 1) * pageSize;
    const profilerData = await collection.find({}).skip(skipValue).limit(pageSize).toArray();
    const totalItems = await collection.countDocuments({});
    const totalPages = Math.ceil(totalItems / pageSize);
    return {
      data: profilerData,
      totalItems,
      totalPages,
    };
  } catch (error) {
    logger.error(`Error in listProfilerData :>> ${error}`, { label: collectionName });
    throw error;
  }
};

export const createProfilerService = async (
  dbConnection,
  projectId,
  enableProfiling,
  uuid,
  step,
  message,
  meta = {},
) => {
  if (enableProfiling) {
    try {
      logger.info(`🚀 ~ Project: ${projectId} -> ID: ${uuid}`, { label: 'DB_PROFILERS_CREATE' });

      const data = {
        uuid: uuid || '',
        message: message || '',
        step: step || 'COMPUTING',
        startTime: moment.now().toString(),
        meta: {
          projectId: projectId || '',
          ...meta,
        },
      };
      await saveProfiler(dbConnection, data);
    } catch (err) {
      console.log('🚀 ~ ********* CREATE PROFILER SERVICE ENDS WITH ERROR ********* ~', err);
    }
  }
};

export const updateProfilerService = async (
  dbConnection,
  projectId,
  enableProfiling,
  uuid,
  message,
) => {
  if (enableProfiling) {
    try {
      logger.info(`🚀 ~ Project: ${projectId} -> ID: ${uuid}`, { label: 'DB_PROFILERS_UPDATE' });

      const data = {
        endTime: moment.now().toString(),
      };
      if (message) data['message'] = message;
      await updateProfiler(dbConnection, uuid, data);
    } catch (err) {
      console.log('🚀 ~ ********* UPDATE PROFILER SERVICE ENDS WITH ERROR ********* ~', err);
    }
  }
};

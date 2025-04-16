import { redis_get_method } from 'drapcode-redis';
import { getExchangeRedisKey, PROJECT_EVENTS } from '../project/build-utils';
import { allListService, findOneService } from './event.service';

export const findAllEvent = async (req, res, next) => {
  try {
    const { projectId, builderDB } = req;
    const REDIS_KEY_PROJECT_EVENTS = getExchangeRedisKey(projectId, PROJECT_EVENTS);
    const redisResult = (await redis_get_method(REDIS_KEY_PROJECT_EVENTS)) || null;
    if (redisResult && redisResult.length > 0) {
      console.log(`*** Found in redis! Returning events for project: ${projectId}`);
      return res.status(200).send(redisResult);
    } else {
      const result = await allListService(builderDB, { projectId });
      return res.status(200).send(result);
    }
  } catch (err) {
    next(err);
  }
};

export const findOneEvent = async (req, res, next) => {
  const { params, builderDB, projectId } = req;
  try {
    const REDIS_KEY_PROJECT_EVENTS = getExchangeRedisKey(projectId, PROJECT_EVENTS);
    const redisResult = (await redis_get_method(REDIS_KEY_PROJECT_EVENTS)) || null;
    let redisEvent = null;
    if (redisResult && redisResult.length > 0) {
      redisEvent = redisResult.find((item) => item.uuid === params.eventId);
    }
    if (redisEvent) {
      console.log(`*** Found in redis! Returning event: ${params.eventId}`);
      return res.send(redisEvent);
    } else {
      const result = await findOneService(builderDB, { uuid: params.eventId });
      return res.status(200).send(result);
    }
  } catch (err) {
    return next(err);
  }
};

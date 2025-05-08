import { redis_get_method } from 'drapcode-redis';
import { getExchangeRedisKey, PROJECT_CUSTOM_COMPONENTS } from '../project/build-utils';

export const getCustomComponentConfig = async (req, res, next) => {
  try {
    const { builderDB, params, projectId } = req;
    const { uuid } = params;
    const REDIS_KEY_PROJECT_CUSTOM_COMPONENTS = getExchangeRedisKey(
      projectId,
      PROJECT_CUSTOM_COMPONENTS,
    );
    const redisResult = (await redis_get_method(REDIS_KEY_PROJECT_CUSTOM_COMPONENTS)) || null;
    let redisCustomComponent = null;
    if (redisResult && redisResult.length > 0) {
      redisCustomComponent = redisResult.find((item) => item.uuid === uuid);
    }
    if (redisCustomComponent) {
      console.log(`*** Found in redis! Returning custom component: ${uuid}`);
      return res.status(200).send(redisCustomComponent);
    } else {
      const customComponents = await builderDB.collection('customcomponents').findOne({ uuid });

      return res.status(200).send(customComponents);
    }
  } catch (error) {
    console.error('get custom component config ~ error:', error);
    next(error);
  }
};

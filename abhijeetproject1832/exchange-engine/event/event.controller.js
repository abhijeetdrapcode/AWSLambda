import { allListService, findOneService } from './event.service';

export const findAllEvent = async (req, res, next) => {
  try {
    const { projectId, builderDB } = req;
    const result = await allListService(builderDB, { projectId });
    res.status(200).send(result);
  } catch (err) {
    next(err);
  }
};

export const findOneEvent = async (req, res, next) => {
  const { params, builderDB } = req;
  try {
    const result = await findOneService(builderDB, { uuid: params.eventId });
    return res.status(200).send(result);
  } catch (err) {
    return next(err);
  }
};

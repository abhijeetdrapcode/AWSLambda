import { findAllInstalledPlugin } from './installedPlugin.service';

export const findAll = (req, res, next) => {
  findAllInstalledPlugin(req.builderDB, req.projectId)
    .then((result) => {
      res.status(200).send(result);
    })
    .catch((err) => {
      next(err);
    });
};

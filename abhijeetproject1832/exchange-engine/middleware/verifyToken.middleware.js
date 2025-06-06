import { logger } from 'drapcode-logger';
import { findOneDevApisService, checkIpAddresses } from '../developer/developer.service';

const verifyToken = async (req, res, next) => {
  try {
    let { environment, connectorApiKey, headers, projectName, url, method, projectId, builderDB } =
      req;

    const apiNotEnableObj = {
      errStatus: 401,
      message: 'Developer API is not Enabled.',
      status: 'FAILED',
    };

    if (!environment) {
      return res.status(401).json({
        errStatus: 404,
        message: 'Environment does not exist in this Project',
        status: 'FAILED',
      });
    }
    logger.info(`${labelPrint} projectEnvs => ${JSON.stringify(environment)}`, label);
    const label = { label: projectName };
    const labelPrint = 'DEVELOPER API::';

    //Check for IP address
    const { key, ipAddresses } = environment;
    logger.info(`${labelPrint} key => ${key}`, label);
    logger.info(`${labelPrint} ipAddresses => ${ipAddresses}`, label);

    let clientIp = headers['x-forwarded-for'] || req.connection.remoteAddress;
    logger.info(`Client IP: ${clientIp}`, label);

    let isValidIp = checkIpAddresses(clientIp, ipAddresses);
    if (!isValidIp) {
      logger.info(
        `${labelPrint} IP address is not allowed:: ${clientIp} isValidIp:: ${isValidIp}`,
        label,
      );
      return res.status(403).json({
        errStatus: 403,
        message: 'Unauthorized, Request from this IP is not allowed.',
        status: 'FAILED',
      });
    }
    console.log('***** Checking URL restrictions *****');

    const baseURL = url.split('?')[0];
    console.log('baseURL', baseURL);
    const devApiEnable = await findOneDevApisService(builderDB, {
      projectId,
      url: baseURL,
      method,
    });

    console.log('devApiEnable', devApiEnable);
    if (!devApiEnable) {
      return res.status(401).json(apiNotEnableObj);
    }
    const { enable, auth, isEncrypted, userAuthenticate, roles, permissions } = devApiEnable;

    const reqKey = headers['x-api-key'];
    console.log('********** **********');
    console.log('********** **********');

    logger.info(`${labelPrint} connectorApiKey => ${connectorApiKey}`, label);
    logger.info(`${labelPrint} reqKey => ${reqKey}`, label);
    console.log('********** **********');
    console.log('********** **********');

    /**
     * This condition is used to bypass request from data-sync app
     */
    if (connectorApiKey && reqKey && connectorApiKey === reqKey) {
      req.decrypt = isEncrypted;
      console.log('******req.decrypt***', req.decrypt);
      return next();
    }

    if (!enable) {
      logger.info(`${labelPrint} API is not enable`);
      return res.status(401).json(apiNotEnableObj);
    }

    if (auth) {
      if (!key) {
        logger.error(`${labelPrint} No Key generated for this API`, label);
        return res.status(401).json({
          errStatus: 401,
          message: 'No key generated for this API',
          status: 'FAILED',
        });
      }

      if (!reqKey) {
        logger.error(`${labelPrint} No keys provided`, label);
        return res.status(401).json({
          errStatus: 401,
          message: 'Authentication key is missing',
          status: 'FAILED',
        });
      }

      if (key !== reqKey) {
        logger.error(`${labelPrint} Provided key is not valid`, label);
        return res.status(403).json({
          errStatus: 403,
          message: 'Unauthorized, authorization key is not valid',
          status: 'FAILED',
        });
      }
    }
    req.decrypt = isEncrypted;
    req.devUserAuthenticate = userAuthenticate;
    req.devUserRoles = roles;
    req.devUserPermissions = permissions;
    console.log('******req.decrypt***', req.decrypt);
    return next();
  } catch (error) {
    logger.error(error);
    const { errStatus, status, message } = error;
    return res.status(errStatus ? errStatus : 400).json({
      error: error,
      status: status ? status : 'ERROR',
      message: message ? message : '',
    });
  }
};

export default verifyToken;

import { findProjectByQuery } from '../project/project.service';
import { connectProjectDatabase, createConnection } from './mongoUtil';
import { logger } from 'drapcode-logger';
import { serverDomains } from './constants';
import { extractEnvironment } from './envUtil';
require('./global.database.config');
let ITEM_DB_HOST = process.env.ITEM_DB_HOST;
let ITEM_DB_PORT = process.env.ITEM_DB_PORT;
let ITEM_DB_USERNAME = process.env.ITEM_DB_USERNAME;
let ITEM_DB_PASSWORD = process.env.ITEM_DB_PASSWORD;

let CONFIG_DB_HOST = process.env.CONFIG_DB_HOST;
let CONFIG_DB_PORT = process.env.CONFIG_DB_PORT;
let CONFIG_DB_USERNAME = process.env.CONFIG_DB_USERNAME;
let CONFIG_DB_PASSWORD = process.env.CONFIG_DB_PASSWORD;

let PROJECT_HOSTNAME = process.env.PROJECT_HOSTNAME;

ITEM_DB_HOST = ITEM_DB_HOST || 'localhost';
ITEM_DB_PORT = ITEM_DB_PORT || 27017;
ITEM_DB_USERNAME = ITEM_DB_USERNAME || '';
ITEM_DB_PASSWORD = ITEM_DB_PASSWORD || '';

CONFIG_DB_HOST = CONFIG_DB_HOST || 'localhost';
CONFIG_DB_PORT = CONFIG_DB_PORT || 27017;
CONFIG_DB_USERNAME = CONFIG_DB_USERNAME || '';
CONFIG_DB_PASSWORD = CONFIG_DB_PASSWORD || '';

const dbConnection = async (req, res, next) => {
  const { subdomains, headers, originalUrl, hostname } = req;
  let isGlobalUsed = false;
  logger.info(`PROJECT_HOSTNAME: >> ${PROJECT_HOSTNAME} hostname: >> ${hostname}`);
  if (PROJECT_HOSTNAME === hostname) {
    isGlobalUsed = true;
  }

  let { origin, referer, projectid } = headers;
  logger.info(`referer :>> ${referer} origin :>> ${origin}`);
  let builderDB = null;
  try {
    const condition =
      originalUrl.includes('/api/v1/projects/build') ||
      originalUrl.includes('/api/v1/code-export/process');
    if (condition) {
      logger.warn('I am project build related');
      if (!projectid) {
        return res.status(400).json({ message: 'Not a valid project. Please contact Admin' });
      }
      const pConfigDatabase = `project_config_${projectid}`;
      req.builderDB = isGlobalUsed
        ? Global_builderDB
        : await connectProjectDatabase(
            CONFIG_DB_HOST,
            pConfigDatabase,
            CONFIG_DB_PORT,
            CONFIG_DB_USERNAME,
            CONFIG_DB_PASSWORD,
          );

      next();
    } else {
      if (isGlobalUsed) {
        logger.warn('I am global connection', {
          projectId: Global_projectId,
          projectName: Global_projectName,
          timezone: Global_timezone,
        });
        req.db = Global_db;
        req.builderDB = Global_builderDB;
        req.projectId = Global_projectId;
        req.projectName = Global_projectName;
        req.projectCreatedAt = Global_projectCreatedAt;
        req.projectConstants = Global_projectConstants;
        req.timezone = Global_timezone;
        req.environment = Global_environment;
        req.connectorApiKey = Global_connectorApiKey;
        req.projectUrl = Global_projectUrl;
        req.dateFormat = Global_dateFormat;
        req.enableProfiling = Global_enableProfiling;
        return next();
      }
      let query = { $or: [] };
      let project = null;
      if (hostname.includes(process.env.EXCHANGE_ENGINE_DOMAIN)) {
        if (origin) {
          logger.warn('I am inside origin');
          origin = origin.replace('http://', '').replace('https://', '');
          origin = origin.split(':')[0];
          query.$or.push({ domainName: origin });
        }
        let projectSeoName = null;
        logger.info(`subdomains:>> ${subdomains}`);
        if (serverDomains.includes(subdomains[0])) {
          logger.warn('I am staging');
          projectSeoName = subdomains[2];
        } else {
          projectSeoName = subdomains[1];
        }
        if (projectSeoName === undefined && projectSeoName == 'undefined') {
          return res.status(400).send('Please use subdomain');
        }
        query.$or.push({ seoName: projectSeoName });
      } else {
        query = { apiDomainName: hostname };
      }
      console.log('query ***** I am testing this', query);
      const pDetailDB = await createConnection(
        CONFIG_DB_HOST,
        'project_detail',
        CONFIG_DB_PORT,
        CONFIG_DB_USERNAME,
        CONFIG_DB_PASSWORD,
      );
      project = await findProjectByQuery(pDetailDB, query);
      pDetailDB.close();
      req.db = null;
      req.builderDB = null;
      if (project) {
        const pDatabase = `project_${project.uuid}`;
        const pcDatabase = `project_config_${project.uuid}`;
        try {
          req.db = await connectProjectDatabase(
            ITEM_DB_HOST,
            pDatabase,
            ITEM_DB_PORT,
            ITEM_DB_USERNAME,
            ITEM_DB_PASSWORD,
          );
          console.log('Connection to DB done');
          req.builderDB = await connectProjectDatabase(
            CONFIG_DB_HOST,
            pcDatabase,
            CONFIG_DB_PORT,
            CONFIG_DB_USERNAME,
            CONFIG_DB_PASSWORD,
          );
          console.log('Connection to builder DB done');
        } catch (error) {
          logger.error(`error Failed to Connect Project Database ${error}`);
        }

        let currentEnvironment = extractEnvironment(project.environments);
        req.projectId = project.uuid;
        req.projectName = project.name;
        req.projectCreatedAt = project.createdAt;
        req.projectConstants = project.constants;
        req.timezone = project.timezone;
        req.environment = currentEnvironment;
        req.connectorApiKey = project.connectorApiKey;
        req.projectUrl = project.url;
        req.dateFormat = project.dateFormat;
        req.enableProfiling = project.enableProfiling;
        console.log('Going to next');
        return next();
      } else {
        return res.status(404).send('This url does not exist. Please publish again.');
      }
    }
  } catch (error) {
    logger.error(`error failed to connect database :>> ${error}`);
    return res.status(404).send('This url does not exist. Failed to connect to database');
  }
};

export default dbConnection;

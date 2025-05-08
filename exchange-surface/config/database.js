import { findProjectByQuery } from '../project/project.service';
import { serverDomains, uatEnvs } from './constants';
import {
  createConnection,
  connectProjectDatabase,
  passProjectDataFromGloballyToReq,
  passProjectDataInReq,
} from './database.utils';
require('./global.database.config');
let ITEM_DB_HOST = process.env.ITEM_DB_HOST;
let ITEM_DB_USERNAME = process.env.ITEM_DB_USERNAME;
let ITEM_DB_PASSWORD = process.env.ITEM_DB_PASSWORD;

let CONFIG_DB_HOST = process.env.CONFIG_DB_HOST;
let CONFIG_DB_USERNAME = process.env.CONFIG_DB_USERNAME;
let CONFIG_DB_PASSWORD = process.env.CONFIG_DB_PASSWORD;

let PROJECT_HOSTNAME = process.env.PROJECT_HOSTNAME;

ITEM_DB_HOST = ITEM_DB_HOST || 'localhost';
ITEM_DB_USERNAME = ITEM_DB_USERNAME || '';
ITEM_DB_PASSWORD = ITEM_DB_PASSWORD || '';

CONFIG_DB_HOST = CONFIG_DB_HOST || 'localhost';
CONFIG_DB_USERNAME = CONFIG_DB_USERNAME || '';
CONFIG_DB_PASSWORD = CONFIG_DB_PASSWORD || '';

const dbConnection = async (req, res, next) => {
  const { subdomains, originalUrl, hostname, protocol } = req;
  if (originalUrl.includes('/auth/callback')) {
    return next();
  }

  if (originalUrl === '/favicon.ico') {
    return res.end();
  }
  if (!hostname) {
    return res.send('No Project Associated');
  }
  let isGlobalUsed = false;
  console.log(PROJECT_HOSTNAME, hostname);
  if (PROJECT_HOSTNAME === hostname) {
    isGlobalUsed = true;
  }

  try {
    if (isGlobalUsed) {
      req.projectId = Global_projectId;
      req.db = Global_db;
      req.builderDB = Global_builderDB;
      passProjectDataFromGloballyToReq(req);
      next();
    } else {
      let query = {};
      let environment = '';
      if (hostname.includes(process.env.EXCHANGE_SURFACE_DOMAIN)) {
        const subdomains = req.subdomains;
        if (serverDomains.includes(subdomains[0])) {
          query = { seoName: subdomains[1] };
          environment = subdomains[0];
          if (!uatEnvs.includes(environment)) {
            environment = '';
          }
        } else {
          query = { seoName: subdomains[0] };
        }
      } else {
        query = { domainName: hostname };
      }
      console.log('query dbConnection :>> ', query, subdomains);
      const pDetailDB = await createConnection(
        CONFIG_DB_HOST,
        'project_detail',
        CONFIG_DB_USERNAME,
        CONFIG_DB_PASSWORD,
      );
      const project = await findProjectByQuery(pDetailDB, query);
      pDetailDB.close();
      req.db = null;
      req.builderDB = null;
      if (!project) {
        return res.status(404).send('This url does not exist. Please make a build again');
      }

      const { uuid } = project;
      const pDatabase = `project_${uuid}`;
      const pcDatabase = `project_config_${uuid}`;
      try {
        req.db = await connectProjectDatabase(
          ITEM_DB_HOST,
          pDatabase,
          ITEM_DB_USERNAME,
          ITEM_DB_PASSWORD,
        );
        req.builderDB = await connectProjectDatabase(
          CONFIG_DB_HOST,
          pcDatabase,
          CONFIG_DB_USERNAME,
          CONFIG_DB_PASSWORD,
        );
      } catch (error) {
        console.error('error Failed to Connect Project Database', error);
      }

      req.projectId = uuid;
      passProjectDataInReq(req, project, environment);
      // console.log('req', req.pEnvironment);
      // console.log('projectType', req.projectType);
      next();
    }
  } catch (error) {
    console.error('error failed to connect database :>> ', error);
    return res.status(404).send('This url does not exist');
  }
};

export default dbConnection;

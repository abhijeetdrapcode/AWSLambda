import { findProjectByQuery } from '../project/project.service';
import { logger } from 'drapcode-logger';
import { extractEnvironment } from './envUtil';
import { connectProjectDatabase, createConnection } from './mongoUtil';
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

const globalDBConnection = async () => {
  logger.info(`PROJECT_HOSTNAME ${PROJECT_HOSTNAME}`);
  if (!PROJECT_HOSTNAME) {
    return;
  }
  try {
    let query = { apiDomainName: PROJECT_HOSTNAME };
    logger.info('globalDBConnection query', query);
    const pDetailDB = await createConnection(
      CONFIG_DB_HOST,
      'project_detail',
      CONFIG_DB_PORT,
      CONFIG_DB_USERNAME,
      CONFIG_DB_PASSWORD,
    );
    const project = await findProjectByQuery(pDetailDB, query);
    pDetailDB.close();
    global.Global_db = null;
    global.Global_builderDB = null;
    if (project) {
      const pDatabase = `project_${project.uuid}`;
      const pcDatabase = `project_config_${project.uuid}`;
      try {
        console.log('Creating Global Database');
        global.Global_db = await connectProjectDatabase(
          ITEM_DB_HOST,
          pDatabase,
          ITEM_DB_PORT,
          ITEM_DB_USERNAME,
          ITEM_DB_PASSWORD,
        );
        global.Global_builderDB = await connectProjectDatabase(
          CONFIG_DB_HOST,
          pcDatabase,
          CONFIG_DB_PORT,
          CONFIG_DB_USERNAME,
          CONFIG_DB_PASSWORD,
        );
      } catch (error) {
        logger.error(`error Failed to Connect Project Database ${error}`);
      }

      let currentEnvironment = extractEnvironment(project.environments);
      global.Global_projectId = project.uuid;
      console.log('I am setting project ID in global');
      global.Global_projectName = project.name;
      global.Global_projectCreatedAt = project.createdAt;
      global.Global_projectConstants = project.constants;
      global.Global_key = project.environments;
      global.Global_timezone = project.timezone;
      global.Global_environment = currentEnvironment;
      global.Global_connectorApiKey = project.connectorApiKey;
      global.Global_projectUrl = project.url;
      global.Global_dateFormat = project.dateFormat;
      global.Global_enableProfiling = project.enableProfiling;
    } else {
      logger.error('This url does not exist. Please publish again.');
      return;
    }
  } catch (error) {
    logger.error(`error failed to connect global database :>> ${error}`);
    logger.info(`This url does not exist. Failed to connect to database.`);
    return;
  }
};

export default globalDBConnection;

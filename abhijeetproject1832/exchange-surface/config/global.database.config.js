import { findProjectByQuery } from '../project/project.service';
import {
  createConnection,
  connectProjectDatabase,
  passProjectDataInGlobally,
} from './database.utils';
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

const GlobalDbConnection = async () => {
  if (!PROJECT_HOSTNAME) {
    console.log('No Project Associated');
    return;
  }
  let environment = '';
  let query = { domainName: PROJECT_HOSTNAME };
  console.log('query dbConnection :>> ', query);
  try {
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
    if (!project) {
      return console.log('This url does not exist. Please make a build again');
    }

    const { uuid } = project;
    const pDatabase = `project_${uuid}`;
    const pcDatabase = `project_config_${uuid}`;
    try {
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
      console.log('db connected');
    } catch (error) {
      console.error('error Failed to Connect Project Database', error);
    }

    global.Global_projectId = uuid;
    passProjectDataInGlobally(project, environment);
  } catch (error) {
    console.error('error failed to connect global database :>> ', error);
    return console.error('This url does not exist');
  }
};

export default GlobalDbConnection;

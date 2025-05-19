import mongoose from 'mongoose';

let APP_ENV = process.env.APP_ENV;
let mongoDBConnection = '';

export const createConnection = async (
  host,
  database,
  port = 27017,
  username = '',
  password = '',
) => {
  let connectionUrl = `mongodb://${host}:${port}`;
  if (username) {
    connectionUrl = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(
      password,
    )}@${host}:${port}`;
  }
  const dbConnection = await mongoose.createConnection(connectionUrl, {
    autoIndex: false,
    dbName: database,
  });
  return dbConnection;
};

const createDatabaseConnection = async (host, port = 27017, username = '', password = '') => {
  let connectionUrl = `mongodb://${host}:${port}`;
  if (username) {
    connectionUrl = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(
      password,
    )}@${host}:${port}`;
  }

  const dbConnection = await mongoose.createConnection(connectionUrl, {
    autoIndex: false,
    maxPoolSize: 1000,
    minPoolSize: 100,
    socketTimeoutMS: 45000,
    reconnectTries: 180,
    reconnectInterval: 1000,
  });
  return dbConnection;
};

export const connectProjectDatabase = async (
  host,
  database,
  port = 27017,
  username = '',
  password = '',
) => {
  if (!mongoDBConnection) {
    console.log("I don't have connection. So create a new Database connection");
    mongoDBConnection = await createDatabaseConnection(host, port, username, password);
  }

  return await mongoDBConnection.useDb(database, { useCache: true });
};

export const passProjectDataInReq = (req, project, environment) => {
  const {
    projectType,
    name,
    description,
    seoName,
    apiDomainName,
    content,
    faviconKeyName,
    projectLogoKeyName,
    loadingIconKey,
    loadingIcon,
    timezone,
    customCSSClasses,
    customCssCdns,
    customJsCdns,
    toggleUnloadDefaultJS,
    pwaConfig,
    enablePWA,
    toggleUnloadDefaultCSS,
    dateFormat,
  } = project;
  console.log('PREVIEW environment', environment);
  req.projectName = name;
  req.projectDescription = description;
  req.projectUrl = seoName;
  req.apiDomainName = !environment ? apiDomainName : '';
  req.projectType = projectType;
  req.projectCustomCSS = content && content.customCSS ? content.customCSS : '';
  req.faviconKeyName = faviconKeyName;
  req.loadingIconKey = loadingIconKey;
  req.loadingIcon = loadingIcon;
  req.projectLogoKeyName = projectLogoKeyName;
  req.timezone = timezone;
  req.robotsTxt = content ? content.robotsTxt : '';
  req.sitemapXml = content ? content.sitemapXml : '';
  req.projectCustomCSSClasses = customCSSClasses ? customCSSClasses : '';
  req.projectCustomCssCdns = customCssCdns ? customCssCdns : '';
  req.projectCustomJS = content && content.customJS ? content.customJS : '';
  req.projectCustomJsCdns = customJsCdns ? customJsCdns : '';
  req.projectToggleUnloadDefaultJS = toggleUnloadDefaultJS;
  req.projectPwaConfig = pwaConfig ? pwaConfig : '';
  req.projectEnablePWA = enablePWA;
  req.environment = environment;
  req.pEnvironment = extractProjectEnvs(project);
  req.projectToggleUnloadDefaultCSS = toggleUnloadDefaultCSS;
  req.dateFormat = dateFormat;
};

export const passProjectDataFromGloballyToReq = (req) => {
  req.projectName = Global_projectName;
  req.projectDescription = Global_projectDescription;
  req.projectUrl = Global_projectUrl;
  req.apiDomainName = Global_apiDomainName;
  req.projectType = Global_projectType;
  req.projectCustomCSS = Global_projectCustomCSS;
  req.faviconKeyName = Global_faviconKeyName;
  req.loadingIconKey = Global_loadingIconKey;
  req.loadingIcon = Global_loadingIcon;
  req.projectLogoKeyName = Global_projectLogoKeyName;
  req.timezone = Global_timezone;
  req.robotsTxt = Global_robotsTxt;
  req.sitemapXml = Global_sitemapXml;
  req.projectCustomCSSClasses = Global_projectCustomCSSClasses;
  req.projectCustomCssCdns = Global_projectCustomCssCdns;
  req.projectCustomJS = Global_projectCustomJS;
  req.projectCustomJsCdns = Global_projectCustomJsCdns;
  req.projectToggleUnloadDefaultJS = Global_projectToggleUnloadDefaultJS;
  req.projectPwaConfig = Global_projectPwaConfig;
  req.projectEnablePWA = Global_projectEnablePWA;
  req.environment = Global_environment;
  req.pEnvironment = Global_pEnvironment;
  req.projectToggleUnloadDefaultCSS = Global_projectToggleUnloadDefaultCSS;
  req.dateFormat = Global_dateFormat;
};

export const passProjectDataInGlobally = (project, environment) => {
  const {
    projectType,
    name,
    description,
    seoName,
    apiDomainName,
    content,
    faviconKeyName,
    projectLogoKeyName,
    loadingIconKey,
    loadingIcon,
    timezone,
    customCSSClasses,
    customCssCdns,
    customJsCdns,
    toggleUnloadDefaultJS,
    pwaConfig,
    enablePWA,
    toggleUnloadDefaultCSS,
    dateFormat,
  } = project;
  global.Global_projectName = name;
  global.Global_projectDescription = description;
  global.Global_projectUrl = seoName;
  global.Global_apiDomainName = !environment ? apiDomainName : '';
  global.Global_projectType = projectType;
  global.Global_projectCustomCSS = content && content.customCSS ? content.customCSS : '';
  global.Global_faviconKeyName = faviconKeyName;
  global.Global_loadingIconKey = loadingIconKey;
  global.Global_loadingIcon = loadingIcon;
  global.Global_projectLogoKeyName = projectLogoKeyName;
  global.Global_timezone = timezone;
  global.Global_robotsTxt = content ? content.robotsTxt : '';
  global.Global_sitemapXml = content ? content.sitemapXml : '';
  global.Global_projectCustomCSSClasses = customCSSClasses ? customCSSClasses : '';
  global.Global_projectCustomCssCdns = customCssCdns ? customCssCdns : '';
  global.Global_projectCustomJS = content && content.customJS ? content.customJS : '';
  global.Global_projectCustomJsCdns = customJsCdns ? customJsCdns : '';
  global.Global_projectToggleUnloadDefaultJS = toggleUnloadDefaultJS;
  global.Global_projectPwaConfig = pwaConfig ? pwaConfig : '';
  global.Global_projectEnablePWA = enablePWA;
  global.Global_environment = environment;
  global.Global_pEnvironment = extractProjectEnvs(project);
  global.Global_projectToggleUnloadDefaultCSS = toggleUnloadDefaultCSS;
  global.Global_dateFormat = dateFormat;
};

const extractProjectEnvs = (project) => {
  let currentEnvironment = null;
  const environments = project.environments;
  if (!environments || environments.length === 0) {
    return null;
  }
  if (APP_ENV === 'preview') {
    currentEnvironment = environments.find((env) => env.envType === 'PREVIEW');
  } else if (APP_ENV === 'production') {
    currentEnvironment = environments.find((env) => env.envType === 'PRODUCTION');
  } else if (APP_ENV === 'beta') {
    currentEnvironment = environments.find((env) => env.envType === 'BETA');
  } else if (APP_ENV === 'alpha') {
    currentEnvironment = environments.find((env) => env.envType === 'ALPHA');
  } else if (APP_ENV === 'development' || APP_ENV.toLowerCase().trim().startsWith('dev')) {
    // To handle development env
    currentEnvironment = environments.find((env) => env.envType === 'PRODUCTION');
  }
  return currentEnvironment;
};

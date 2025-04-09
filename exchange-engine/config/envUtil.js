let APP_ENV = process.env.APP_ENV;
export const extractEnvironment = (environments) => {
  let currentEnvironment = null;
  if (!environments || environments.length === 0) {
    console.error('No Environment');
    currentEnvironment = null;
  } else if (APP_ENV === 'preview') {
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

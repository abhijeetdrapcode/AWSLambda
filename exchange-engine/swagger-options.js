const prepareDefinition = (hostname) => {
  const previewHostName = hostname.replace('api.', 'api.preview.');
  const betaHostName = hostname.replace('api.', 'api.sandbox.');
  const alphaHostName = hostname.replace('api.', 'api.uat.');

  console.log('*** prepareDefinition ~ hostname:', hostname);
  const APP_ENV = process.env.APP_ENV || 'DEV';
  const APP_PORT = process.env.APP_PORT || '6002';
  console.log('*** prepareDefinition ~ ENV:', APP_ENV);
  let url;
  if (APP_ENV === 'development' || APP_ENV.toLowerCase().trim().startsWith('dev')) {
    // To handle development env
    url = `http://${hostname}:${APP_PORT}/api/v1/developer`;
  } else {
    url = `https://${hostname}/api/v1/developer`;
  }

  return {
    definition: {
      openapi: '3.0.3',
      schemes: ['https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      info: {
        title: 'Drapcode API with Swagger',
        version: '1.1.0',
        description: `This is a developer API to perform basic action in your project.\\
        \\
        \\
         1. **Production/Live:** *https://${hostname}/api/v1/developer*\\
         \\
         2. **Preview/Staging:** *https://${previewHostName}/api/v1/developer*\\
         \\
         3. **Sandbox/Beta:** *https://${betaHostName}/api/v1/developer*\\
         \\
         4. **UAT/Alpha:** *https://${alphaHostName}/api/v1/developer*`,
        contact: {
          name: 'Drapcode',
          url: 'https://drapcode.com',
          email: 'info@drapcode.com',
        },
      },
      servers: [
        {
          url: url,
          description: 'This is for build/publish server',
        },
        {},
      ],
    },
    apis: ['./developer/developer.route.js'],
  };
};

export default prepareDefinition;

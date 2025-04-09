import swaggerJSDoc from 'swagger-jsdoc';
import prepareDefinition from '../swagger-options';

export const swaggerMiddleware = (req, res, next) => {
  try {
    const { hostname } = req;
    const definition = prepareDefinition(hostname);
    const swaggerSpec = swaggerJSDoc(definition);

    req.swaggerSpec = swaggerSpec;

    next();
  } catch (err) {
    console.error('Error generating Swagger spec:', err);
    res.status(500).send('Error generating Swagger spec');
  }
};

export const validateBuilderAPI = async (req, res, next) => {
  const restrictAPI = process.env.RESTRICT_BUILDER_API;
  console.log('restrictAPI', restrictAPI);
  if (restrictAPI && restrictAPI === 'true') {
    return res.status(404).json({
      status: 'FAILED',
      message: 'Failed to connect Exchange API due to security concern',
    });
  }
  next();
};

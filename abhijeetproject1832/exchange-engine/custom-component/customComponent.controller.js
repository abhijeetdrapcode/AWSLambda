export const getCustomComponentConfig = async (req, res, next) => {
  try {
    const { builderDB, params } = req;
    const { uuid } = params;
    const customComponents = await builderDB.collection('customcomponents').findOne({ uuid });
    res.status(200).send(customComponents);
  } catch (error) {
    console.error('get custom component config ~ error:', error);
    next(error);
  }
};

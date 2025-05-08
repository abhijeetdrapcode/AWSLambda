const DBAuthCheck = (req, res, next) => {
  const { db } = req;
  req.db = db || null;
  next();
};

export default DBAuthCheck;

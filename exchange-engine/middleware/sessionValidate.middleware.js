// import { redis_get_method } from 'drapcode-redis';
// import { generateToken } from 'drapcode-utility';
const sessionValidate = async (req, res, next) => {
  // const { projectId, headers } = req;
  return next();
  // try {
  //   if (!projectId) {
  //     return res.status(401).json({ msg: 'No ProjectID, authorization denied!' });
  //   }
  //   const token = headers.jsessionid;
  //   if (!token) {
  //     return res.status(401).json({ msg: 'No Auth token, authorization denied!' });
  //   }

  //   const uniqueSessionId = `unique_sessionid`;
  //   const data = await redis_get_method(uniqueSessionId);
  //   if (!data) {
  //     return res.status(403).json({ msg: 'Access denied.' });
  //   }

  //   const redisTokens = data[projectId];
  //   if (!redisTokens || !redisTokens.includes(token)) {
  //     return res.status(403).json({ msg: 'Access denied.' });
  //   }
  //   console.log('TOKEN_GEN: sessionValidate');
  //   const newToken = await generateToken(projectId);
  //   res.header('Access-Control-Expose-Headers', 'jsessionid');
  //   res.header('jsessionid', newToken);
  //   next();
  // } catch (error) {
  //   console.error('Error validating token:', error);
  //   res.status(500).json({ error: error.message });
  // }
};

export default sessionValidate;

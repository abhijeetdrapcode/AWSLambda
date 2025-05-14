import { generateToken } from 'drapcode-utility';
import voca from 'voca';
export const createToken = async (req, res, next) => {
  try {
    const { projectId, url } = req;
    const isIgnore = ignoreUrls(url);
    if (isIgnore) return next();
    let token = await generateToken(projectId, 'surface backend');
    console.log('TOKEN_GEN: createToken');
    res.cookie('JSESSIONID', token, { maxAge: 1800000 });
    req.token = token;
    return next();
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
};

export const ignoreUrls = (url) => {
  const isIgnore = voca.startsWith(url, '/resources/action');
  if (isIgnore) {
    return true;
  }
  const urls = [
    '/resources/drapcode.js.map',
    '/resources/drapcode.body.js.map',
    '/resources/dataLoader.js.map',
    '/resources/drapcode.modal.js.map',
  ];
  return urls.includes(url);
};

import { sendForEsignService, saveDocusignTokens, docusignTokenGen } from './docusign.services.js';
export const sendForEsign = async (req, res, next) => {
  try {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>');
    console.log('sendForEsignService');
    console.log('>>>>>>>>>>>>>>>>>>>>>>>');
    const tokens = await docusignTokenGen(req);
    const result = await sendForEsignService(req, tokens);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

export const saveDocusignTokensControllers = async (req, res, next) => {
  try {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>');
    console.log('saveDocusignTokens');
    console.log('>>>>>>>>>>>>>>>>>>>>>>>');
    const finalData = await saveDocusignTokens(req);
    res.status(200).json(finalData);
  } catch (error) {
    next(error);
  }
};

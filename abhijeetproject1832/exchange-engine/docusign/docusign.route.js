import express from 'express';
import { sendForEsign, saveDocusignTokensControllers } from './docusign.controller';
import checkdb from './../middleware/dbchecking.middleware';

const docusignRouter = express.Router();

docusignRouter.post('/save-docusign-tokens', checkdb, saveDocusignTokensControllers);
docusignRouter.post('/send-for-esign/', checkdb, sendForEsign);

export default docusignRouter;

import express from 'express';
import { sendEmail, sendEmailTemplate, sendDynamicEmail } from './email.controller';
import checkdb from './../middleware/dbchecking.middleware'

const emailRouter = express.Router();
emailRouter.post('/send', checkdb, sendEmail);
emailRouter.post('/send/:templateId', checkdb, sendEmailTemplate);
emailRouter.post('/send-dynamic-mail', checkdb, sendDynamicEmail);

export default emailRouter;

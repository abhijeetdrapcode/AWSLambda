import { sendEmailTemplateService, sendDynamicEmailService } from './email.service';

export const sendEmail = async (req, res, next) => {
  try {
    //TODO: I think we are not using this
    // Commenting, uncomment in case of error
    // const { body } = req;
    // const result = await sendEmailService(body);
    // console.log('sendEmail result::', result);
    // res.status(200).send(result);
    res.status(200).send('');
  } catch (error) {
    next(error);
  }
};
export const sendEmailTemplate = async (req, res, next) => {
  try {
    const result = await sendEmailTemplateService(req);
    console.log('sendEmailTemplate result::', result);
    res.status(200).send(result);
  } catch (error) {
    console.error('errror::', error);
    next(error);
  }
};

export const sendDynamicEmail = async (req, res, next) => {
  try {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>');
    console.log('Sending Dynamic Mail');
    console.log('>>>>>>>>>>>>>>>>>>>>>>>');
    const result = await sendDynamicEmailService(req);
    console.log('sendDynamicEmail result::', result);
    res.status(200).send(result);
  } catch (error) {
    next(error);
  }
};

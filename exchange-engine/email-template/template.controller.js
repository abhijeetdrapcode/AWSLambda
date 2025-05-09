import { createTenantTemplate, findTemplateService, listTemplates } from './template.service';

export const listProjectTemplates = async (req, res, next) => {
  try {
    let { builderDB, query, projectId } = req;
    if (!query) query = { projectId: projectId, templateType: 'EMAIL', parentTemplateId: null };
    const response = await listTemplates(builderDB, query);
    res.status(200).send(response);
  } catch (e) {
    next(e);
  }
};
export const saveTemplate = async (req, res, next) => {
  try {
    const { builderDB, body, user, projectId } = req;
    console.log('==> saveTemplate user :>> ', user, 'projectId :>> ', projectId);

    const data = {
      projectId: projectId,
      templateType: body.type ? body.type.toUpperCase() : 'EMAIL',
      content: body.content,
      subject: body.subject,
      parentTemplateId: body.parent_template_id,
      tenants: body.tenants,
    };
    console.log('==> saveTemplate data :>> ', data);
    const response = await createTenantTemplate(builderDB, data);
    if (response.code !== 403) {
      res.status(200).send(response);
    } else {
      res.status(403).send(response);
    }
  } catch (e) {
    next(e);
  }
};

export const findTemplateById = async (req, res, next) => {
  try {
    const { builderDB, projectId, params } = req;
    const query = { projectId, uuid: params.templateId };
    const response = await findTemplateService(builderDB, query);
    res.status(200).send(response);
  } catch (e) {
    next(e);
  }
};

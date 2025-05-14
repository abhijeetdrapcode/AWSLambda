import { v4 as uuidv4 } from 'uuid';
import { makePostApiCall } from '../project/builder-api';
import { customInsertOne } from '../utils/utils';
const BUILDER_ENGINE = process.env.BUILDER_ENGINE;

export const findTemplate = async (builderDB, query) => {
  const template = builderDB.collection('templates');
  return await template.findOne(query);
};
export const listTemplates = async (builderDB, query) => {
  const template = builderDB.collection('templates');
  return await template.find(query).toArray();
};
export const createTenantTemplate = async (builderDB, data) => {
  if (!data.parentTemplateId) {
    return { code: 403, message: `Parent Template is required.` };
  }
  const template = builderDB.collection('templates');
  let query = {
    uuid: data.parentTemplateId,
    templateType: data.templateType,
    projectId: data.projectId,
  };
  const parentTemplate = await template.findOne(query);
  console.log('==> createTenantTemplate parentTemplate :>> ', parentTemplate);
  if (!parentTemplate) {
    return { code: 403, message: `Selected Parent Template doesn't exists.` };
  }
  let tenantTemplateQuery = {
    templateType: data.templateType,
    parentTemplateId: data.parentTemplateId,
    projectId: data.projectId,
  };
  const allExistingTenantTemplates = await template.find(tenantTemplateQuery).toArray();
  console.log(
    '==> createTenantTemplate allExistingTenantTemplates :>> ',
    allExistingTenantTemplates,
  );

  const dataTenantIds = data ? data.tenants.map((tenant) => tenant.uuid) : [];
  const templateHasTenantId = checkForTenantIdInTemplates(
    allExistingTenantTemplates,
    dataTenantIds,
  );

  if (templateHasTenantId) {
    console.log('==> createTenantTemplate templateHasTenantId ***', templateHasTenantId);
    return {
      code: 403,
      message: `Tenant Template for the selected Template already exists.`,
    };
  }

  data.uuid = uuidv4();
  data.name = parentTemplate.name;
  data.collectionId = parentTemplate.collectionId ? parentTemplate.collectionId : '';
  //TODO: Discuss with Ali
  const projectUrl = `${BUILDER_ENGINE}projects/${data.projectId}/tenant-template`;
  try {
    const response = await makePostApiCall(projectUrl, data);
    if (response) {
      await template.deleteOne({ uuid: response.uuid });
      try {
        let result = await customInsertOne(template, response);
        return result;
      } catch (error) {
        console.error('error :>> ', error);
        console.error('Failed to save tenant template in project_detail db');
        throw new Error('Failed to save data');
      }
    }
  } catch (error) {
    console.error('error :>> ', error);
    console.error('Failed to save tenant template in builder db');
    throw new Error('Failed to save data');
  }
};

const checkForTenantIdInTemplates = (allExistingTenantTemplates, dataTenantIds) => {
  let templateHasTenantId = false;
  allExistingTenantTemplates &&
    allExistingTenantTemplates.forEach((tenantTemplate) => {
      if (templateHasTenantId) {
        return;
      }
      const tenantTemplateTenantIds =
        tenantTemplate && tenantTemplate.tenants
          ? tenantTemplate.tenants.map((tenant) => tenant.uuid)
          : [];
      const tenantIds =
        tenantTemplateTenantIds &&
        tenantTemplateTenantIds.length &&
        dataTenantIds &&
        dataTenantIds.length
          ? tenantTemplateTenantIds.filter((templateTenantId) =>
              dataTenantIds.includes(templateTenantId),
            )
          : [];
      console.log('tenantIds :>> ', tenantIds);
      const hasTenantId = !!(tenantIds && tenantIds.length);
      if (hasTenantId) {
        templateHasTenantId = true;
        return;
      }
    });
  return templateHasTenantId;
};

export const findTemplateService = async (builderDB, query) => {
  const template = builderDB.collection('templates');
  return await template.findOne(query);
};

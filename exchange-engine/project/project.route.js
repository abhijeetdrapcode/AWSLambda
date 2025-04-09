import express from 'express';
import {
  showTemplateContent,
  findModalTemplate,
  downloadPDFTemplateContent,
  findTemplateByUuid,
  downloadAgreementTemplateContent,
} from '../email-template/snippet.controller';
import {
  findTemplateById,
  listProjectTemplates,
  saveTemplate,
} from '../email-template/template.controller';
import { buildProject, deleteProject, listProjectPages } from './project.controller';
import { projectDetail } from './project.service';
import checkdb from './../middleware/dbchecking.middleware';
import sessionValidate from '../middleware/sessionValidate.middleware';
import { tenantMiddleware } from '../middleware/tenant.middleware';
import { verifyJwtForOpen } from '../loginPlugin/jwtUtils';

const projectRouter = express.Router();
projectRouter.post('/build/:projectId/version/:version', checkdb, buildProject);
projectRouter.delete('/deleteProject', checkdb, deleteProject);
projectRouter.get(
  '/:projectId/snippet-templates/:templateId/content',
  checkdb,
  showTemplateContent,
);
projectRouter.get('/:projectId/snippet-templates/:templateId', checkdb, findTemplateByUuid);
projectRouter.get('/snippet-templates/:templateId', checkdb, findModalTemplate);
projectRouter.get('/detail', sessionValidate, checkdb, projectDetail);
projectRouter.get('/templates', sessionValidate, checkdb, listProjectTemplates);
projectRouter.post('/templates/create', checkdb, saveTemplate);
projectRouter.get('/template/:templateId', sessionValidate, findTemplateById);
projectRouter.get('/pages', checkdb, listProjectPages);
// Download PDF of Snippet
projectRouter.post(
  '/:projectId/pdf-templates/:templateId/download',
  tenantMiddleware,
  verifyJwtForOpen,
  sessionValidate,
  downloadPDFTemplateContent,
);
projectRouter.post(
  '/:projectId/agreement-templates/:templateId/download',
  tenantMiddleware,
  verifyJwtForOpen,
  sessionValidate,
  downloadAgreementTemplateContent,
);
export default projectRouter;

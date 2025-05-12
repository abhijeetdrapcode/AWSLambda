import express from 'express';
import {
  createFile,
  fileUploadToServer,
  findAllFile,
  multiFileUploadToServer,
  fileUploadToServerWithoutCollectionId,
  fileUploadToServerFileSystem,
  fetchFile,
} from './upload.controller';
import { findOneService } from './fileUpload.service';
import checkdb from './../middleware/dbchecking.middleware';

const uploadRoute = express.Router();

uploadRoute.post('/upload/:collectionId/:fieldId', checkdb, fileUploadToServer);
uploadRoute.post('/multi-upload/:collectionId/:fieldId', checkdb, multiFileUploadToServer);
uploadRoute.post('/fetch', checkdb, fetchFile);
uploadRoute.get('/', checkdb, findAllFile);
uploadRoute.post('/', checkdb, createFile);
uploadRoute.get('/:fileId', checkdb, findOneService);
uploadRoute.post('/editor', checkdb, fileUploadToServerWithoutCollectionId);
uploadRoute.post('/upload/local', checkdb, fileUploadToServerFileSystem);

export default uploadRoute;

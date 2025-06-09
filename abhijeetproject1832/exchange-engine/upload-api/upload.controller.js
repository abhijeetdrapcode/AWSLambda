import multer from 'multer';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client, drapcodeEncryptDecrypt, fileUploadToS3 } from 'drapcode-utility';
import { calculatePageLimit } from 'drapcode-utility';
import { createWriteStream, unlinkSync, existsSync } from 'fs';
import {
  listService,
  privateUrl,
  saveFile,
  saveFileOfs3,
  saveMultiFileOfs3,
} from './fileUpload.service';
import { findFieldDetailsFromCollection, findOneService } from '../collection/collection.service';
import { findProjectByQuery } from '../project/project.service';
import { loadS3PluginConfig } from '../install-plugin/installedPlugin.service';
import { findOneItemByQuery } from '../item/item.service';
const path = require('path');
let APP_ENV = process.env.APP_ENV;
const fileFilter = function (req, file, cb) {
  findFieldDetailsFromCollection(
    req.builderDB,
    req.projectId,
    req.params.collectionId,
    req.params.fieldId,
  ).then((validation) => {
    console.log('field.validation::', validation);
    const allowedFileTypes = validation['allowedFileTypes'];
    console.log('noAllowedFiles,allowedFiles::', allowedFileTypes);
    const allowedFileRegex = allowedFileTypes.join('|');
    // Allowed ext
    // const filetypes = /jpeg|jpg|png|gif/;
    let regex = new RegExp(allowedFileRegex);
    // Check ext
    console.log('file', file);
    console.log('file.originalname', file.originalname);
    const extname = regex.test(path.extname(file.originalname).toLowerCase());
    // const mimetype = regex1.test(file.mimetype);
    console.log('extname:::', extname);
    if (extname) {
      return cb(null, true);
    } else {
      return cb(new Error(`Only ${allowedFileTypes.join(', ')} files are allowed!`), false);
    }

    // cb(null, true);
  });
};

/**
 * Type 1: Start
 */
const storageStatic = multer.diskStorage({
  destination: function (req, file, cb) {
    const localFilePath = process.env.FILE_UPLOAD_PATH
      ? process.env.FILE_UPLOAD_PATH
      : '/tmp/drapcode-uploads/';
    return cb(null, localFilePath);
  },
  filename: function (req, file, cb) {
    return cb(null, `${file.originalname}`);
  },
});
const uploadStatic = multer({ storage: storageStatic, fileFilter: fileFilter });
let fileStaticUploadToS3 = uploadStatic.single('file');
let fileStaticMultiUploadToS3 = uploadStatic.array('files');
const uploadStaticWthFilter = multer({ storage: storageStatic });
let fileStaticUploadToS3WthFilter = uploadStaticWthFilter.single('file');
/**
 * Type 2: End
 */

export const fileUploadToServer = async (req, res, next) => {
  try {
    const { projectId, builderDB, params, environment } = req;
    const { collectionId, fieldId } = params;
    const { enableEncryption, encryptions } = await findProjectByQuery(builderDB, {
      uuid: projectId,
    });

    const collection = await findOneService(builderDB, {
      collectionName: collectionId,
      projectId,
    });
    const field = collection.fields.find((field) => field.fieldName === fieldId);
    if (
      field.type === 'reference' &&
      field.refCollection.isFileType === true &&
      field.refCollection.collectionName &&
      field.refCollection.collectionField
    ) {
      // Fetch child file type field details for private and encryption flows
      const refCollectionDetails = await findOneService(builderDB, {
        collectionName: field.refCollection.collectionName,
        projectId,
      });
      if (refCollectionDetails) {
        const refFieldDetails = refCollectionDetails.fields.find(
          (refField) => refField.fieldName === field.refCollection.collectionField,
        );
        field.isPrivate = refFieldDetails.isPrivate || false;
        field.encrypted = refFieldDetails.encrypted || false;
        field.isGenerateIcons = refFieldDetails.isGenerateIcons || false;
      }
    }
    const { isPrivate, encrypted, isGenerateIcons = false } = field;
    const encryption = encryptions
      ? encryptions.find((enc) => enc.envType.toLowerCase() === APP_ENV.toLowerCase())
      : null;
    if (enableEncryption && encryption) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
        } else {
          return result;
        }
      }
    }

    const s3Plugin = await loadS3PluginConfig(builderDB, projectId, environment);
    console.log('s3Plugin', s3Plugin);
    const {
      region,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicRegion,
      publicAccessKeyId,
      publicSecretAccessKey,
      publicBucket,
    } = s3Plugin;
    fileStaticUploadToS3(req, res, (err) => {
      if (!req.file) {
        return res.status(500).send(err.message);
      } else if (err instanceof multer.MulterError) {
        return res.status(500).send(err.message);
      } else if (err) {
        return res.status(500).send(err.message);
      }
      const { file } = req;
      console.log('file', file);
      const key = `${projectId}/${collectionId}`;

      const awsConfig = { region, accessKey: accessKeyId, accessSecret: secretAccessKey };
      console.log('awsConfig', awsConfig);
      const s3client = createS3Client(awsConfig);

      const s3Config = {
        acl: isPrivate === true ? 'private' : 'public-read',
        key,
        bucket,
        append: true,
      };
      const publicAwsConfig = {
        region: publicRegion,
        accessKey: publicAccessKeyId,
        accessSecret: publicSecretAccessKey,
      };
      const publicS3Client = createS3Client(publicAwsConfig);
      const publicS3Config = {
        acl: 'public-read',
        key,
        bucket: publicBucket,
        append: true,
      };
      if (encrypted === true && encryption) {
        console.log('s3Config :>> ', s3Config);
        fileUploadToS3(
          file,
          s3client,
          s3Config,
          publicS3Client,
          publicS3Config,
          isGenerateIcons,
          encryption,
          {},
        ).then((uresponse) => {
          saveFileOfs3(req.db, uresponse, isPrivate, encrypted, fieldId).then((response) => {
            return res.status(200).send(response);
          });
        });
      } else {
        console.log('s3Config :>> ', s3Config);
        fileUploadToS3(
          file,
          s3client,
          s3Config,
          publicS3Client,
          publicS3Config,
          isGenerateIcons,
        ).then((uresponse) => {
          saveFileOfs3(req.db, uresponse, isPrivate, encrypted, fieldId).then((response) => {
            return res.status(200).send(response);
          });
        });
      }
    });
  } catch (error) {
    console.log('>>>>>>>>>>>>>:: error in single file upload', error);
    next(error);
  }
};
export const multiFileUploadToServer = async (req, res, next) => {
  try {
    const { projectId, builderDB, params, environment } = req;
    const { enableEncryption, encryptions } = await findProjectByQuery(builderDB, {
      uuid: projectId,
    });
    const { collectionId, fieldId } = params;
    const collection = await findOneService(builderDB, {
      collectionName: collectionId,
      projectId,
    });
    const field = collection.fields.find((field) => field.fieldName === fieldId);
    if (
      field.type === 'reference' &&
      field.refCollection.isFileType === true &&
      field.refCollection.collectionName &&
      field.refCollection.collectionField
    ) {
      // Fetch child file type field details for private and encryption flows
      const refCollectionDetails = await findOneService(builderDB, {
        collectionName: field.refCollection.collectionName,
        projectId,
      });
      if (refCollectionDetails) {
        const refFieldDetails = refCollectionDetails.fields.find(
          (refField) => refField.fieldName === field.refCollection.collectionField,
        );
        field.isPrivate = refFieldDetails.isPrivate || false;
        field.encrypted = refFieldDetails.encrypted || false;
        field.isGenerateIcons = refFieldDetails.isGenerateIcons || false;
      }
    }
    const { isPrivate, encrypted, isGenerateIcons = false } = field;
    const encryption = encryptions
      ? encryptions.find((enc) => enc.envType.toLowerCase() === APP_ENV.toLowerCase())
      : null;
    if (enableEncryption && encryption) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        console.log('result.status', result.status);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
        } else {
          return result;
        }
      }
    }
    const {
      region,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicRegion,
      publicAccessKeyId,
      publicSecretAccessKey,
      publicBucket,
    } = await loadS3PluginConfig(builderDB, projectId, environment);

    fileStaticMultiUploadToS3(req, res, (err) => {
      if (!req.files) {
        return res.status(500).send(err.message);
      } else if (err instanceof multer.MulterError) {
        return res.status(500).send(err.message);
      } else if (err) {
        return res.status(500).send(err.message);
      }
      const { files } = req;
      const key = `${projectId}/${collectionId}`;

      const awsConfig = { region, accessKey: accessKeyId, accessSecret: secretAccessKey };
      const s3client = createS3Client(awsConfig);
      const s3Config = {
        acl: isPrivate === true ? 'private' : 'public-read',
        key,
        bucket,
        append: true,
      };
      const publicAwsConfig = {
        region: publicRegion,
        accessKey: publicAccessKeyId,
        accessSecret: publicSecretAccessKey,
      };
      const publicS3Client = createS3Client(publicAwsConfig);
      const publicS3Config = {
        acl: 'public-read',
        key,
        bucket: publicBucket,
        append: true,
      };
      if (encrypted === true && encryption) {
        console.log('s3Config :>> ', s3Config);
        fileUploadToS3(
          files,
          s3client,
          s3Config,
          publicS3Client,
          publicS3Config,
          isGenerateIcons,
          encryption,
          {},
          true,
        ).then((uresponse) => {
          saveMultiFileOfs3(req.db, uresponse, isPrivate, encrypted, fieldId).then((response) => {
            return res.status(200).send(response);
          });
        });
      } else {
        console.log('s3Config :>> ', s3Config);
        fileUploadToS3(
          files,
          s3client,
          s3Config,
          publicS3Client,
          publicS3Config,
          isGenerateIcons,
        ).then((uresponse) => {
          saveMultiFileOfs3(req.db, uresponse, isPrivate, encrypted, fieldId).then((response) => {
            return res.status(200).send(response);
          });
        });
      }
    });
  } catch (error) {
    console.log('>>>>>>>>>>>>>:: error in multiple file upload', error);
    next(error);
  }
};

export const fetchFile = async (req, res, next) => {
  try {
    const { builderDB, db, projectId, body, environment } = req;
    const { itemId, fileId, collectionName, collectionField, isSignedUrl } = body;
    if (itemId) {
      const fieldData = await findOneItemByQuery(db, collectionName, {
        uuid: itemId,
      });
      if (fieldData) {
        let fileData = fieldData[collectionField];
        if (fileData) {
          if (Array.isArray(fileData)) {
            fileData = fileData.find((file) => file.uuid === fileId);
          }
          const { isEncrypted, key } = fileData;
          const result = await privateUrl(
            key,
            builderDB,
            projectId,
            isEncrypted,
            environment,
            isSignedUrl,
          );
          return res.status(200).send(result);
        } else {
          return res
            .status(404)
            .send({ message: 'File data not found for the given collection field.' });
        }
      } else {
        return res.status(404).send({ message: 'Field data not found.' });
      }
    } else {
      return res.status(400).send({ message: 'Item ID is required.' });
    }
  } catch (err) {
    console.log('err', err);
    return next(err);
  }
};

// mongodb
export const createFile = async (req, res) => {
  try {
    const result = await saveFile(req.db, req.body);
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).send({
      message: err.message,
    });
  }
};

export const findAllFile = async (req, res) => {
  console.log('event find all::', req.params, req.db.name);
  const limitPage = calculatePageLimit(req.query.limit, req.query.page);
  try {
    const result = await listService(req.db, {}, limitPage.limit, limitPage.page);
    console.log('result', result);
    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message || 'Some error occurred while retrieving events.',
    });
  }
};

export const fileUploadToServerWithoutCollectionId = async (req, res) => {
  const { builderDB, projectId, environment } = req;
  const {
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicRegion,
    publicAccessKeyId,
    publicSecretAccessKey,
    publicBucket,
  } = await loadS3PluginConfig(builderDB, projectId, environment);
  fileStaticUploadToS3WthFilter(req, res, (err) => {
    console.log('IN route::', req.file);
    if (!req.file) {
      return res.status(500).send(err.message);
    } else if (err instanceof multer.MulterError) {
      return res.status(500).send(err.message);
    } else if (err) {
      return res.status(500).send(err.message);
    }
    const { file } = req;
    const key = `${projectId}`;

    const awsConfig = { region, accessKey: accessKeyId, accessSecret: secretAccessKey };
    const s3client = createS3Client(awsConfig);
    const s3Config = { acl: 'public-read', key, bucket, append: false };
    const publicAwsConfig = {
      region: publicRegion,
      accessKey: publicAccessKeyId,
      accessSecret: publicSecretAccessKey,
    };
    const publicS3Client = createS3Client(publicAwsConfig);
    const publicS3Config = {
      acl: 'public-read',
      key,
      bucket: publicBucket,
      append: true,
    };
    console.log('s3Config :>> ', s3Config);
    fileUploadToS3(file, s3client, s3Config, publicS3Client, publicS3Config).then((uresponse) => {
      saveFileOfs3(req.db, uresponse).then((response) => {
        return res.status(200).send(response);
      });
    });
  });
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const localFilePath = process.env.FILE_UPLOAD_PATH
      ? process.env.FILE_UPLOAD_PATH
      : '/tmp/drapcode-uploads/';
    console.log('*** localFilePath :>> ', localFilePath);
    cb(null, localFilePath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  },
});
const upload = multer({ storage: storage });
let fileCreateToServerFileSystem = upload.single('file');
// file upload wala code

export const fileUploadToServerFileSystem = (req, res) => {
  fileCreateToServerFileSystem(req, res, (err) => {
    if (!req.file) {
      return res.status(500).send(err ? err.message : 'File not found!');
    } else if (err instanceof multer.MulterError) {
      return res.status(500).send(err.message);
    } else if (err) {
      return res.status(500).send(err.message);
    }
    return res.status(200).send(req.file);
  });
};

export const downloadFileContent = async (builderDB, projectId, environment, fileName, key) => {
  try {
    console.log('key', key, 'fileName', fileName);
    const localFilePath = process.env.FILE_UPLOAD_PATH || '/tmp/drapcode-uploads/';
    const filePath = `${localFilePath}${fileName}`;

    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    console.log('localFilePath', filePath);
    const { region, accessKeyId, secretAccessKey, bucket } = await loadS3PluginConfig(
      builderDB,
      projectId,
      environment,
    );
    const params = { Bucket: bucket, Key: key };
    const awsConfig = { region, accessKey: accessKeyId, accessSecret: secretAccessKey };
    const s3client = createS3Client(awsConfig);
    const response = s3client.send(new GetObjectCommand(params));

    const readStream = response.Body;
    const writeStream = createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      readStream.on('error', (e) => {
        console.error(e);
        reject(null);
      });
      writeStream.once('finish', () => {
        resolve(filePath);
      });
      readStream.pipe(writeStream);
    });

    return filePath;
  } catch (error) {
    console.log('fileDownload', error);
    return null;
  }
};

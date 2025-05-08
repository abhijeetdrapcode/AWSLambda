import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import { cryptFile, drapcodeEncryptDecrypt, processKMSDecryption } from 'drapcode-utility';
import { findProjectByQuery } from '../project/project.service';
import { loadS3PluginConfig } from '../install-plugin/installedPlugin.service';
require('./fileUpload.model');
const path = require('path');
const fs = require('fs');
const APP_ENV = process.env.APP_ENV;
export const saveFile = async (dbConnection, fileData) => {
  let FileUpload = dbConnection.model('FileUploads');
  const file = new FileUpload(fileData);
  return file.save();
};

export const saveFileOfs3 = async (dbConnection, fileData, isPrivate, isEncrypted, fieldId) => {
  const { originalname, mimetype, contentType, size, key, smallIcon, mediumIcon, largeIcon } =
    fileData;
  const keyList = key.split('/');
  const fileJson = {
    uuid: keyList[2],
    originalName: originalname,
    contentType: contentType,
    mimeType: mimetype,
    size: size,
    collectionName: keyList[1],
    collectionField: fieldId,
    projectId: keyList[0],
    key: key,
    isEncrypted: isEncrypted,
    isPrivate: isPrivate,
    smallIcon: smallIcon,
    mediumIcon: mediumIcon,
    largeIcon: largeIcon,
  };
  return await saveFile(dbConnection, fileJson);
};

export const saveMultiFileOfs3 = async (dbConnection, files, isPrivate, isEncrypted, fieldId) => {
  let filesResponse = files.map(async (file) => {
    return await saveFileOfs3(dbConnection, file, isPrivate, isEncrypted, fieldId);
  });
  return await Promise.all(filesResponse);
};

export const listService = async (dbConnection, query, perPage, page) => {
  let FileUpload = dbConnection.model('FileUploads');
  return await FileUpload.find(query)
    .limit(perPage)
    .skip(perPage * page)
    .exec();
};

export const findOneService = async (dbConnection, query) => {
  let FileUpload = dbConnection.model('FileUploads');
  return FileUpload.findOne(query);
};

export const downloadFileFromUrl = async (url) => {
  let fileName = path.basename(url);
  let localFilePath = process.env.FILE_UPLOAD_PATH || '/tmp/drapcode-uploads/';
  localFilePath += fileName;
  if (fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
  }
  const writer = fs.createWriteStream(localFilePath);
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
    });

    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve(localFilePath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('error', error);
  }
};

export const privateUrl = async (
  key,
  builderDB,
  projectId,
  isEncrypted,
  environment,
  isSignedUrl,
) => {
  try {
    const { enableEncryption, encryptions } = await findProjectByQuery(builderDB, {
      uuid: projectId,
    });
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
      const { awsConfig, encryptionType, dataKey } = encryption;
      if (encryptionType === 'KMS') {
        const { accessKeyId, secretAccessKey, region } = awsConfig;
        const config = {
          region,
          accessKeyId,
          secretAccessKey,
        };
        const plainTextData = await processKMSDecryption(config, dataKey, {});
        if (plainTextData.status === 'FAILED') {
          return plainTextData;
        }
        encryption.dataKey = plainTextData.data;
      }
    }
    const { region, accessKeyId, secretAccessKey, bucket } = await loadS3PluginConfig(
      builderDB,
      projectId,
      environment,
    );
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    if (isSignedUrl) {
      return signedUrl;
    }
    const response = await axios.get(signedUrl, {
      responseType: 'arraybuffer',
    });
    if (isEncrypted === true) {
      const keyParts = key.split('/');
      const encryptedFilePath = `${process.env.FILE_UPLOAD_PATH}${
        keyParts[keyParts.length - 1]
      }.enc`;
      await fs.promises.writeFile(encryptedFilePath, response.data);
      const result = await cryptFile(encryptedFilePath, encryption, true);
      fs.unlinkSync(encryptedFilePath);
      const data = await fs.promises.readFile(result);
      if (data) {
        fs.unlinkSync(result);
      }
      return data;
    } else {
      return response.data;
    }
  } catch (error) {
    console.error('Error fetching file:', error);
    throw error;
  }
};

export const processFileFieldForURL = async (
  response,
  builderDB,
  projectId,
  environment,
  fields,
) => {
  try {
    const fileFields = fields.filter((field) => field.type === 'file');
    if (!fileFields.length) return response;
    const s3Plugin = await loadS3PluginConfig(builderDB, projectId, environment);
    const { region, bucket } = s3Plugin;
    const isObject = !Array.isArray(response);
    if (isObject) response = [response];
    const processedResponse = await Promise.all(
      response.map(async (item) => {
        try {
          const hasProcessableFileField = fileFields.some(
            (field) => item[field.fieldName] && !field.encrypted,
          );
          if (!hasProcessableFileField) return item;
          for (const field of fileFields) {
            if (item[field.fieldName] && !field.encrypted) {
              item[field.fieldName] = await addUrlInFileObject(
                item[field.fieldName],
                builderDB,
                projectId,
                environment,
                field.isGenerateURL,
                region,
                bucket,
              );
            }
          }
          return item;
        } catch (error) {
          console.error('Error processing file field for item:', error);
          return item; // Return the original item if an error occurs
        }
      }),
    );
    return isObject ? processedResponse[0] : processedResponse;
  } catch (error) {
    console.error('Error in processFileFieldForURL:', error);
    return response; // Return the original response in case of error
  }
};

const addUrlInFileObject = async (
  fileData,
  builderDB,
  projectId,
  environment,
  isGenerateURL,
  region,
  bucket,
) => {
  try {
    if (!fileData) return fileData;
    if (!Array.isArray(fileData)) fileData = [fileData];
    return await Promise.all(
      fileData.map(async (file) => {
        try {
          let url = null;
          if (file.isPrivate && isGenerateURL) {
            url = await privateUrl(
              file.key,
              builderDB,
              projectId,
              file.isEncrypted,
              environment,
              true,
            );
          } else if (!file.isPrivate) {
            url = `https://${bucket}${
              region === 'us-east-1' ? '' : `.${region}`
            }.s3.amazonaws.com/${file.key}`;
          }
          return url ? { ...file, url } : file;
        } catch (error) {
          console.error('Error generating file URL:', error);
          return file; // Return the original file object if an error occurs
        }
      }),
    );
  } catch (error) {
    console.error('Error in addUrlInFileObject:', error);
    return fileData; // Return the original fileData in case of error
  }
};

import {
  crypt,
  drapcodeEncryptDecrypt,
  formatProjectDates,
  formatFieldsOfItem,
  processKMSDecryption,
  getEncryptedReferenceFieldsQuery,
} from 'drapcode-utility';
import { findCollectionsByQuery, findOneService } from '../collection/collection.service';
import { findProjectByQuery } from '../project/project.service';
let APP_ENV = process.env.APP_ENV;
export const cryptItemData = async (req, res, next) => {
  try {
    const {
      body,
      builderDB,
      projectId,
      params: { collectionName },
      query: { notEncrypt },
      decrypt,
    } = req;
    if (notEncrypt) return next();
    const collection = await findOneService(builderDB, { projectId, collectionName });
    let bodyData = null;

    if (body.$set) {
      bodyData = req.body.$set;
    } else if (body.items) {
      bodyData = req.body.items;
    } else {
      bodyData = req.body;
    }
    if (bodyData) {
      let encryptedResponse = await cryptService(
        bodyData,
        builderDB,
        projectId,
        collection,
        false,
        true,
        decrypt,
      );
      if (encryptedResponse) {
        if (encryptedResponse.status === 'FAILED') {
          return res.status(200).json({
            code: 422,
            message: 'Failed to encrypt data. Please fix issue.',
            data: encryptedResponse,
          });
        } else {
          if (body.$set) {
            req.body.$set = encryptedResponse;
          } else if (body.items) {
            req.body.items = encryptedResponse;
          } else {
            req.body = encryptedResponse;
          }
        }
      }
    }

    next();
  } catch (error) {
    console.error('\n Error: ', error);
    next();
  }
};

export const cryptService = async (
  data,
  builderDB,
  projectId,
  collection,
  isFetch = true,
  reverseFormat = false,
  decrypt,
) => {
  try {
    const { enableEncryption, encryptions, dateFormat } = await findProjectByQuery(builderDB, {
      uuid: projectId,
    });
    console.log('enableEncryption', enableEncryption);
    console.log('encryptions', encryptions);
    console.log('isFetch', isFetch);
    console.log('decrypt', decrypt);
    let { fields } = collection;
    if (!isFetch) {
      // Format date and number before save
      data = formatProjectDates(data, dateFormat, fields, reverseFormat);
      data = formatFieldsOfItem(data, fields);
    }
    if (enableEncryption && encryptions) {
      const encryption = encryptions.find(
        (enc) => enc.envType.toLowerCase() === APP_ENV.toLowerCase(),
      );
      if (encryption) {
        if (encryption.isDataKeyEncrypted) {
          const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
          if (result.status === 'SUCCESS') {
            encryption.dataKey = result.data;
          } else {
            console.log('***** 1 *****');
            return result;
          }
        }
        fields = fields.filter((field) => field.type !== 'file');
        const query = getEncryptedReferenceFieldsQuery(fields, projectId);
        const encryptedRefCollections = await findCollectionsByQuery(builderDB, query);
        if (isFetch) {
          if (decrypt) {
            const cryptResponse = await crypt(
              data,
              fields,
              encryption,
              isFetch,
              encryptedRefCollections,
            );
            console.log('cryptResponse', cryptResponse.status);
            if (cryptResponse.status === 'FAILED') {
              console.log('Decrypting private data key failed', cryptResponse.message);
              console.log('***** 2 *****');
              return cryptResponse;
            } else {
              console.log('Encryption/Decryption is successful');
              data = cryptResponse;
            }
          }
        } else {
          const cryptResponse = await crypt(
            data,
            fields,
            encryption,
            isFetch,
            encryptedRefCollections,
          );
          if (cryptResponse.status === 'FAILED') {
            console.log('Decrypting private data key failed', cryptResponse.message);
            console.log('***** 3 *****');
            return cryptResponse;
          } else {
            console.log('Encryption/Decryption is successful');
            data = cryptResponse;
          }
        }
      }
    }
    //Format date after get
    data = isFetch ? formatProjectDates(data, dateFormat, fields, reverseFormat) : data;
    console.log('***** 4 *****');
    return data;
  } catch (error) {
    console.log('***** 5 *****');
    console.error('\n Error: ', error);
  }
};
//TODO: This is not ok to fetch project details each time.
// Need to change this.
export const getProjectEncryption = async (projectId, builderDB) => {
  let encryption = null;
  let environment = process.env.APP_ENV || '';
  if (environment) {
    environment = environment.toLowerCase().trim();
  }
  const { enableEncryption, encryptions } = await findProjectByQuery(builderDB, {
    uuid: projectId,
  });
  console.log(
    '*** getProjectEncryption ~ Encryption enabled:',
    enableEncryption,
    'In Environment:',
    environment,
  );

  if (enableEncryption && encryptions && environment) {
    encryption = encryptions.find((enc) => enc.envType.toLowerCase() === environment);
    if (encryption) {
      if (encryption.isDataKeyEncrypted) {
        const result = await drapcodeEncryptDecrypt(encryption.dataKey, false);
        if (result.status === 'SUCCESS') {
          encryption.dataKey = result.data;
        } else {
          return result;
        }
      }
      //Now generate client's private key
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
  }
  return { enableEncryption, encryption };
};

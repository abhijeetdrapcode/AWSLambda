import voca from 'voca';
import _ from 'lodash';
import { nextGeneratedString, replaceValueFromSource } from 'drapcode-utility';
import axios from 'axios';
import { pluginCode } from 'drapcode-constant';
import { findInstalledPlugin } from '../install-plugin/installedPlugin.service';

export const customInsertOne = async (dbCollection, data) => {
  let savedItem = await dbCollection.insertOne(data);
  savedItem = await dbCollection.findOne({ _id: savedItem.insertedId });
  return savedItem;
};

export const validate = (data = {}) => {
  let result = {};
  let resp = {};
  _.map(data, (val, key) => {
    if ((val && val.length) || (val && typeof val === 'number')) {
      result[key] = val;
    } else {
      resp['msg'] = `${key} is missing`;
    }
  });
  if (resp && _.size(resp)) {
    return { status: false, data: { code: 409, message: resp.msg, data: {} } };
  } else {
    return { status: true, data: result };
  }
};

export const generateNextCustomUuid = (previousUuid, prepend, minLength, append, algorithm) => {
  if (prepend && voca.startsWith(previousUuid, prepend)) {
    previousUuid = voca.last(previousUuid, previousUuid.length - prepend.length);
  }
  if (append && voca.endsWith(previousUuid, append)) {
    const index = voca.lastIndexOf(previousUuid, append);
    previousUuid = voca.first(previousUuid, index);
  }
  if (minLength && voca.startsWith(previousUuid, '0')) {
    previousUuid = removeStartingLetter(voca.slice(previousUuid, 1));
  }
  return nextGeneratedString(previousUuid, prepend, minLength, append, algorithm);
};

const removeStartingLetter = (previousUuid) => {
  while (voca.startsWith(previousUuid, '0')) {
    previousUuid = removeStartingLetter(voca.slice(previousUuid, 1));
  }
  return previousUuid;
};

export const generateRandomCustomUuid = (prepend, minLength, append, algorithm) => {
  const allowedChars = getAllowedChars(algorithm);
  const randomStr = generateRandomStr(minLength, allowedChars);
  return `${prepend}${randomStr}${append}`;
};

const generateRandomStr = (length, allowedChars) => {
  let randomStr = '';
  const charactersLength = allowedChars.length;
  for (let i = 0; i < length; i++) {
    randomStr += allowedChars.charAt(Math.floor(Math.random() * charactersLength));
  }
  return randomStr;
};

const getAllowedChars = (algorithm) => {
  const allowedNumericChars = '0123456789';
  const allowedAlphabetChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const allowedAlphaNumericChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (algorithm === 'randomAlphanumeric') {
    return allowedAlphaNumericChars;
  } else if (algorithm === 'randomNumeric') {
    return allowedNumericChars;
  } else if (algorithm === 'randomAlphabet') {
    return allowedAlphabetChars;
  }
};

export const getUserIp = async () => {
  try {
    const apiData = await axios.get(`https://api.ipify.org/?format=json`);
    const publicIp = apiData.data.ip;
    return publicIp;
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
  }
};

export const prepareS3Url = async (builderDB, projectId, environment) => {
  const s3Plugin = await findInstalledPlugin(builderDB, {
    code: pluginCode.AWS_S3,
    projectId,
  });
  if (!s3Plugin) {
    return process.env.S3_BUCKET_URL;
  }
  let { bucket_name, region } = s3Plugin.setting;
  bucket_name = replaceValueFromSource(bucket_name, environment, null);
  region = replaceValueFromSource(region, environment, null);
  return `https://${bucket_name}${region === 'us-east-1' ? '' : `.${region}`}.s3.amazonaws.com/`;
};

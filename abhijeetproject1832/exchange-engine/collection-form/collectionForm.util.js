import { isEmpty } from 'lodash';
import { cryptService } from '../middleware/encryption.middleware';

const isObject = (item) => {
  return item && typeof item === 'object' && !Array.isArray(item);
};
export const mergeConstructorAndRequestData = async (
  target = {},
  source,
  builderDB,
  projectId,
  collection,
  decrypt,
) => {
  target = target === 'undefined' ? {} : target;
  target = await cryptService(target, builderDB, projectId, collection, false, true, decrypt);
  let output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      if (!sourceValue) return;
      if (typeof sourceValue === 'object' && sourceValue.length === 0) return;
      if (isObject(source[key])) {
        if (!(key in target)) Object.assign(output, { [key]: source[key] });
        else output[key] = mergeConstructorAndRequestData(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};
export const removeEmptyFields = (data) => {
  if (data && Object.entries(data).length) {
    Object.entries(data).map(([key, value]) => {
      if (Array.isArray(value)) {
        if (!value.length || (value.length && isEmpty(value[0]))) {
          delete data[key];
        }
      } else if (!value) {
        delete data[key];
      }
    });
  }
  return data;
};

import _ from 'lodash';
import { saltingRounds } from '../utils/appUtils';
export const userCollectionName = 'user';
export const roleCollectionName = 'role';

const bcrypt = require('bcrypt');
export const convertHashPassword = function (password) {
  return bcrypt.hash(password, saltingRounds);
};
export const compareBcryptPassword = function (password, dbPassword) {
  return bcrypt.compare(password, dbPassword);
};

export const updatePermissions = (oldPermissions, newPermissions) => {
  Object.keys(newPermissions).forEach((permission) => {
    if (newPermissions[permission]) {
      if (!oldPermissions.includes(permission)) oldPermissions.push(permission);
    } else {
      _.remove(oldPermissions, (tPermission) => tPermission === permission);
    }
  });
  return oldPermissions;
};

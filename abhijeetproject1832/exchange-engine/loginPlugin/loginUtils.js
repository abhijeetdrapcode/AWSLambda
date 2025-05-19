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

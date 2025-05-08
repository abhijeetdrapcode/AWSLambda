import passport from 'passport';
import { getBackendServerUrl } from '../apiService/user.service';
import { DOCUSIGN_TOKEN_ENDPOINT } from '../apiService/endpoints';
import axios from 'axios';

const saveDocusignTokens = async (req, accessToken, refreshToken, profile, params) => {
  const collectionName = 'docusign_tokens';
  const body = { params, accessToken, refreshToken, profile, collectionName };
  try {
    const url = `${getBackendServerUrl(req)}${DOCUSIGN_TOKEN_ENDPOINT}`;
    const { data } = await axios.post(url, body);
    return { status: 200, data };
  } catch (err) {
    return err;
  }
};

export const handleDocusign = async (req, accessToken, refreshToken, profile, done, params) => {
  try {
    const result = await saveDocusignTokens(req, accessToken, refreshToken, profile, params);
    const { status } = result;
    if (status !== 200) {
      return done({ error: result.message, status: status, result: result }, null, null);
    } else {
      return done(null, result.data);
    }
  } catch (error) {
    console.log('error :>> ', error);
    return done({ error: error.message, status: 400 }, null, null);
  }
};

export const docusignAuth = async (req, res, next) => {
  try {
    passport.authenticate('docusign')(req, res, next);
  } catch (error) {
    console.log('\n error :>> ', error);
    next();
  }
};

export const docusignCallback = async (req, res, next) => {
  try {
    passport.authenticate('docusign', async (err, data, info) => {
      console.log('\n info :>> ', info);
      console.log('\n err :>> ', err);
      console.log('\n data :>> ', data);
      const successRedirectUrl = data?.eventConfig?.successRedirectUrl;
      const errorRedirectUrl = data?.eventConfig?.errorRedirectUrl;
      if (err) {
        console.error({ error: err.message, status: err.status });
        res.redirect(`${errorRedirectUrl}`);
      }
      if (data) {
        try {
          res.redirect(`${successRedirectUrl}`);
        } catch (err) {
          console.error({ error: err.message, status: err.status });
          res.redirect(`${errorRedirectUrl}`);
        }
      }
    })(req, res, next);
  } catch (error) {
    console.error('\n error :>> ', error);
    next();
  }
};

import express from 'express';

import {
  getFirstOptimizePage,
  getRobotsTxt,
  validateSnipcartProduct,
  getManifestJson,
  getSitemapXml,
  proxyImages,
} from './application.controller';
import {
  loginUser,
  logoutUser,
  resetPasswordOptimize,
  magicLinkLogin,
  loginUserWithExternalAPI,
  loginUserWithToken,
  refreshLoggedInUser,
  refreshTenantAndLoggedInUser,
  switchTenant,
  generateSecretCode,
  verifySecretCode,
  resetSecretCode,
  authorizeSecretCode,
  oAuth2Callback,
  loginWithOAuth2,
  loginWithFacebook,
  facebookCallback,
  loginWithTwitter,
  twitterCallback,
  authorizeEmailOTPCode,
  authorizeSmsOTPCode,
} from '../loginPlugin/user.controller';
import { authentication, localization } from './application.middleware';
import {
  configureFacebookPassport,
  configureOAuthPassport,
  configureTwitterPassport,
  paramHandling,
  configureDocusignPassport,
} from '../config/passport.config';
import { createToken } from '../middleware/token';
import { docusignAuth, docusignCallback } from '../docusign-plugin/docusign.service';

const applicationRoute = express.Router();

applicationRoute.post('/login/:provider?', loginUser);
applicationRoute.post('/login/otp/external-api/:collectionItemId?', loginUserWithExternalAPI);
applicationRoute.post('/login-with-token', loginUserWithToken);
applicationRoute.get('/auth-with-email', magicLinkLogin);
applicationRoute.get('/refresh-user', refreshLoggedInUser);
applicationRoute.get(
  '/refresh-user-tenant/:tenantId/:userSettingId?',
  refreshTenantAndLoggedInUser,
);
applicationRoute.get('/switch-tenant/:tenantId', switchTenant);
applicationRoute.post('/logout', logoutUser);
applicationRoute.get('/reset-password/:token', resetPasswordOptimize);
applicationRoute.get('/generate-secret-code', generateSecretCode);
applicationRoute.post('/verify-secret-code', verifySecretCode);
// OAuth 2.0
applicationRoute.get('/login-oauth2', paramHandling, configureOAuthPassport, loginWithOAuth2);
applicationRoute.get('/login-oauth2/callback', configureOAuthPassport, oAuth2Callback);
//Facebook
applicationRoute.get('/auth/facebook', paramHandling, configureFacebookPassport, loginWithFacebook);
applicationRoute.get(
  '/auth/facebook/callback',
  paramHandling,
  configureFacebookPassport,
  facebookCallback,
);
//Twitter
applicationRoute.get('/auth/twitter', paramHandling, configureTwitterPassport, loginWithTwitter);
applicationRoute.get(
  '/auth/twitter/callback',
  paramHandling,
  configureTwitterPassport,
  twitterCallback,
);
//Docusign
applicationRoute.get('/auth/docusign', paramHandling, configureDocusignPassport, docusignAuth);
applicationRoute.get(
  '/auth/docusign/callback',
  paramHandling,
  configureDocusignPassport,
  docusignCallback,
);

applicationRoute.post('/authorize-secret-code', authorizeSecretCode);
applicationRoute.post('/reset-secret-code', resetSecretCode);
applicationRoute.post('/authorize-email-otp', authorizeEmailOTPCode);
applicationRoute.post('/authorize-sms-otp', authorizeSmsOTPCode);

applicationRoute.get('/robots.txt/', getRobotsTxt);
applicationRoute.get('/sitemap.xml/', getSitemapXml);
applicationRoute.get('/manifest.webmanifest.json/', getManifestJson);
applicationRoute.get(
  '/:collectionName/:itemId/:itemPrice/validate-product.json/',
  validateSnipcartProduct,
);
applicationRoute.get('/:pageId?', createToken, authentication, localization, getFirstOptimizePage);
applicationRoute.get(
  '/:pageId/:collectionName/:itemId?',
  createToken,
  authentication,
  localization,
  getFirstOptimizePage,
);
applicationRoute.get(
  '/:pageName/:pageId?',
  createToken,
  authentication,
  localization,
  getFirstOptimizePage,
);
applicationRoute.get(
  '/:pageName/:pageId/:collectionName/:itemId?',
  createToken,
  authentication,
  localization,
  getFirstOptimizePage,
);
// Image Proxy for PDF
applicationRoute.post('/proxy-images', proxyImages);
export default applicationRoute;

import express from 'express';
import {
  addUserWithProvider,
  loginWithProvider,
  loginUserWithExternalAPI,
  resetPassword,
  changePassword,
  loginUserWithToken,
  addAnonymousUser,
  getTenantByTenantId,
  getUserSettingByUserSettingId,
  updateTenantPermission,
  updateUserPermission,
  loginWithTwoFactor,
  updateUserSettingsPermission,
  loginUserWithOAuth2,
  logoutUser,
  loginUserWithFacebook,
  loginUserWithTwitter,
  verifyEmailOtpAndLogin,
  generateAndSendEmailOTP,
  generateAndSendSmsOTP,
  verifySmsOtpAndLogin,
} from './user.controller';
import { interceptLogger } from 'drapcode-utility';
import { verifyJwt } from './jwtUtils';
import { loginLimiter, authIpRateLimiter } from '../middleware/authRateLimiter.middleware';

const loginPluginRoute = express.Router();

loginPluginRoute.post('/user/:provider?', interceptLogger, addUserWithProvider);
loginPluginRoute.post('/logout', interceptLogger, logoutUser);
loginPluginRoute.post('/anonymous-user', interceptLogger, addAnonymousUser);
loginPluginRoute.post(
  '/login/:provider?',
  interceptLogger,
  loginLimiter,
  authIpRateLimiter,
  loginWithProvider,
);
loginPluginRoute.post('/two-auth-verification', interceptLogger, loginWithTwoFactor);
loginPluginRoute.post(
  '/login/otp/external-api/:collectionItemId?',
  interceptLogger,
  loginUserWithExternalAPI,
);
loginPluginRoute.post('/login-with-token', interceptLogger, loginUserWithToken);
loginPluginRoute.post('/reset-password/', [interceptLogger, verifyJwt], resetPassword);
loginPluginRoute.post('/change-passoword/', [interceptLogger, verifyJwt], changePassword);
loginPluginRoute.get('/tenant/:tenantId', getTenantByTenantId);
loginPluginRoute.get('/userSetting/:userSettingId', getUserSettingByUserSettingId);
loginPluginRoute.post(
  '/tenant/:tenantId/permissions',
  [interceptLogger, verifyJwt],
  updateTenantPermission,
);
loginPluginRoute.post(
  '/user/:userId/permissions',
  [interceptLogger, verifyJwt],
  updateUserPermission,
);
loginPluginRoute.post(
  '/user-settings/:userSettingsId/permissions',
  [interceptLogger, verifyJwt],
  updateUserSettingsPermission,
);

loginPluginRoute.post('/loginUserWithOAuth2', loginUserWithOAuth2);
loginPluginRoute.post('/loginUserWithFacebook', loginUserWithFacebook);
loginPluginRoute.post('/loginUserWithTwitter', loginUserWithTwitter);

loginPluginRoute.post('/send-email-otp', generateAndSendEmailOTP);
loginPluginRoute.post('/verify-email-otp', verifyEmailOtpAndLogin);

loginPluginRoute.post('/send-sms-otp', generateAndSendSmsOTP);
loginPluginRoute.post('/verify-sms-otp', verifySmsOtpAndLogin);

export default loginPluginRoute;

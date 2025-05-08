import rateLimit from 'express-rate-limit';
import { redis_get_method, redis_set_method } from 'drapcode-redis';

export const authIpRateLimiter = async (req, res, next) => {
  const { ip } = req;
  const { userName } = req.body;
  if (!userName) return res.status(400).send({ message: 'Username is required' });
  const key = `loginAttempts:${userName}`;
  const attemptsData = await redis_get_method(key);
  const now = Date.now();
  let loginAttempts = attemptsData ? JSON.parse(attemptsData) : {};
  if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, timestamp: now };

  loginAttempts[ip].count++;
  loginAttempts[ip].timestamp = now;
  // Clean up old address
  for (const ipAddr in loginAttempts) {
    if (now - loginAttempts[ipAddr].timestamp > 15 * 60 * 1000) {
      // 15 minutes window
      delete loginAttempts[ipAddr];
    }
  }
  const ipAddresses = Object.keys(loginAttempts);
  if (ipAddresses.length > 3) {
    // Maximum different IP addresses per user in the 15 minutes window
    return res
      .status(429)
      .send({ message: 'Too many different IP addresses attempting to login to this account' });
  }
  await redis_set_method(key, JSON.stringify(loginAttempts));
  next();
};

export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempt, please try again after 15 minutes',
  handler: (req, res, next, options) =>
    res.status(options.statusCode).send({ message: options.message }),
});

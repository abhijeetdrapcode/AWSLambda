import DeviceDetector from 'device-detector-js';
const deviceDetector = new DeviceDetector();

const requestDetails = async (req, res, next) => {
  const device = req.headers['user-agent'];
  const deviceAgent = await deviceDetector.parse(device);
  req.serverRequestDetails = {
    ip: req.ip || null,
    browser: deviceAgent || {},
    token: req.headers?.authorization || null,
    projectId: req.projectId,
    projectName: req.projectName,
    api: req.originalUrl,
    createdAt: new Date(),
  };
  next();
};

export default requestDetails;

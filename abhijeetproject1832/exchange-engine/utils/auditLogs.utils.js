import DeviceDetector from 'device-detector-js';
const deviceDetector = new DeviceDetector();

const getUserDetails = (userDetails) => {
  return {
    userName: userDetails ? userDetails.data?.userName : '',
    user_uuid: userDetails ? userDetails.data?.uuid : '',
  };
};

export const findForLog = async (db, collectionName, itemId) => {
  collectionName = collectionName.toString().toLowerCase();
  return await db.collection(collectionName).findOne({ uuid: itemId });
};

export const storeLogs = async (user, ip, device_agent, prev, current, type) => {
  const userDetails = getUserDetails(user);
  const deviceAgent = await deviceDetector.parse(device_agent);
  let _obj = {
    ...userDetails,
    ip: ip || null,
    browser: deviceAgent || {},
    createdAt: new Date(),
    previous: prev,
    current: current,
    action: type,
  };
  return _obj;
};

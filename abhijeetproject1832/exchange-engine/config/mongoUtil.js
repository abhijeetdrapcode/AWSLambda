import mongoose from 'mongoose';

let mongoDBConnection = '';
export const createConnection = async (
  host,
  database,
  port = 27017,
  username = '',
  password = '',
) => {
  let connectionUrl = `mongodb://${host}:${port}`;
  if (username) {
    connectionUrl = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(
      password,
    )}@${host}:${port}`;
  }
  const dbConnection = await mongoose.createConnection(connectionUrl, {
    autoIndex: false,
    dbName: database,
  });
  return dbConnection;
};

const createDatabaseConnection = async (host, port = 27017, username = '', password = '') => {
  let connectionUrl = `mongodb://${host}:${port}`;
  if (username) {
    connectionUrl = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(
      password,
    )}@${host}:${port}`;
  }
  try {
    const dbConnection = await mongoose.createConnection(connectionUrl, {
      autoIndex: false,
      maxPoolSize: 1000,
      minPoolSize: 100,
      socketTimeoutMS: 45000,
      reconnectTries: 180,
      reconnectInterval: 1000,
    });
    return dbConnection;
  } catch (error) {
    console.log('error', error);
    return null;
  }
};

export const connectProjectDatabase = async (
  host,
  database,
  port = 27017,
  username = '',
  password = '',
) => {
  if (!mongoDBConnection) {
    console.log("I don't have connection. So create a new Database connection");
    mongoDBConnection = await createDatabaseConnection(host, port, username, password);
  }
  return mongoDBConnection.useDb(database, { useCache: true });
};

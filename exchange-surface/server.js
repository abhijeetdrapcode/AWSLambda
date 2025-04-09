import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import session from 'express-session';
import passport from 'passport';
import { errorLogger } from 'drapcode-utility';
import { redisClient } from 'drapcode-redis';
import compression from 'compression';
import applicationRoute from './application/application.route';
import dbConnection from './config/database';
import globalConnection from './config/global.database.config';
import store from 'connect-redis';
const RedisStore = store(session);
import { initialize } from './config/passport.config';
initialize(passport);
// require('./config/passport.config')(passport);
const path = require('path');

let APP_PORT = process.env.APP_PORT;
APP_PORT = APP_PORT || 5001;

// create express app
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.use(compression());
let options = {
  maxAge: '60m',
  etag: false,
};
app.use('/resources', express.static(path.join(__dirname, 'public'), options));
app.use('/static', express.static(`${process.env.BUILD_FOLDER}views`)); //To load Custom CSS File
app.use('/serviceWorker.js', express.static(path.join(__dirname, 'public/serviceWorker.js'))); // To load Service Worker
app.set('views', `${process.env.BUILD_FOLDER}views`);
app.set('view engine', 'hbs');

app.use(
  session({
    secret: 'somerandonstuffs',
    store: new RedisStore({ client: redisClient }),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // expiration time: 1 day
  }),
);

app.use(errorLogger);
app.use(passport.initialize());
app.use(passport.session());
// app.use(authentication)

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
};

globalConnection();

corsOptions.credentials = true;
app.use(cors(corsOptions));
app.use(dbConnection);
app.use('/', applicationRoute);

app.all('*', cors(corsOptions), (err, req, res, next) => {
  next(err);
});

// listen for requests
app.listen(APP_PORT, () => {
  console.log(`Server is listening on port ${APP_PORT}`);
});

mongoose.connection.on('error', (err) => {
  console.error('********** $$$$$$ ********');
  console.error('Connection Broke from Database');
  console.error('err :>> ', err);
  console.error('********** $$$$$$ ********');
});
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose connection disconnected');
});

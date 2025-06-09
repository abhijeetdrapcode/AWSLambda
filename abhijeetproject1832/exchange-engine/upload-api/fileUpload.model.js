const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const fileUpload = new Schema(
  {
    uuid: String,
    originalName: String,
    contentType: String,
    mimeType: String,
    size: Number,
    collectionName: String,
    collectionField: String,
    projectId: String,
    key: String,
    isEncrypted: Boolean,
    isPrivate: Boolean,
    smallIcon: String,
    mediumIcon: String,
    largeIcon: String,
  },
  {
    timestamp: true,
  },
);

export default mongoose.model('FileUploads', fileUpload);

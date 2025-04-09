import ProfilerType from '../utils/enums/ProfilerType';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const profiler = new Schema(
  {
    uuid: String,
    projectId: String,
    message: String,
    meta: Object,
    step: {
      type: String,
      enum: ProfilerType,
      default: 'COMPUTING',
    },
    startTime: String,
    endTime: String,
    duration: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Profiler', profiler);

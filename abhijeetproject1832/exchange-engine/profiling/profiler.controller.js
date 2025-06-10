import { logger } from 'drapcode-logger';

import { clearProfilerData } from './profiler.service';
export const deleteProfiler = async (req, res) => {
  try {
    const { db, projectId } = req;
    logger.info(projectId, { label: 'DB_PROFILERS_DELETE' });
    await clearProfilerData(db);
    return res.status(200).json({ msg: 'Profiler will be cleared' });
  } catch (e) {
    logger.error(`index: >> ${e}`, { label: 'DB_PROFILERS_DELETE' });
    return res.status(500).json({ msg: e.message });
  }
};

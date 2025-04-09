import { logger } from 'drapcode-logger';
import { clearProfilerData, listProfilerData } from './profiler.service';
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
export const listProfiler = async (req, res) => {
  try {
    const { db, projectId, query } = req;
    const { page = '', limit = '' } = query || {};
    logger.info(projectId, { label: 'DB_PROFILERS_LIST' });
    const profilerData = await listProfilerData(db, 'profilers', page, limit);
    return res.status(200).json(profilerData);
  } catch (e) {
    logger.error(`index: >> ${e}`, { label: 'DB_PROFILERS_LIST' });
    return res.status(500).json({ msg: e.message });
  }
};

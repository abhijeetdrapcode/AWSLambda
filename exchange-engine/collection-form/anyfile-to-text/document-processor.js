import { basicfileProcessor } from './processing-strategies.js';
import { createWorker } from 'tesseract.js';
import fsPromises from 'fs/promises';

export const processSingleDocument = async (file, retryCount = 1) => {
  if (typeof retryCount !== 'number' || retryCount < 1) {
    throw new Error('Invalid retryCount: Must be a positive integer.');
  }

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    const fileName = file.originalname;
    try {
      const content = await basicfileProcessor(file);
      if (!content || typeof content !== 'string') {
        throw new Error('File processing returned invalid content.');
      }
      return content;
    } catch (error) {
      console.warn(`Processing attempt ${attempt} failed for file: ${fileName}`, error);

      if (attempt === retryCount) {
        throw new Error(
          `Failed to process file "${fileName}" after ${retryCount} attempts. ` +
            `Error: ${error.message}`,
        );
      }
      const delay = 1000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

export const createOCRProcessor = () => {
  let worker = null;
  let initialized = false;

  const initialize = async () => {
    try {
      if (!initialized) {
        worker = await createWorker();

        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        initialized = true;
      }
    } catch (error) {
      console.error('Failed to initialize OCR processor', {
        error: error.message,
        stack: error.stack,
      });
      throw new Error('OCR initialization failed: ' + error.message, 'OCR_INIT');
    }
  };

  const process = async (file) => {
    if (!file || !file.path) {
      throw new Error('Invalid file input', 'OCR_INVALID_INPUT');
    }

    try {
      if (!initialized) {
        await initialize();
      }
      try {
        await fsPromises.access(file.path);
      } catch (err) {
        throw new Error(`File not accessible: ${err.message}`, 'OCR_FILE_ACCESS');
      }

      const {
        data: { text },
      } = await worker.recognize(file.path);

      if (!text || text.trim().length === 0) {
        throw new Error('OCR produced empty result', 'OCR_EMPTY_RESULT');
      }

      return text;
    } catch (error) {
      console.error('OCR processing failed', {
        error: error.message,
        stack: error.stack,
        filename: file.originalname || 'unknown',
      });

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`OCR processing failed: ${error.message}`, 'OCR_PROCESS');
    } finally {
      await cleanup();
    }
  };

  const cleanup = async () => {
    try {
      if (worker && initialized) {
        await worker.terminate();
        worker = null;
        initialized = false;
      }
    } catch (error) {
      console.error('Failed to cleanup OCR processor', {
        error: error.message,
        stack: error.stack,
      });
    }
  };

  return {
    process,
    initialize,
    cleanup,
  };
};

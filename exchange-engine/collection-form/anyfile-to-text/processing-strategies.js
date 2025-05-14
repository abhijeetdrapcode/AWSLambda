import fs from 'fs/promises';
import xlsx from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { createOCRProcessor } from './document-processor.js';
import mammoth from 'mammoth';

const determineFileType = (file) => {
  try {
    const extension = file.originalname?.split('.')?.pop()?.toLowerCase();
    const mime = file.mimetype?.toLowerCase();

    if (['txt', 'md', 'rtf'].includes(extension) || mime.includes('text/')) {
      return 'text';
    }

    if (
      ['doc', 'docx', 'pdf', 'odt'].includes(extension) ||
      mime.includes('application/pdf') ||
      mime.includes('application/msword')
    ) {
      return 'document';
    }

    if (
      ['png', 'jpg', 'jpeg', 'tiff', 'gif', 'bmp'].includes(extension) ||
      mime.includes('image/')
    ) {
      return 'image';
    }

    if (['xlsx', 'xls', 'csv'].includes(extension) || mime.includes('application/vnd.ms-excel')) {
      return 'spreadsheet';
    }

    throw new Error(`Unsupported file type: ${extension} (${mime})`);
  } catch (error) {
    console.error('Error determining file type:', error);
    throw error;
  }
};

const extractText = async (file) => {
  try {
    return await fs.readFile(file.path, 'utf8');
  } catch (error) {
    console.error('Error extracting text file:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
};

const extractDocument = async (file) => {
  try {
    const extension = file.originalname?.split('.')?.pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return await extractPDF(file);
      case 'docx':
        return await extractDOCX(file);
      default:
        throw new Error(`Unsupported document type: ${extension}`);
    }
  } catch (error) {
    console.error('Error extracting document:', error);
    throw error;
  }
};

const extractSpreadsheet = async (file) => {
  try {
    const workbook = xlsx.readFile(file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    let rawText = xlsx.utils.sheet_to_txt(worksheet);
    const cleanedText = rawText.replace(/\\x00/g, '');
    return cleanedText;
  } catch (error) {
    console.error('Error extracting spreadsheet:', error);
    throw new Error(`Spreadsheet extraction failed: ${error.message}`);
  }
};

const extractPDF = async (file) => {
  try {
    const dataBuffer = await fs.readFile(file.path);
    const data = await pdfParse(dataBuffer);
    if (!data.text || data.text.trim().length === 0) {
      console.warn('PDF extraction yielded no content', {
        filename: file.originalname,
      });
      const ocrProcessor = createOCRProcessor();
      return await ocrProcessor.process(file);
    }
    return data.text ?? '';
  } catch (error) {
    console.error('Error extracting PDF:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
};

const extractDOCX = async (file) => {
  try {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value;
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error.message}`, 'docx-extraction');
  }
};

export const basicfileProcessor = async (file) => {
  try {
    const ocrProcessor = createOCRProcessor();
    const fileType = determineFileType(file);

    switch (fileType) {
      case 'text':
        return await extractText(file);
      case 'document':
        return await extractDocument(file);
      case 'image':
        return await ocrProcessor.process(file);
      case 'spreadsheet':
        return await extractSpreadsheet(file);
      default:
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
};

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSetupFilePath } = require('./storage');

// Limits keep the AI's context from growing too large
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CHARS_PER_DOCUMENT = 40000;
const MAX_CHARS_TOTAL = 80000;

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.rtf'];
const SUPPORTED_EXTENSIONS = [...TEXT_EXTENSIONS, '.pdf', '.docx'];

function getDocumentsPath() {
    return getSetupFilePath('documents');
}

function readAll() {
    try {
        const file = getDocumentsPath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (Array.isArray(data)) return data;
        }
    } catch (error) {
        console.warn('Error reading documents:', error.message);
    }
    return [];
}

function writeAll(documents) {
    const file = getDocumentsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(documents, null, 2), 'utf8');
}

async function extractPdfText(filePath) {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(filePath)), useSystemFonts: true, verbosity: 0 }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let line = '';
        for (const item of content.items) {
            line += item.str;
            line += item.hasEOL ? '\n' : ' ';
        }
        pages.push(line);
    }
    await pdf.destroy();
    return pages.join('\n\n');
}

async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        return extractPdfText(filePath);
    }
    if (ext === '.docx') {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value || '';
    }
    return fs.readFileSync(filePath, 'utf8');
}

function cleanText(text) {
    return text
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Returns a list of documents without their full text, for showing in the UI
function listDocuments() {
    return readAll().map(({ id, name, chars, truncated, addedAt }) => ({ id, name, chars, truncated, addedAt }));
}

// Adds one file. Returns { success, document } or { success: false, error }
async function addDocument(filePath) {
    const name = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return { success: false, name, error: `${ext || 'This'} files are not supported. Use PDF, DOCX, TXT, MD, CSV or JSON.` };
    }
    try {
        if (fs.statSync(filePath).size > MAX_FILE_BYTES) {
            return { success: false, name, error: 'File is larger than 10 MB.' };
        }
        let text = cleanText(await extractText(filePath));
        if (!text) {
            return { success: false, name, error: 'No readable text found in this file (scanned images are not supported).' };
        }
        const truncated = text.length > MAX_CHARS_PER_DOCUMENT;
        if (truncated) text = text.slice(0, MAX_CHARS_PER_DOCUMENT);

        const document = { id: crypto.randomUUID(), name, chars: text.length, truncated, addedAt: Date.now(), text };
        writeAll([...readAll(), document]);
        const { text: _text, ...summary } = document;
        return { success: true, document: summary };
    } catch (error) {
        console.error('Error reading document:', error);
        return { success: false, name, error: `Could not read this file: ${error.message}` };
    }
}

function removeDocument(id) {
    writeAll(readAll().filter(doc => doc.id !== id));
    return true;
}

function clearDocuments() {
    writeAll([]);
    return true;
}

// Builds the text block that is added to the AI's context at session start
function getDocumentsContext() {
    let remaining = MAX_CHARS_TOTAL;
    const parts = [];
    for (const doc of readAll()) {
        if (remaining <= 0) break;
        const text = doc.text.slice(0, remaining);
        remaining -= text.length;
        parts.push(`[Document: ${doc.name}]\n${text}`);
    }
    return parts.join('\n\n');
}

module.exports = {
    SUPPORTED_EXTENSIONS,
    listDocuments,
    addDocument,
    removeDocument,
    clearDocuments,
    getDocumentsContext,
};

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSetupFilePath } = require('./storage');

// Answers the user has written in advance, each with a heading and a body.
// Limits keep the AI's context from growing too large.
const MAX_HEADING_CHARS = 120;
const MAX_BODY_CHARS = 4000;
const MAX_CHARS_TOTAL = 30000;

function getAnswerBankPath() {
    return getSetupFilePath('answerbank');
}

function readAll() {
    try {
        const file = getAnswerBankPath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (Array.isArray(data)) return data;
        }
    } catch (error) {
        console.warn('Error reading answer bank:', error.message);
    }
    return [];
}

function writeAll(entries) {
    const file = getAnswerBankPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf8');
}

function listAnswers() {
    return readAll();
}

// Adds a new answer, or updates one when `id` is given. Returns { success, entry } or { success: false, error }.
function saveAnswer({ id, heading, body } = {}) {
    const cleanHeading = String(heading || '').trim().slice(0, MAX_HEADING_CHARS);
    const cleanBody = String(body || '').trim().slice(0, MAX_BODY_CHARS);
    if (!cleanHeading) return { success: false, error: 'Add a heading, such as the question this answer is for.' };
    if (!cleanBody) return { success: false, error: 'Add the answer text.' };

    try {
        const entries = readAll();
        const now = Date.now();
        const existing = id ? entries.find(entry => entry.id === id) : null;
        if (existing) {
            Object.assign(existing, { heading: cleanHeading, body: cleanBody, updatedAt: now });
            writeAll(entries);
            return { success: true, entry: existing };
        }
        const entry = { id: crypto.randomUUID(), heading: cleanHeading, body: cleanBody, createdAt: now, updatedAt: now };
        writeAll([...entries, entry]);
        return { success: true, entry };
    } catch (error) {
        console.error('Error saving answer:', error);
        return { success: false, error: `Could not save this answer: ${error.message}` };
    }
}

function removeAnswer(id) {
    writeAll(readAll().filter(entry => entry.id !== id));
    return true;
}

// Builds the text block added to the AI's context at session start
function getAnswerBankContext() {
    const entries = readAll();
    if (!entries.length) return '';
    let remaining = MAX_CHARS_TOTAL;
    const parts = [];
    for (const entry of entries) {
        const text = `${entry.heading}\n${entry.body}`;
        if (text.length > remaining) break;
        remaining -= text.length;
        parts.push(`[Prepared answer: ${entry.heading}]\n${entry.body}`);
    }
    if (!parts.length) return '';
    return [
        'Answer bank',
        "These are answers the user prepared in advance, in their own words. When a question matches one of them, build your answer from it: keep its facts, examples and wording, and trim or adjust it only so it fits the exact question asked. Do not add facts it does not contain. If no prepared answer fits, answer as usual.",
        ...parts,
    ].join('\n\n');
}

module.exports = { MAX_HEADING_CHARS, MAX_BODY_CHARS, listAnswers, saveAnswer, removeAnswer, getAnswerBankContext };

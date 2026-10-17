// Practice mode: the app asks interview questions, listens to (or reads) the user's answer and gives feedback.
const { GoogleGenAI } = require('@google/genai');
const { ipcMain } = require('electron');
const { getApiKey, getAvailableModel } = require('../storage');
const { recordUsage } = require('./usageTracker');

const MAX_QUESTIONS = 10;
const MAX_ANSWER_CHARS = 6000;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // about 12 MB of recording (several minutes)

function clip(text, max) {
    return typeof text === 'string' ? text.slice(0, max) : '';
}

function parseJson(text) {
    const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (error) {
        throw new Error('The AI reply could not be read. Please try again.');
    }
}

function client() {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Add your Gemini API key in Settings first.');
    return new GoogleGenAI({ apiKey });
}

async function askModel(contents, config) {
    const model = getAvailableModel();
    const ai = client();
    const response = await ai.models.generateContent({ model, contents, config });
    recordUsage('practice', model, response.usageMetadata);
    return (response.text || '').trim();
}

// Writes a set of practice questions from the role, the job description and the user's own background.
async function generateQuestions({ role, company, jobDescription, background, count, focus }) {
    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), MAX_QUESTIONS);
    const prompt = `You are an experienced interviewer. Write ${n} interview questions for this candidate.

Role: ${clip(role, 200) || 'not given'}
Company: ${clip(company, 200) || 'not given'}
Focus: ${clip(focus, 100) || 'a realistic mix of behavioural, role knowledge and situation questions'}
Job description:
${clip(jobDescription, 4000) || 'not given'}

Candidate background (their CV and notes, may be empty):
${clip(background, 6000) || 'not given'}

Rules:
- Start with an easier question and make later ones harder, like a real interview.
- Ask one thing per question. Use plain, natural spoken English a real interviewer would say aloud.
- Make questions specific to this role and to what is in the background where it helps.
- Do not number the questions.

Reply with JSON only: an array of ${n} objects like {"question": "...", "type": "behavioural | technical | situational | motivation"}.`;
    const text = await askModel(prompt, { responseMimeType: 'application/json' });
    const list = parseJson(text);
    if (!Array.isArray(list)) throw new Error('The AI did not return a list of questions. Try again.');
    return list
        .map(item => ({ question: clip(item && item.question, 400).trim(), type: clip(item && item.type, 40).trim() }))
        .filter(item => item.question)
        .slice(0, n);
}

// Marks one answer and writes a better version.
async function evaluateAnswer({ question, answer, role, background }) {
    const text = clip(answer, MAX_ANSWER_CHARS).trim();
    if (!text) throw new Error('There is no answer to review.');
    const prompt = `You are a kind but honest interview coach. A candidate for "${clip(role, 200) || 'a job'}" was asked a question and answered it. Review the answer.

Question: ${clip(question, 500)}

Candidate's answer (it may have been spoken, so ignore small speech slips):
${text}

Candidate background (may be empty; use it to write the better answer, never invent facts that are not there):
${clip(background, 6000) || 'not given'}

Reply with JSON only, in plain simple English:
{
  "score": a whole number from 1 to 10,
  "summary": "one sentence verdict",
  "strengths": ["up to 3 short points about what worked"],
  "improvements": ["up to 3 short, specific things to change"],
  "better_answer": "a stronger version the candidate could say, in first person, 80 to 150 words, using only facts from the answer or background (use [placeholders] where a detail is missing)"
}`;
    const result = parseJson(await askModel(prompt, { responseMimeType: 'application/json' }));
    return {
        score: Math.min(10, Math.max(1, Math.round(Number(result.score) || 1))),
        summary: clip(result.summary, 400),
        strengths: (Array.isArray(result.strengths) ? result.strengths : []).slice(0, 3).map(s => clip(s, 300)),
        improvements: (Array.isArray(result.improvements) ? result.improvements : []).slice(0, 3).map(s => clip(s, 300)),
        betterAnswer: clip(result.better_answer, 2000),
    };
}

// Turns a recording of the user's answer into text.
async function transcribeAnswer({ data, mimeType }) {
    if (typeof data !== 'string' || !data) throw new Error('No recording received.');
    if (data.length * 0.75 > MAX_AUDIO_BYTES) throw new Error('That recording is too long. Keep each answer under a few minutes.');
    const mime = /^audio\/[\w.+-]+/.test(mimeType || '') ? mimeType.split(';')[0] : 'audio/webm';
    const text = await askModel(
        [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: 'Write down exactly what the speaker said, word for word, in English. Do not add anything else. If there is no speech, reply with an empty line.' }] }],
        {}
    );
    return text;
}

function setupPracticeIpcHandlers() {
    const wrap = fn => async (event, payload) => {
        try {
            return { success: true, ...(await fn(payload || {})) };
        } catch (error) {
            console.error('Practice mode error:', error);
            return { success: false, error: error.message || 'Something went wrong. Try again.' };
        }
    };
    ipcMain.handle('practice:questions', wrap(async p => ({ questions: await generateQuestions(p) })));
    ipcMain.handle('practice:evaluate', wrap(async p => ({ feedback: await evaluateAnswer(p) })));
    ipcMain.handle('practice:transcribe', wrap(async p => ({ text: await transcribeAnswer(p) })));
}

module.exports = { setupPracticeIpcHandlers, generateQuestions, evaluateAnswer, transcribeAnswer, parseJson };

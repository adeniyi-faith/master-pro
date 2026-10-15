const { buildQuestionGuidance } = require('./questionTypes');

// Turns the session setup choices (company, job description, answer style)
// into plain-language instructions that are added to the AI's context.

const TONE_INSTRUCTIONS = {
    simple: 'Use plain, everyday words. Avoid jargon and long sentences.',
    formal: 'Use precise, professional wording.',
};

const FORMAT_INSTRUCTIONS = {
    full_script: 'Write each answer as a complete script that can be read word for word.',
    script_bullets: 'Start each answer with one opening line, then give short supporting bullet points.',
    bullets: 'Give each answer as short bullet points that can be said in your own words.',
};

const STAR_INSTRUCTION =
    'For questions about past experience (behavioral questions), structure the answer with the STAR method: Situation, Task, Action, Result.';

function buildSessionDetails(prefs) {
    const company = (prefs.company || '').trim();
    const jobDescription = (prefs.jobDescription || '').trim();
    const lines = [];
    if (company) lines.push(`Company: ${company}`);
    if (jobDescription) lines.push(`Job description:\n${jobDescription}`);
    return lines.length ? `Session details\n${lines.join('\n')}` : '';
}

function buildAnswerStyle(prefs) {
    const lines = [];
    if (TONE_INSTRUCTIONS[prefs.answerTone]) lines.push(TONE_INSTRUCTIONS[prefs.answerTone]);
    if (FORMAT_INSTRUCTIONS[prefs.answerFormat]) lines.push(FORMAT_INSTRUCTIONS[prefs.answerFormat]);
    if (prefs.useStarMethod) lines.push(STAR_INSTRUCTION);
    return lines.length ? `Answer style\n${lines.map(line => `- ${line}`).join('\n')}` : '';
}

// Combines session details, answer style, the user's own notes and any uploaded document text
function buildSessionContext(prefs, documentsText = '') {
    return [buildSessionDetails(prefs), buildAnswerStyle(prefs), buildQuestionGuidance(prefs), (prefs.customPrompt || '').trim(), documentsText]
        .filter(Boolean)
        .join('\n\n');
}

module.exports = { buildSessionContext, buildSessionDetails, buildAnswerStyle };

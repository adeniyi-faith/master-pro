const { buildQuestionGuidance } = require('./questionTypes');
const { getToneInstruction } = require('./tones');

// Turns the session setup choices (company, job description, answer style)
// into plain-language instructions that are added to the AI's context.

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
    const tone = getToneInstruction(prefs.answerTone, prefs.customTone);
    if (tone) lines.push(tone);
    if (FORMAT_INSTRUCTIONS[prefs.answerFormat]) lines.push(FORMAT_INSTRUCTIONS[prefs.answerFormat]);
    if (prefs.useStarMethod) lines.push(STAR_INSTRUCTION);
    lines.push('Write the answer as plain text. Do not wrap it in quotation marks, asterisks or a leading dash.');
    return lines.length ? `Answer style\n${lines.map(line => `- ${line}`).join('\n')}` : '';
}

// Combines session details, answer style, the user's own notes, the answer bank and any uploaded document text
function buildSessionContext(prefs, documentsText = '', answerBankText = '') {
    return [buildSessionDetails(prefs), buildAnswerStyle(prefs), buildQuestionGuidance(prefs), (prefs.customPrompt || '').trim(), answerBankText, documentsText]
        .filter(Boolean)
        .join('\n\n');
}

module.exports = { buildSessionContext, buildSessionDetails, buildAnswerStyle };

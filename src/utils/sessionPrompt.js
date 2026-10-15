const { buildQuestionGuidance } = require('./questionTypes');
const { getToneInstruction } = require('./tones');

// Turns the session setup choices (company, job description, answer style)
// into plain-language instructions that are added to the AI's context.

const FORMAT_INSTRUCTIONS = {
    full_script: 'Write each answer as a complete script that can be read word for word.',
    script_bullets: 'Start each answer with one opening line, then give short supporting bullet points.',
    bullets: 'Give each answer as short bullet points that can be said in your own words.',
};

// Quality rules added to every answer style
const TRUTH_INSTRUCTION =
    "Only state employers, job titles, years of experience, projects and numbers that appear in the user's documents, notes or answer bank. If the question needs a personal example that is not there, explain the approach in general terms and leave a short placeholder in square brackets, such as [add your real example here]. Never invent facts about the user.";
const MISHEARD_INSTRUCTION =
    'The questions come from speech recognition and may contain misheard words. If a word looks wrong, answer the most likely intended question.';
const VARIETY_INSTRUCTION =
    'Use plain, specific words. Do not repeat the same opening or stock phrases (such as "I focus heavily on") from one answer to the next.';

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
    lines.push(TRUTH_INSTRUCTION, MISHEARD_INSTRUCTION, VARIETY_INSTRUCTION);
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

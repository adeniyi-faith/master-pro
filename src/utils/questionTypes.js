const { getToneInstruction } = require('./tones');

// Default guidance for each kind of interview question. Users can edit any of
// these in the app (Session Setup > Question Types); edits are saved as
// overrides and "Reset" goes back to the text below.

const DEFAULT_QUESTION_TYPES = [
    {
        id: 'behavioral',
        label: 'Behavioral',
        hint: '"Tell me about a time..."',
        prompt: `Past-experience questions. Choose the most relevant example from the user's resume and context. Use the STAR structure (Situation, Task, Action, Result) in 4 to 6 spoken sentences and end with a concrete result. Use only facts that appear in the user's context. If no example fits, give a short, honest answer about how they usually handle it, with no made-up employers, numbers or projects.`,
    },
    {
        id: 'coding',
        label: 'Coding (LeetCode-style)',
        hint: 'Write or fix code for a problem',
        prompt: `Coding problems. Open with the approach in one or two sentences. Then give the shortest correct solution in a fenced code block, using the language shown on screen or the user's main language. Finish with time and space complexity and one edge case to mention.`,
    },
    {
        id: 'experience_check',
        label: 'Experience check',
        hint: '"Have you used X?" / "How many years..."',
        prompt: `Questions that check hands-on experience. Answer directly in the first sentence, using the resume. Give one specific example of using it. If the resume does not show this experience, do not claim it. Name the closest related experience and say honestly that they learn quickly.`,
    },
    {
        id: 'how_do_you',
        label: 'How-do-you',
        hint: '"How do you approach / handle..."',
        prompt: `Process questions. Describe the user's approach as 3 to 5 steps in order, with a short reason for each step. Add one brief real example from their background if the context has one.`,
    },
    {
        id: 'situational',
        label: 'Situational',
        hint: '"What would you do if..."',
        prompt: `Hypothetical questions. Say what the user would do first, then why, then how they would check that it worked. Mention a similar real situation from their background in one sentence if the context has one.`,
    },
    {
        id: 'system_design',
        label: 'System design',
        hint: '"Design a system that..."',
        prompt: `System design questions. State the key assumptions and scale in one line. Then cover, in short bullets: the main components, how data is stored, how it scales, the main trade-offs, and one failure case with how the system handles it.`,
    },
    {
        id: 'technical_knowledge',
        label: 'Technical knowledge',
        hint: '"What is... / difference between..."',
        prompt: `Concept questions. Give a one-sentence definition, then a simple practical example or analogy, then when to use it and when not to. Be accurate. If unsure about a detail, say so briefly instead of guessing.`,
    },
    {
        id: 'tell_me_about_yourself',
        label: 'Tell me about yourself',
        hint: 'Introductions and "why this role"',
        prompt: `Introduction questions. Give a 30 to 45 second answer: current role and main strengths, one or two relevant achievements from the resume, and why this role and company (use the company and job description if provided). Keep it warm and natural.`,
    },
];

const FALLBACK_INSTRUCTION = `If the question fits none of these types, answer it directly and briefly in the same ready-to-speak style.`;

// Returns the prompt to use for one type: the user's edit if there is one, else the default
function getTypePrompt(type, overrides = {}) {
    const edited = typeof overrides[type.id] === 'string' ? overrides[type.id].trim() : '';
    return edited || type.prompt;
}

// Builds the context block. Returns '' when auto-detection is switched off.
function buildQuestionGuidance(prefs = {}) {
    if (prefs.autoQuestionType === false) return '';
    const overrides = prefs.questionTypePrompts || {};
    const tones = prefs.questionTypeTones || {};
    const lines = DEFAULT_QUESTION_TYPES.map(type => {
        const tone = getToneInstruction(tones[type.id], prefs.customTone);
        return `- ${type.label}: ${getTypePrompt(type, overrides)}${tone ? ` Tone for this type: ${tone}` : ''}`;
    });
    return [
        'Question types',
        'Before answering, quietly work out which type of question was asked, then follow the guidance for that type. Never mention the type in your answer.',
        ...lines,
        `- ${FALLBACK_INSTRUCTION}`,
    ].join('\n');
}

module.exports = { DEFAULT_QUESTION_TYPES, getTypePrompt, buildQuestionGuidance };

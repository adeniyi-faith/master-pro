// Tone wording shared by the overall tone setting and the per-question-type tones.

const TONE_INSTRUCTIONS = {
    simple: 'Use plain, everyday words. Avoid jargon and long sentences.',
    formal: 'Use precise, professional wording.',
};

// Turns a tone choice into an instruction. 'custom' uses the user's own text.
// Returns '' for "default", "same as overall", or a custom tone with no text.
function getToneInstruction(tone, customTone = '') {
    if (tone === 'custom') return (customTone || '').trim();
    return TONE_INSTRUCTIONS[tone] || '';
}

module.exports = { TONE_INSTRUCTIONS, getToneInstruction };

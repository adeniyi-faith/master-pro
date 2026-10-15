// Decides whether heard speech looks like English, so that background chatter in other languages
// (a TV, a person nearby) is not answered when "Only answer English" is on.

const COMMON_ENGLISH_WORDS = new Set(
    (
        'the a an and or but if so to of in on at for with from by about as into is are was were be been am do does did can could would should will ' +
        'have has had i me my we our you your he she it they them this that these those there here what when where who whom which why how ' +
        'tell describe explain walk give share talk any some one two three more most not no yes yeah okay ok please thanks thank work worked ' +
        'working project projects experience time tell example team build built use used using like want need get got make made know think ' +
        'question answer role job company'
    ).split(' ')
);

// Letters outside the Latin alphabet (Japanese, Cyrillic, Arabic, ...) or Spanish-only punctuation
const NON_LATIN_LETTER = /[^\u0000-ɏḀ-ỿ\s\p{P}\p{N}\p{S}]/u;
const SPANISH_MARKS = /[¿¡ñ]/i;

function looksLikeEnglish(text) {
    if (!text || !text.trim()) return false;
    if (NON_LATIN_LETTER.test(text) || SPANISH_MARKS.test(text)) return false;
    const words = text.toLowerCase().match(/[a-z']+/g) || [];
    if (words.length < 3) return true; // too short to judge
    return words.some(word => COMMON_ENGLISH_WORDS.has(word));
}

module.exports = { looksLikeEnglish };

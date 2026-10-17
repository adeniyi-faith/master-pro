// Scoring helpers for the accuracy test: how many words were heard wrongly, and how many key words survived.

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\[(interviewer|candidate)\]:/g, ' ')
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function words(text) {
    const n = normalize(text);
    return n ? n.split(' ') : [];
}

// Smallest number of word changes (swap, drop, add) to turn what was heard into what was said
function editDistance(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return prev[b.length];
}

// Word error rate: 0 means perfect; 0.1 means about one word in ten was wrong
function wordErrorRate(reference, heard) {
    const ref = words(reference);
    const hyp = words(heard);
    if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
    return editDistance(ref, hyp) / ref.length;
}

// Share of the question's important words (more than 3 letters) that were heard
function keyWordRecall(reference, heard) {
    const key = words(reference).filter(w => w.length > 3);
    if (key.length === 0) return 1;
    const heardSet = new Set(words(heard));
    return key.filter(w => heardSet.has(w)).length / key.length;
}

module.exports = { normalize, words, editDistance, wordErrorRate, keyWordRecall };

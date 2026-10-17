const fs = require('fs');
const path = require('path');
const { getConfigDir } = require('../storage');

// Records every Gemini call (what it was for, which model, how many tokens) and estimates its cost.
// The token counts come from Google's own replies; the prices below are Google's public paid-tier prices
// (US dollars per 1 million tokens), checked on 2026-10-15. Prices change, so treat the cost as an estimate:
// the real bill is in Google AI Studio / Google Cloud Billing.
const PRICES = [
    // Natural voice (text to speech). Google's voice replies do not always include a token count, so the practice screen
    // estimates it; these prices are an estimate too (text in, spoken audio out).
    { match: /-tts/, text: 0.5, out: 10.0, outAudio: 10.0 },
    // text, image, audio: input prices. out: output price (thinking tokens count as output). outAudio: audio output
    { match: /^gemini-3\.[68]-live|^gemini-3\.1-flash-live/, text: 0.75, image: 1.0, audio: 3.0, out: 4.5, outAudio: 12.0 },
    { match: /^gemini-3\.[68]-flash$/, text: 0.75, audio: 0.75, out: 3.75 },
    { match: /^gemini-3\.5-flash-lite/, text: 0.3, audio: 0.3, out: 2.5 },
    { match: /^gemini-3\.1-flash-lite/, text: 0.25, audio: 0.5, out: 1.5 },
    { match: /^gemini-3-flash/, text: 0.5, audio: 1.0, out: 3.0 },
    { match: /^gemini-3\.1-pro/, text: 2.0, audio: 2.0, out: 12.0 },
    { match: /^gemini-4-argon/, text: 2.0, audio: 2.0, out: 10.0 },
    { match: /^gemini-2\.5-flash-lite/, text: 0.1, audio: 0.3, out: 0.4 },
    { match: /^gemini-2\.5-flash/, text: 0.3, audio: 1.0, out: 2.5 },
];

const MAX_LINES_READ = 50000;
const KINDS = new Set(['answer', 'rewrite', 'notes', 'screenshot', 'live', 'practice']);

function usageFilePath() {
    return path.join(getConfigDir(), 'usage.jsonl');
}

function modalityCounts(details) {
    const counts = { TEXT: 0, AUDIO: 0, IMAGE: 0 };
    for (const d of details || []) {
        const key = String(d.modality || 'TEXT').toUpperCase();
        const bucket = key === 'AUDIO' ? 'AUDIO' : key === 'IMAGE' || key === 'VIDEO' || key === 'DOCUMENT' ? 'IMAGE' : 'TEXT';
        counts[bucket] += Number(d.tokenCount) || 0;
    }
    return counts;
}

// Turns Google's usageMetadata into token counts split by kind, plus an estimated cost in dollars (null if the model's price is unknown)
function summarizeUsage(model, usage) {
    const promptTotal = Number(usage?.promptTokenCount) || 0;
    const candidatesTotal = Number(usage?.candidatesTokenCount) || 0;
    const thoughts = Number(usage?.thoughtsTokenCount) || 0;

    const input = modalityCounts(usage?.promptTokensDetails);
    const inputKnown = input.TEXT + input.AUDIO + input.IMAGE;
    if (inputKnown < promptTotal) input.TEXT += promptTotal - inputKnown;

    const output = modalityCounts(usage?.candidatesTokensDetails);
    const outputKnown = output.TEXT + output.AUDIO + output.IMAGE;
    if (outputKnown < candidatesTotal) output.TEXT += candidatesTotal - outputKnown;

    const price = PRICES.find(p => p.match.test(model || ''));
    let cost = null;
    if (price) {
        cost =
            (input.TEXT * price.text +
                input.IMAGE * (price.image ?? price.text) +
                input.AUDIO * (price.audio ?? price.text) +
                (output.TEXT + output.IMAGE + thoughts) * price.out +
                output.AUDIO * (price.outAudio ?? price.out)) /
            1e6;
    }
    return {
        inTokens: promptTotal,
        outTokens: candidatesTotal + thoughts,
        audioInTokens: input.AUDIO,
        cost,
    };
}

// kind: 'answer' | 'rewrite' | 'notes' | 'screenshot' | 'live' | 'practice'
function recordUsage(kind, model, usage) {
    try {
        if (!usage || !KINDS.has(kind)) return;
        const summary = summarizeUsage(model, usage);
        if (summary.inTokens + summary.outTokens === 0) return;
        const entry = { time: Date.now(), kind, model: model || 'unknown', ...summary };
        fs.appendFileSync(usageFilePath(), JSON.stringify(entry) + '\n');
    } catch {
        // tracking must never get in the way of an answer
    }
}

function readEntries() {
    try {
        const lines = fs.readFileSync(usageFilePath(), 'utf8').split('\n').filter(Boolean).slice(-MAX_LINES_READ);
        const entries = [];
        for (const line of lines) {
            try {
                entries.push(JSON.parse(line));
            } catch {
                // skip a damaged line
            }
        }
        return entries;
    } catch {
        return [];
    }
}

function emptyTotal() {
    return { calls: 0, inTokens: 0, outTokens: 0, cost: 0, unpricedCalls: 0 };
}

function addTo(total, entry) {
    total.calls++;
    total.inTokens += entry.inTokens || 0;
    total.outTokens += entry.outTokens || 0;
    if (typeof entry.cost === 'number') total.cost += entry.cost;
    else total.unpricedCalls++;
}

function getUsageReport(now = new Date()) {
    const entries = readEntries();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const totals = { today: emptyTotal(), month: emptyTotal(), all: emptyTotal() };
    const byModel = {};
    const byKind = {};
    for (const e of entries) {
        addTo(totals.all, e);
        if (e.time >= startOfMonth) addTo(totals.month, e);
        if (e.time >= startOfDay) addTo(totals.today, e);
        addTo((byModel[e.model] ||= emptyTotal()), e);
        addTo((byKind[e.kind] ||= emptyTotal()), e);
    }
    return {
        totals,
        byModel,
        byKind,
        recent: entries.slice(-100).reverse(),
        since: entries.length ? entries[0].time : null,
    };
}

function clearUsage() {
    try {
        fs.writeFileSync(usageFilePath(), '');
    } catch {
        // ignore
    }
}

module.exports = { recordUsage, getUsageReport, clearUsage, summarizeUsage };

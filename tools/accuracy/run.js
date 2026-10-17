#!/usr/bin/env node
// Accuracy test: plays recorded questions to speech engines and scores what each one heard.
//
//   GEMINI_API_KEY=... node tools/accuracy/run.js --clips ./clips [--engines gemini-live,gemini-batch,deepgram]
//
// Needs ffmpeg installed. See README.md in this folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { wordErrorRate, keyWordRecall } = require('./wer');

// ---------- options ----------
function parseArgs(argv) {
    const o = {
        engines: 'gemini-live',
        concurrency: 3,
        speed: 1,
        liveModel: 'gemini-3.1-flash-live-preview',
        batchModel: 'gemini-2.5-flash',
        judge: '',
        out: '',
        diarize: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '--clips') o.clips = next();
        else if (a === '--engines') o.engines = next();
        else if (a === '--concurrency') o.concurrency = Number(next());
        else if (a === '--speed') o.speed = Number(next());
        else if (a === '--live-model') o.liveModel = next();
        else if (a === '--batch-model') o.batchModel = next();
        else if (a === '--judge') o.judge = next();
        else if (a === '--out') o.out = next();
        else if (a === '--limit') o.limit = Number(next());
        else if (a === '--diarize') o.diarize = true;
        else if (a === '--help' || a === '-h') o.help = true;
    }
    return o;
}

function readManifest(dir) {
    const lines = fs.readFileSync(path.join(dir, 'manifest.csv'), 'utf8').split('\n').filter(Boolean);
    lines.shift();
    return lines.map(line => {
        const m = /^([^,]+),([^,]*),([^,]*),"?(.*?)"?$/.exec(line);
        return { file: m[1], accent: m[2] || 'unknown', speaker: m[3], text: m[4].replace(/""/g, '"') };
    });
}

// ---------- audio ----------
function decode(file, format) {
    const args = ['-v', 'error', '-i', file, '-ac', '1'];
    if (format === 'pcm24') args.push('-ar', '24000', '-f', 's16le', '-');
    else args.push('-ar', '16000', '-f', 'wav', '-');
    const r = spawnSync('ffmpeg', args, { maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${r.stderr}`);
    return r.stdout;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- engines: each returns { text, usage? } ----------
async function geminiLive(clipPath, opts) {
    const { GoogleGenAI, Modality } = require('@google/genai');
    const pcm = decode(clipPath, 'pcm24');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: 'v1alpha' } });
    let text = '';
    let lastHeardAt = Date.now();
    let usage = null;
    let closed = false;
    const session = await ai.live.connect({
        model: opts.liveModel,
        callbacks: {
            onopen() {},
            onmessage(m) {
                if (m.usageMetadata) usage = m.usageMetadata;
                const t = m.serverContent?.inputTranscription;
                if (t) {
                    lastHeardAt = Date.now();
                    if (t.results) text += t.results.map(r => r.transcript || '').join(' ') + ' ';
                    else if (t.text) text += t.text;
                }
            },
            onerror(e) {
                console.error('  live error:', e.message);
            },
            onclose() {
                closed = true;
            },
        },
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: opts.diarize ? { enableSpeakerDiarization: true, minSpeakerCount: 2, maxSpeakerCount: 2 } : {},
            // Listen only: this also shows how much cheaper a silent listener is
            systemInstruction: { parts: [{ text: 'You are a silent listener. Never reply. Say nothing.' }] },
        },
    });
    const chunkBytes = 24000 * 2 * 0.1;
    for (let i = 0; i < pcm.length; i += chunkBytes) {
        await session.sendRealtimeInput({ audio: { data: pcm.subarray(i, i + chunkBytes).toString('base64'), mimeType: 'audio/pcm;rate=24000' } });
        await sleep(100 / opts.speed);
    }
    const silence = Buffer.alloc(chunkBytes).toString('base64');
    for (let i = 0; i < 20; i++) {
        await session.sendRealtimeInput({ audio: { data: silence, mimeType: 'audio/pcm;rate=24000' } });
        await sleep(100 / opts.speed);
    }
    try {
        await session.sendRealtimeInput({ audioStreamEnd: true });
    } catch (e) {
        // older library versions do not have it
    }
    const deadline = Date.now() + 15000;
    while (!closed && Date.now() < deadline && Date.now() - lastHeardAt < 3500) await sleep(200);
    if (!closed) session.close();
    return { text: text.trim(), usage };
}

async function geminiBatch(clipPath, opts) {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const wav = decode(clipPath, 'wav16');
    const r = await ai.models.generateContent({
        model: opts.batchModel,
        contents: [
            {
                role: 'user',
                parts: [
                    { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
                    { text: 'Write down exactly what the speaker says, word for word. Output only the words.' },
                ],
            },
        ],
    });
    return { text: (r.text || '').trim(), usage: r.usageMetadata };
}

async function deepgram(clipPath) {
    const wav = decode(clipPath, 'wav16');
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true', {
        method: 'POST',
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/wav' },
        body: wav,
    });
    if (!res.ok) throw new Error(`Deepgram said ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return { text: (j.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim() };
}

// Pretends to hear the clip with one wrong word: only for checking that this tool itself works
async function mock(clipPath, opts, clip) {
    decode(clipPath, 'wav16'); // proves the recording can be read
    const w = clip.text.split(' ');
    if (w.length > 3) w[w.length - 2] = 'banana';
    return { text: w.join(' ') };
}

const ENGINES = { 'gemini-live': geminiLive, 'gemini-batch': geminiBatch, deepgram, mock };
const KEY_FOR = { 'gemini-live': 'GEMINI_API_KEY', 'gemini-batch': 'GEMINI_API_KEY', deepgram: 'DEEPGRAM_API_KEY', mock: null };

// Optional: would an interview assistant answer the same question from what was heard?
async function sameMeaning(reference, heard, model) {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const r = await ai.models.generateContent({
        model,
        contents: `A question was spoken in an interview. Reference: "${reference}"\nSpeech recognition heard: "${heard}"\nIf an assistant answered the heard version, would it answer essentially the same question? Reply with only YES or NO.`,
    });
    return /^\s*yes/i.test(r.text || '');
}

// ---------- run ----------
async function pool(items, size, fn) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: size }, async () => {
            while (next < items.length) {
                const i = next++;
                results[i] = await fn(items[i], i);
            }
        })
    );
    return results;
}

function pct(n, d) {
    return d ? `${Math.round((n / d) * 100)}%` : '-';
}

function summarise(rows, engine) {
    const byAccent = {};
    for (const r of rows.filter(x => x.engine === engine && !x.error)) (byAccent[r.accent] ||= []).push(r);
    const line = (name, list) => {
        const wer = list.reduce((a, r) => a + r.wer, 0) / list.length;
        const recall = list.reduce((a, r) => a + r.recall, 0) / list.length;
        const good = list.filter(r => r.wer <= 0.15).length;
        const judged = list.filter(r => r.sameMeaning !== undefined);
        const meaning = judged.length ? pct(judged.filter(r => r.sameMeaning).length, judged.length) : 'n/a';
        return `| ${name} | ${list.length} | ${(100 - wer * 100).toFixed(1)}% | ${(recall * 100).toFixed(1)}% | ${pct(good, list.length)} | ${meaning} |`;
    };
    const all = rows.filter(x => x.engine === engine && !x.error);
    const out = [
        '| Accent | Clips | Words right | Key words heard | Clips with 85%+ words right | Same question understood |',
        '|---|---|---|---|---|---|',
    ];
    for (const [a, list] of Object.entries(byAccent).sort()) out.push(line(a, list));
    if (all.length) out.push(line('**All**', all));
    return out.join('\n');
}

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.help || !o.clips) {
        console.log(fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8'));
        process.exit(o.help ? 0 : 1);
    }
    const engines = o.engines
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    for (const e of engines) {
        if (!ENGINES[e]) throw new Error(`Unknown engine "${e}". Choose from: ${Object.keys(ENGINES).join(', ')}`);
        if (KEY_FOR[e] && !process.env[KEY_FOR[e]]) throw new Error(`Set ${KEY_FOR[e]} to test ${e}.`);
    }
    if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('ffmpeg is needed to read the recordings. Install it first.');

    let clips = readManifest(o.clips);
    if (o.limit) clips = clips.slice(0, o.limit);
    console.log(`${clips.length} clips x ${engines.length} engine(s)`);

    const rows = [];
    for (const engine of engines) {
        console.log(`\nEngine: ${engine}`);
        const done = await pool(clips, o.concurrency, async (clip, i) => {
            const row = { engine, file: clip.file, accent: clip.accent, speaker: clip.speaker, reference: clip.text };
            try {
                const t0 = Date.now();
                const r = await ENGINES[engine](path.join(o.clips, clip.file), o, clip);
                row.heard = r.text;
                row.usage = r.usage;
                row.seconds = (Date.now() - t0) / 1000;
                row.wer = wordErrorRate(clip.text, r.text);
                row.recall = keyWordRecall(clip.text, r.text);
                if (o.judge) row.sameMeaning = await sameMeaning(clip.text, r.text, o.judge);
                process.stdout.write(`  [${i + 1}/${clips.length}] ${clip.file}: ${(100 - row.wer * 100).toFixed(0)}% words right\n`);
            } catch (e) {
                row.error = e.message;
                process.stdout.write(`  [${i + 1}/${clips.length}] ${clip.file}: FAILED ${e.message}\n`);
            }
            return row;
        });
        rows.push(...done);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = o.out || path.join(o.clips, 'results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `accuracy-${stamp}.json`), JSON.stringify(rows, null, 2));

    const md = ['# Accuracy test', '', `Run: ${stamp}. Clips: ${clips.length}.`, ''];
    for (const e of engines) {
        md.push(`## ${e}`, '', summarise(rows, e), '');
        const failed = rows.filter(r => r.engine === e && r.error).length;
        if (failed) md.push(`${failed} clip(s) failed to run.`, '');
        const worst = rows
            .filter(r => r.engine === e && !r.error)
            .sort((a, b) => b.wer - a.wer)
            .slice(0, 5);
        if (worst.length) {
            md.push('Worst five:', '');
            for (const w of worst) md.push(`- ${w.file} (${(100 - w.wer * 100).toFixed(0)}% right): said "${w.reference}", heard "${w.heard}"`);
            md.push('');
        }
        const withUsage = rows.filter(r => r.engine === e && r.usage);
        if (withUsage.length && e === 'gemini-live') {
            const avg = k => Math.round(withUsage.reduce((a, r) => a + (r.usage[k] || 0), 0) / withUsage.length);
            md.push(
                `Average tokens per clip (Gemini Live, silent listener): heard ${avg('promptTokenCount')}, replied ${avg('responseTokenCount')}.`,
                ''
            );
        }
    }
    fs.writeFileSync(path.join(outDir, `accuracy-${stamp}.md`), md.join('\n'));
    console.log('\n' + md.join('\n'));
    console.log(`Saved to ${outDir}`);
}

if (require.main === module) {
    main().catch(e => {
        console.error('\n' + e.message);
        process.exit(1);
    });
}

module.exports = { parseArgs, readManifest, summarise };

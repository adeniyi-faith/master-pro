// Checks the live-connection logic (drops, resume, early hand-over, audio replay, watchdog) against a pretend Google.
// Run: node tools/tests/connection.test.js   (no network or key needed)
const Module = require('module');
const path = require('path');
const os = require('os');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-'));
process.env.HOME = tmp;
process.env.USERPROFILE = tmp;

const sent = []; // messages sent to the renderer
const handlers = {};
const fakeWin = { webContents: { send: (ch, data) => sent.push([ch, data]) } };
const electronStub = new Proxy(
    {
        BrowserWindow: { getAllWindows: () => [fakeWin] },
        ipcMain: { handle: (n, f) => (handlers[n] = f), on() {} },
        app: { getPath: () => tmp, getVersion: () => '0', isPackaged: false },
    },
    { get: (t, k) => (k in t ? t[k] : {}) }
);

// ---- fake Google ----
const connects = []; // every connect call
let failNext = 0;
class FakeSession {
    constructor(opts) {
        this.opts = opts;
        this.audio = [];
        this.texts = [];
        this.closed = false;
        this.conn = { ws: { bufferedAmount: 0 } };
        this.failSend = false;
    }
    async sendRealtimeInput(x) {
        if (this.failSend || this.closed) throw new Error('socket closed');
        if (x.audio) this.audio.push(x.audio.data);
        if (x.text) this.texts.push(x.text);
    }
    close() {
        this.closed = true;
        // a real socket reports closing
        setTimeout(() => this.opts.callbacks.onclose({ reason: 'closed' }), 5);
    }
}
const genaiStub = {
    Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
    EndSensitivity: { END_SENSITIVITY_HIGH: 'HIGH' },
    GoogleGenAI: class {
        constructor() {
            this.live = {
                connect: async opts => {
                    if (failNext > 0) {
                        failNext--;
                        throw new Error('network down');
                    }
                    const s = new FakeSession(opts);
                    connects.push(s);
                    setTimeout(() => opts.callbacks.onopen(), 0);
                    return s;
                },
            };
            this.models = { generateContentStream: async function* () {} };
        }
    },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronStub;
    if (request === '@google/genai') return genaiStub;
    return origLoad.apply(this, arguments);
};

const gemini = require(path.join(process.argv[2] || path.resolve(__dirname, '../..'), 'src/utils/gemini.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
    if (!ok) failures++;
}

// 100 ms of loud audio at 24 kHz (what the app sends), tagged by a counter in the first sample
function chunk(n, loud = true) {
    const buf = Buffer.alloc(4800);
    if (loud) for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(i % 4 === 0 ? 4000 : -4000, i);
    buf.writeInt16LE(n, 0);
    return buf.toString('base64');
}
const MIME = 'audio/pcm;rate=24000';
const statuses = () => sent.filter(([c]) => c === 'update-status').map(([, d]) => d);

(async () => {
    gemini._setLiveTimingForTests({
        backoffMs: [20, 40, 60],
        giveUpMs: 1500,
        replayGapMs: 1,
        watchdogIntervalMs: 50,
        watchdogLoudMs: 1000,
        watchdogMinGapMs: 300,
    });
    const ref = { current: null };
    gemini.setupGeminiIpcHandlers(ref);
    const ok = await handlers['initialize-gemini']({}, 'KEY', '', 'interview', 'en-US');
    check('first connection opens', ok === true && connects.length === 1);
    check('resumption is asked for in the first connection', connects[0].opts.config.sessionResumption !== undefined);

    // 1. normal audio
    for (let i = 0; i < 3; i++) await handlers['send-audio-content']({}, { data: chunk(i), mimeType: MIME });
    check('audio reaches Google normally', connects[0].audio.length === 3);

    // 2. a resume code arrives, then the connection drops while audio keeps coming
    connects[0].opts.callbacks.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'HANDLE-1' } });
    connects[0].failSend = true;
    connects[0].opts.callbacks.onclose({ reason: 'network' });
    for (let i = 10; i < 15; i++) await handlers['send-audio-content']({}, { data: chunk(i), mimeType: MIME });
    check('audio during the gap is accepted (kept)', true);
    await sleep(400);
    check('a second connection was made', connects.length === 2, `(connects=${connects.length})`);
    check('second connection resumes with the saved code', connects[1]?.opts.config.sessionResumption?.handle === 'HANDLE-1');
    check('conversation text is not pasted again when resuming', connects[1].texts.length === 0);
    check(
        'the 5 kept chunks were replayed in order',
        connects[1].audio.length === 5 && connects[1].audio.every((d, i) => Buffer.from(d, 'base64').readInt16LE(0) === 10 + i),
        `(got ${connects[1].audio.length})`
    );
    check(
        'status says reconnecting then back online',
        statuses().some(s => /Reconnecting \(try 1\)/.test(s)) && statuses().some(s => /Back online/.test(s))
    );
    check('app was told the Reconnect button is not needed', !sent.some(([c]) => c === 'reconnect-failed'));

    // 3. Google's go-away warning: swap early, no storm of reconnects
    const before = connects.length;
    connects[1].opts.callbacks.onmessage({ goAway: { timeLeft: '50s' } });
    await sleep(200);
    check('go-away: a fresh connection is opened early', connects.length === before + 1);
    check('go-away: the old connection is closed', connects[before - 1].closed === true);
    await sleep(100);
    check('go-away: only one new connection (no reconnect storm)', connects.length === before + 1, `(connects=${connects.length})`);
    await handlers['send-audio-content']({}, { data: chunk(50), mimeType: MIME });
    check('go-away: audio goes to the new connection', connects[connects.length - 1].audio.length >= 1);

    // 4. a long outage: keeps trying, then offers Reconnect
    const active = connects[connects.length - 1];
    failNext = 1000;
    active.failSend = true;
    active.opts.callbacks.onclose({ reason: 'network' });
    await sleep(1900);
    const failedMsg = sent.find(([c]) => c === 'reconnect-failed');
    check('gives up only after the time limit and says so', !!failedMsg && failedMsg[1].canRetry === true, failedMsg ? '' : '(no message)');
    check('retried several times meanwhile', statuses().filter(s => /Reconnecting \(try/.test(s)).length >= 4);
    failNext = 0;
    const r = await handlers['reconnect-live']({});
    check('Reconnect button works once the network is back', r.success === true);

    // 5. watchdog: loud audio but no words for a while
    const beforeW = connects.length;
    gemini._setLiveTimingForTests({ watchdogLoudMs: 600, watchdogMinGapMs: 60000 });
    for (let i = 0; i < 12; i++) {
        await handlers['send-audio-content']({}, { data: chunk(100 + i), mimeType: MIME });
        await sleep(10);
    }
    await sleep(400);
    check(
        'watchdog refreshes a connection that returns no words',
        connects.length === beforeW + 1,
        `(connects=${connects.length}, before=${beforeW})`
    );
    check(
        'watchdog tells the user',
        statuses().some(s => /looks stuck/.test(s))
    );

    // 6. user ends session: no reconnect
    const n = connects.length;
    await handlers['close-session']({});
    await sleep(200);
    check('ending the session does not reconnect', connects.length === n);

    console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
    process.exit(failures ? 1 : 0);
})().catch(e => {
    console.error('TEST CRASH', e);
    process.exit(2);
});

import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

// True when the recording has at least about half a second of sound above background level. If the recording cannot be
// read, it is assumed to hold speech so nothing real is thrown away.
async function recordingHasSpeech(blob) {
    try {
        const context = new AudioContext();
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        context.close();
        const samples = audio.getChannelData(0);
        const window = Math.max(1, Math.round(audio.sampleRate * 0.05));
        let loudWindows = 0;
        for (let start = 0; start + window <= samples.length; start += window) {
            let sum = 0;
            for (let i = start; i < start + window; i++) sum += samples[i] * samples[i];
            if (Math.sqrt(sum / window) > 0.012) loudWindows += 1;
        }
        return loudWindows >= 10;
    } catch (error) {
        return true;
    }
}

// Practice mode: the app asks questions out loud, the user answers by voice or text, and gets feedback.
export class PracticeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            input.control {
                width: 100%;
                box-sizing: border-box;
            }
            .row {
                display: flex;
                gap: var(--space-sm);
                align-items: center;
                flex-wrap: wrap;
            }
            .btn {
                background: var(--bg-elevated);
                color: var(--text-primary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 8px 14px;
                font-size: var(--font-size-sm);
                cursor: pointer;
            }
            .btn:hover:not([disabled]) {
                border-color: var(--border-strong);
            }
            .btn[disabled] {
                opacity: 0.5;
                cursor: default;
            }
            .btn.primary {
                background: linear-gradient(135deg, #5b6cff, #8b5cf6);
                border-color: transparent;
                color: #fff;
            }
            .btn.recording {
                background: #b4232f;
                border-color: transparent;
                color: #fff;
            }
            .progress {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }
            .question-box {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-left: 3px solid #7c5cff;
                border-radius: 4px 14px 14px 14px;
                padding: 12px 16px;
                font-size: 1.05em;
                line-height: 1.5;
                color: var(--text-primary);
                margin: 8px 0 12px;
            }
            .score {
                font-size: 32px;
                font-weight: 700;
                color: var(--text-primary);
            }
            .score small {
                font-size: 14px;
                font-weight: 400;
                color: var(--text-secondary);
            }
            ul.points {
                margin: 4px 0 12px;
                padding-left: 1.2em;
                color: var(--text-primary);
                line-height: 1.5;
            }
            .heading {
                font-weight: 600;
                font-size: var(--font-size-sm);
                color: var(--text-primary);
                margin-top: 10px;
            }
            .better {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 10px 14px;
                line-height: 1.55;
                color: var(--text-primary);
                white-space: pre-wrap;
            }
            .error {
                color: #f87171;
                font-size: var(--font-size-sm);
                margin-top: 8px;
            }
            .timer {
                font-variant-numeric: tabular-nums;
                font-size: var(--font-size-sm);
                color: var(--text-secondary);
            }
            .timer.low {
                color: #f87171;
            }
            .small-row {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                padding: 6px 0;
                border-bottom: 1px solid var(--border);
                font-size: var(--font-size-sm);
                color: var(--text-primary);
            }
            .muted {
                color: var(--text-secondary);
            }
            .answer-line {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 10px 14px;
                line-height: 1.55;
                color: var(--text-primary);
                margin-top: 8px;
            }
            .status {
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
                margin-top: 8px;
            }
        `,
    ];

    static properties = {
        _step: { state: true }, // setup | loading | question | reviewing | feedback | done | watch
        _setup: { state: true },
        _questions: { state: true },
        _index: { state: true },
        _answer: { state: true },
        _prompt: { state: true },
        _stage: { state: true }, // main | followup
        _results: { state: true },
        _error: { state: true },
        _status: { state: true },
        _recording: { state: true },
        _timeLeft: { state: true },
        _history: { state: true },
        _best: { state: true },
        _note: { state: true },
        _exchanges: { state: true },
        _watchShown: { state: true }, // 0 = question only, 1 = question and answer
        _paused: { state: true },
    };

    constructor() {
        super();
        this._step = 'setup';
        this._setup = {
            mode: 'practice',
            role: '',
            company: '',
            jobDescription: '',
            count: 5,
            focus: '',
            difficulty: 'standard',
            timer: 0,
            voice: 'gemini', // gemini | computer | off
            interviewerVoice: 'Kore',
            handsFree: false,
            followUps: true,
            saveHistory: true,
        };
        this._questions = [];
        this._index = 0;
        this._answer = '';
        this._prompt = '';
        this._stage = 'main';
        this._results = [];
        this._error = '';
        this._status = '';
        this._recording = false;
        this._timeLeft = 0;
        this._history = [];
        this._best = [];
        this._note = '';
        this._exchanges = [];
        this._watchShown = 0;
        this._paused = false;
        this._recorder = null;
        this._chunks = [];
        this._stream = null;
        this._audio = null;
        this._speechToken = 0;
        this._watchRun = 0;
        this._timerId = null;
        this._vadId = null;
        this._background = '';
        this._followUpText = '';
        this._firstAnswer = '';
        this._loadDefaults();
    }

    get _ipc() {
        return window.require('electron').ipcRenderer;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopEverything();
    }

    _stopEverything() {
        this._stopSpeaking();
        this._clearTimer();
        this._clearVad();
        if (this._recorder && this._recorder.state !== 'inactive') {
            this._recorder.onstop = null;
            this._recorder.stop();
        }
        this._releaseMic();
    }

    async _loadDefaults() {
        try {
            const prefs = await softMaster.storage.getPreferences();
            this._setup = { ...this._setup, company: prefs.company || '', jobDescription: prefs.jobDescription || '', saveHistory: prefs.practiceSaveHistory !== false };
            const docs = await this._ipc.invoke('documents:get-context');
            this._background = [prefs.customPrompt || '', docs || ''].filter(Boolean).join('\n\n');
        } catch (error) {
            console.error('Could not load practice defaults:', error);
        }
        this._loadHistory();
    }

    async _loadHistory() {
        const response = await this._ipc.invoke('practice:history-list');
        if (response.success) {
            this._history = response.sessions;
            this._best = response.best;
        }
    }

    _set(key, value) {
        this._setup = { ...this._setup, [key]: value };
        if (key === 'saveHistory') softMaster.storage.updatePreference('practiceSaveHistory', value);
    }

    // ---- speaking: Gemini voice, falling back to the computer's own voice ----
    // Resolves when the speech has finished (or was stopped).
    async _say(text, voiceName) {
        this._stopSpeaking();
        if (this._setup.voice === 'off' || !text) return;
        const token = this._speechToken;
        if (this._setup.voice === 'gemini') {
            const response = await this._ipc.invoke('practice:speak', { text, voice: voiceName || this._setup.interviewerVoice });
            if (token !== this._speechToken) return;
            if (response.success) {
                await this._playAudio(response.audio, response.mimeType, token);
                return;
            }
            this._status = 'The better voice is not available right now, so the computer voice is being used.';
        }
        await this._computerSpeak(text, token);
    }

    _playAudio(base64, mimeType, token) {
        return new Promise(resolve => {
            const audio = new Audio(`data:${mimeType};base64,${base64}`);
            this._audio = audio;
            const done = () => {
                if (this._audio === audio) this._audio = null;
                resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            if (token !== this._speechToken) return done();
            audio.play().catch(done);
        });
    }

    _computerSpeak(text, token) {
        return new Promise(resolve => {
            if (!('speechSynthesis' in window) || token !== this._speechToken) return resolve();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.95;
            utterance.onend = resolve;
            utterance.onerror = resolve;
            window.speechSynthesis.speak(utterance);
        });
    }

    _stopSpeaking() {
        this._speechToken += 1;
        if (this._audio) {
            this._audio.pause();
            this._audio = null;
        }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    // ---- timer ----
    _startTimer() {
        this._clearTimer();
        const limit = Number(this._setup.timer) || 0;
        if (!limit) return;
        this._timeLeft = limit * 60;
        this._timerId = setInterval(() => {
            this._timeLeft -= 1;
            if (this._timeLeft <= 0) {
                this._clearTimer();
                this._timeUp();
            }
        }, 1000);
    }

    _clearTimer() {
        if (this._timerId) clearInterval(this._timerId);
        this._timerId = null;
        this._timeLeft = 0;
    }

    _timeUp() {
        if (this._recording) {
            this._recorder.stop(); // finishing the recording submits it in hands-free mode
            return;
        }
        if (this._step === 'question' && this._answer.trim()) this._submit();
        else this._status = 'Time is up. Add your answer and press Get feedback when ready.';
    }

    // ---- steps ----
    async _start() {
        if (!this._setup.role.trim()) {
            this._error = 'Type the role you are practising for first (for example "Customer Support Lead").';
            return;
        }
        this._error = '';
        this._note = '';
        this._step = 'loading';
        const watch = this._setup.mode === 'watch';
        this._status = watch ? 'Writing a sample interview...' : 'Writing your questions...';
        const response = await this._ipc.invoke(watch ? 'practice:both-sides' : 'practice:questions', { ...this._setup, background: this._background });
        if (!response.success) {
            this._step = 'setup';
            this._error = response.error;
            return;
        }
        if (watch) {
            if (!response.exchanges.length) {
                this._step = 'setup';
                this._error = 'No interview came back. Try again.';
                return;
            }
            this._exchanges = response.exchanges;
            this._index = 0;
            this._step = 'watch';
            this._playWatch();
            return;
        }
        if (!response.questions.length) {
            this._step = 'setup';
            this._error = 'No questions came back. Try again.';
            return;
        }
        this._questions = response.questions;
        this._results = [];
        this._index = 0;
        this._askCurrent();
    }

    async _askCurrent() {
        this._clearTimer();
        this._answer = '';
        this._firstAnswer = '';
        this._followUpText = '';
        this._stage = 'main';
        this._error = '';
        this._status = '';
        this._step = 'question';
        this._prompt = this._questions[this._index].question;
        await this._speakAndListen();
    }

    // Reads the current question aloud, then starts the timer and (in hands-free mode) the microphone.
    async _speakAndListen() {
        const step = this._step;
        const stage = this._stage;
        const index = this._index;
        await this._say(this._prompt);
        if (this._step !== step || this._stage !== stage || this._index !== index) return;
        this._startTimer();
        if (this._setup.handsFree) await this._toggleRecording();
    }

    async _toggleRecording() {
        if (this._recording) {
            this._recorder.stop();
            return;
        }
        this._stopSpeaking();
        this._error = '';
        try {
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            this._error = 'The microphone could not be opened. Check that it is plugged in and allowed, or type your answer instead.';
            return;
        }
        this._chunks = [];
        this._recorder = new MediaRecorder(this._stream);
        this._recorder.ondataavailable = e => e.data.size && this._chunks.push(e.data);
        this._recorder.onstop = () => this._finishRecording();
        this._recorder.start();
        this._recording = true;
        if (this._setup.handsFree) this._watchSilence();
    }

    // Stops the recording by itself after the person has spoken and then gone quiet.
    _watchSilence() {
        this._clearVad();
        try {
            const context = new AudioContext();
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            context.createMediaStreamSource(this._stream).connect(analyser);
            const data = new Uint8Array(analyser.fftSize);
            let spoke = false;
            let quietSince = Date.now();
            const startedAt = Date.now();
            this._vadId = setInterval(() => {
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (const v of data) sum += ((v - 128) / 128) ** 2;
                const loud = Math.sqrt(sum / data.length) > 0.03;
                const now = Date.now();
                if (loud) {
                    spoke = true;
                    quietSince = now;
                }
                const quietFor = now - quietSince;
                if ((spoke && quietFor > 2500) || (!spoke && now - startedAt > 15000) || now - startedAt > 180000) {
                    this._clearVad();
                    context.close();
                    if (this._recording) this._recorder.stop();
                }
            }, 150);
        } catch (error) {
            console.warn('Silence detection is not available:', error);
        }
    }

    _clearVad() {
        if (this._vadId) clearInterval(this._vadId);
        this._vadId = null;
    }

    _releaseMic() {
        if (this._stream) this._stream.getTracks().forEach(t => t.stop());
        this._stream = null;
        this._recording = false;
    }

    async _finishRecording() {
        this._clearVad();
        const type = this._recorder?.mimeType || 'audio/webm';
        const blob = new Blob(this._chunks, { type });
        this._releaseMic();
        if (!blob.size) return;
        // A silent recording makes the AI invent words, so recordings with no real speech are never sent.
        if (!(await recordingHasSpeech(blob))) {
            this._status = '';
            this._error = 'No speech was heard. Check your microphone, then try again or type your answer.';
            return;
        }
        this._status = 'Writing down what you said...';
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode.apply(null, buffer.subarray(i, i + 0x8000));
        const response = await this._ipc.invoke('practice:transcribe', { data: btoa(binary), mimeType: type });
        this._status = '';
        if (!response.success) {
            this._error = response.error;
            return;
        }
        const heard = response.text.trim();
        this._answer = [this._answer.trim(), heard].filter(Boolean).join(' ');
        if (!heard) {
            this._error = 'No speech was heard. Try again, or type your answer.';
            return;
        }
        if (this._setup.handsFree) this._submit();
    }

    async _submit() {
        if (!this._answer.trim()) {
            this._error = 'Say or type your answer first.';
            return;
        }
        this._clearTimer();
        this._error = '';
        const question = this._questions[this._index];

        // After the first answer, a real interviewer may ask one follow-up that reacts to what was said.
        if (this._stage === 'main') {
            this._firstAnswer = this._answer.trim();
            if (this._setup.followUps) {
                this._step = 'reviewing';
                this._status = 'Thinking about a follow-up...';
                const response = await this._ipc.invoke('practice:followup', { question: question.question, answer: this._firstAnswer, role: this._setup.role, difficulty: this._setup.difficulty });
                this._status = '';
                if (response.success && response.followUp) {
                    this._stage = 'followup';
                    this._followUpText = response.followUp;
                    this._prompt = response.followUp;
                    this._answer = '';
                    this._step = 'question';
                    await this._speakAndListen();
                    return;
                }
            }
        }

        this._step = 'reviewing';
        this._status = 'Marking your answer...';
        const combined = this._stage === 'followup' ? `${this._firstAnswer}\n\nFollow-up question from the interviewer: ${this._followUpText}\nCandidate's answer to the follow-up: ${this._answer.trim()}` : this._answer.trim();
        const response = await this._ipc.invoke('practice:evaluate', {
            question: question.question,
            answer: combined,
            role: this._setup.role,
            background: this._background,
            difficulty: this._setup.difficulty,
        });
        this._status = '';
        if (!response.success) {
            this._step = 'question';
            this._error = response.error;
            return;
        }
        this._results = [...this._results, { question: question.question, answer: combined, followUp: this._followUpText, ...response.feedback }];
        this._step = 'feedback';
        const feedback = response.feedback;
        await this._say(`You scored ${feedback.score} out of 10. ${feedback.summary}`);
        if (this._setup.handsFree && this._step === 'feedback') {
            await new Promise(resolve => setTimeout(resolve, 1200));
            if (this._step === 'feedback') this._next();
        }
    }

    _next() {
        this._stopSpeaking();
        if (this._index + 1 >= this._questions.length) {
            this._finish();
            return;
        }
        this._index += 1;
        this._askCurrent();
    }

    async _finish() {
        this._step = 'done';
        this._note = '';
        if (!this._setup.saveHistory) return;
        const response = await this._ipc.invoke('practice:history-save', { role: this._setup.role, difficulty: this._setup.difficulty, mode: 'practice', results: this._results });
        if (response.success) {
            this._note = 'Saved to your progress.';
            this._loadHistory();
        }
    }

    _restart() {
        this._stopEverything();
        this._step = 'setup';
        this._questions = [];
        this._results = [];
        this._exchanges = [];
        this._error = '';
        this._loadHistory();
    }

    // ---- "AI plays both sides" ----
    async _playWatch() {
        const token = ++this._watchRun;
        this._paused = false;
        while (this._step === 'watch' && this._index < this._exchanges.length) {
            const exchange = this._exchanges[this._index];
            this._watchShown = 0;
            await this._say(exchange.question, this._setup.interviewerVoice);
            if (token !== this._watchRun || this._step !== 'watch') return;
            this._watchShown = 1;
            await this._say(exchange.answer, this._setup.interviewerVoice === 'Puck' ? 'Kore' : 'Puck');
            if (token !== this._watchRun || this._step !== 'watch') return;
            if (this._setup.voice === 'off') return; // nothing paces it, so wait for the Next button
            this._index += 1;
        }
        if (token === this._watchRun && this._step === 'watch' && this._index >= this._exchanges.length) this._step = 'watchdone';
    }

    _watchPause() {
        this._watchRun += 1;
        this._stopSpeaking();
        this._paused = true;
    }

    _watchNext() {
        this._watchRun += 1;
        this._stopSpeaking();
        if (this._index + 1 >= this._exchanges.length) {
            this._step = 'watchdone';
            return;
        }
        this._index += 1;
        this._playWatch();
    }

    _watchReplay() {
        this._watchRun += 1;
        this._stopSpeaking();
        this._playWatch();
    }

    _tryYourself() {
        this._stopEverything();
        this._setup = { ...this._setup, mode: 'practice' };
        this._start();
    }

    async _addToBank(item) {
        const response = await this._ipc.invoke('answerbank:save', { heading: item.question, body: item.betterAnswer });
        this._note = response && response.success ? 'Added to your answer bank. The live assistant can now use it.' : (response && response.error) || 'Could not add it.';
    }

    async _clearHistory() {
        if (!window.confirm('Delete your saved practice scores and best answers? This cannot be undone.')) return;
        await this._ipc.invoke('practice:history-clear');
        this._history = [];
        this._best = [];
    }

    // ---- screens ----
    _renderSetup() {
        const s = this._setup;
        const watch = s.mode === 'watch';
        return html`
            <section class="surface">
                <div class="surface-title">Practice interview</div>
                <div class="surface-subtitle">
                    Choose how to practise. It uses your company, job description and documents from Session Setup.
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Mode</label>
                        <select class="control" @change=${e => this._set('mode', e.target.value)}>
                            <option value="practice" ?selected=${!watch}>You answer (scored)</option>
                            <option value="watch" ?selected=${watch}>Watch the AI do both sides</option>
                        </select>
                    </div>
                    <div class="form-group vertical">
                        <label class="form-label">Role you are practising for</label>
                        <input class="control" placeholder="e.g. Customer Support Lead" .value=${s.role} @input=${e => this._set('role', e.target.value)} />
                    </div>
                    <div class="form-group vertical">
                        <label class="form-label">Company (optional)</label>
                        <input class="control" .value=${s.company} @input=${e => this._set('company', e.target.value)} />
                    </div>
                    <div class="form-group vertical">
                        <label class="form-label">Job description (optional)</label>
                        <textarea class="control" .value=${s.jobDescription} @input=${e => this._set('jobDescription', e.target.value)}></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Number of questions</label>
                        <select class="control" @change=${e => this._set('count', Number(e.target.value))}>
                            ${(watch ? [2, 3, 4, 6] : [3, 5, 8, 10]).map(n => html`<option value=${n} ?selected=${s.count === n}>${n}</option>`)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Kind of questions</label>
                        <select class="control" @change=${e => this._set('focus', e.target.value)}>
                            <option value="">A mix</option>
                            <option value="behavioural questions about past experience">About my experience</option>
                            <option value="technical and role knowledge questions">Role knowledge</option>
                            <option value="situational 'what would you do' questions">What would you do</option>
                            <option value="tough, probing questions an interviewer uses to test you">Tough questions</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Difficulty</label>
                        <select class="control" @change=${e => this._set('difficulty', e.target.value)}>
                            <option value="easy" ?selected=${s.difficulty === 'easy'}>Easy (friendly)</option>
                            <option value="standard" ?selected=${s.difficulty === 'standard'}>Standard</option>
                            <option value="hard" ?selected=${s.difficulty === 'hard'}>Hard (strict, tough follow-ups)</option>
                        </select>
                    </div>
                    ${watch
                        ? ''
                        : html`
                              <div class="form-group">
                                  <label class="form-label">Time for each answer</label>
                                  <select class="control" @change=${e => this._set('timer', Number(e.target.value))}>
                                      <option value="0" ?selected=${s.timer === 0}>No timer</option>
                                      <option value="1" ?selected=${s.timer === 1}>1 minute</option>
                                      <option value="2" ?selected=${s.timer === 2}>2 minutes</option>
                                      <option value="3" ?selected=${s.timer === 3}>3 minutes</option>
                                  </select>
                              </div>
                              <label class="form-group" style="cursor: pointer;">
                                  <span>
                                      <span class="form-label" style="cursor: pointer;">Follow-up questions</span>
                                      <div class="form-help">The interviewer may react to what you said with one follow-up.</div>
                                  </span>
                                  <input type="checkbox" .checked=${s.followUps} @change=${e => this._set('followUps', e.target.checked)} />
                              </label>
                              <label class="form-group" style="cursor: pointer;">
                                  <span>
                                      <span class="form-label" style="cursor: pointer;">Hands-free conversation</span>
                                      <div class="form-help">The app asks, listens until you stop talking, then reacts, with no clicking. Needs a microphone and the voice on.</div>
                                  </span>
                                  <input type="checkbox" .checked=${s.handsFree} @change=${e => this._set('handsFree', e.target.checked)} />
                              </label>
                          `}
                    <div class="form-group">
                        <label class="form-label">Voice</label>
                        <select class="control" @change=${e => this._set('voice', e.target.value)}>
                            <option value="gemini" ?selected=${s.voice === 'gemini'}>Natural voice (uses your Gemini key)</option>
                            <option value="computer" ?selected=${s.voice === 'computer'}>Computer voice (free, robotic)</option>
                            <option value="off" ?selected=${s.voice === 'off'}>No voice (read only)</option>
                        </select>
                    </div>
                    ${s.voice === 'gemini'
                        ? html`<div class="form-group">
                              <label class="form-label">Interviewer's voice</label>
                              <select class="control" @change=${e => this._set('interviewerVoice', e.target.value)}>
                                  ${['Kore', 'Charon', 'Puck', 'Aoede', 'Fenrir', 'Leda'].map(v => html`<option value=${v} ?selected=${s.interviewerVoice === v}>${v}</option>`)}
                              </select>
                          </div>`
                        : ''}
                    ${watch
                        ? ''
                        : html`<label class="form-group" style="cursor: pointer;">
                              <span>
                                  <span class="form-label" style="cursor: pointer;">Save my scores and best answers</span>
                                  <div class="form-help">Kept on this computer only. Turn off to keep no record of your practice.</div>
                              </span>
                              <input type="checkbox" .checked=${s.saveHistory} @change=${e => this._set('saveHistory', e.target.checked)} />
                          </label>`}
                </div>
                <div class="row" style="margin-top: 12px;">
                    <button class="btn primary" @click=${this._start}>${watch ? 'Start the sample interview' : 'Start practice'}</button>
                </div>
                ${this._error ? html`<div class="error">${this._error}</div>` : ''}
            </section>
            ${this._renderProgress()}
        `;
    }

    _renderProgress() {
        if (!this._history.length && !this._best.length) return '';
        const recent = this._history.filter(h => h.mode === 'practice').slice(0, 6);
        return html`
            <section class="surface">
                <div class="surface-title">Your progress</div>
                ${recent.length
                    ? html`<div class="heading">Recent practice</div>
                          ${recent.map(h => html`<div class="small-row"><span>${new Date(h.date).toLocaleDateString()} · ${h.role || 'Practice'} <span class="muted">(${h.difficulty})</span></span><strong>${h.average} / 10</strong></div>`)}`
                    : ''}
                ${this._best.length
                    ? html`<div class="heading">Your best answers (8 or more)</div>
                          ${this._best.slice(0, 5).map(
                              b => html`<div class="answer-line"><strong>${b.question}</strong> <span class="muted">· ${b.score}/10</span><div style="margin-top:6px;white-space:pre-wrap;">${b.betterAnswer}</div>
                                  <div class="row" style="margin-top:8px;"><button class="btn" @click=${() => this._addToBank(b)}>Add to my answer bank</button></div></div>`
                          )}`
                    : ''}
                ${this._note ? html`<div class="status">${this._note}</div>` : ''}
                <div class="row" style="margin-top: 10px;"><button class="btn" @click=${this._clearHistory}>Delete my practice history</button></div>
            </section>
        `;
    }

    _renderQuestion() {
        const q = this._questions[this._index];
        const followUp = this._stage === 'followup';
        const mins = Math.floor(this._timeLeft / 60);
        const secs = String(this._timeLeft % 60).padStart(2, '0');
        return html`
            <section class="surface">
                <div class="row" style="justify-content: space-between;">
                    <div class="progress">Question ${this._index + 1} of ${this._questions.length}${q.type ? ` · ${q.type}` : ''}${followUp ? ' · follow-up' : ''}</div>
                    ${this._timerId ? html`<div class="timer ${this._timeLeft <= 15 ? 'low' : ''}">${mins}:${secs}</div>` : ''}
                </div>
                ${followUp ? html`<div class="muted" style="font-size: var(--font-size-sm);">${q.question}</div>` : ''}
                <div class="question-box">${this._prompt}</div>
                <div class="row">
                    <button class="btn" @click=${() => this._say(this._prompt)}>Hear it again</button>
                </div>
                <div class="form-group vertical" style="margin-top: 12px;">
                    <label class="form-label">Your answer</label>
                    <textarea class="control" placeholder="Press Record and speak, or type here" .value=${this._answer} @input=${e => (this._answer = e.target.value)}></textarea>
                </div>
                <div class="row" style="margin-top: 10px;">
                    <button class="btn ${this._recording ? 'recording' : ''}" @click=${this._toggleRecording}>${this._recording ? 'Stop recording' : 'Record my answer'}</button>
                    <button class="btn primary" ?disabled=${this._recording || this._step === 'reviewing'} @click=${this._submit}>Get feedback</button>
                </div>
                ${this._status ? html`<div class="status">${this._status}</div>` : ''}
                ${this._error ? html`<div class="error">${this._error}</div>` : ''}
            </section>
        `;
    }

    _renderFeedback() {
        const r = this._results[this._results.length - 1];
        const last = this._index + 1 >= this._questions.length;
        return html`
            <section class="surface">
                <div class="progress">Question ${this._index + 1} of ${this._questions.length}</div>
                <div class="question-box">${r.question}</div>
                ${r.followUp ? html`<div class="muted" style="margin-bottom:8px;">Follow-up: ${r.followUp}</div>` : ''}
                <div class="score">${r.score}<small> / 10</small></div>
                <div>${r.summary}</div>
                ${r.strengths.length ? html`<div class="heading">What worked</div><ul class="points">${r.strengths.map(s => html`<li>${s}</li>`)}</ul>` : ''}
                ${r.improvements.length ? html`<div class="heading">What to improve</div><ul class="points">${r.improvements.map(s => html`<li>${s}</li>`)}</ul>` : ''}
                <div class="heading">A stronger answer</div>
                <div class="better">${r.betterAnswer}</div>
                <div class="row" style="margin-top: 12px;">
                    <button class="btn" @click=${() => this._say(r.betterAnswer, 'Puck')}>Hear the stronger answer</button>
                    <button class="btn" @click=${() => this._addToBank(r)}>Add to my answer bank</button>
                    <button class="btn primary" @click=${this._next}>${last ? 'See my results' : 'Next question'}</button>
                </div>
                ${this._note ? html`<div class="status">${this._note}</div>` : ''}
            </section>
        `;
    }

    _renderDone() {
        const average = this._results.reduce((sum, r) => sum + r.score, 0) / (this._results.length || 1);
        return html`
            <section class="surface">
                <div class="surface-title">Practice finished</div>
                <div class="score">${average.toFixed(1)}<small> / 10 average over ${this._results.length} question${this._results.length === 1 ? '' : 's'}</small></div>
                <ul class="points">
                    ${this._results.map(r => html`<li><strong>${r.score}/10</strong> · ${r.question}</li>`)}
                </ul>
                ${this._note ? html`<div class="status">${this._note}</div>` : ''}
                <div class="row"><button class="btn primary" @click=${this._restart}>Practise again</button></div>
            </section>
        `;
    }

    _renderWatch() {
        const e = this._exchanges[Math.min(this._index, this._exchanges.length - 1)];
        return html`
            <section class="surface">
                <div class="progress">Sample interview · question ${this._index + 1} of ${this._exchanges.length}</div>
                <div class="heading">Interviewer</div>
                <div class="question-box">${e.question}</div>
                ${this._watchShown ? html`<div class="heading">Candidate</div><div class="better">${e.answer}</div>` : ''}
                <div class="row" style="margin-top: 12px;">
                    ${this._paused ? html`<button class="btn" @click=${this._watchReplay}>Play</button>` : html`<button class="btn" @click=${this._watchPause}>Pause</button>`}
                    <button class="btn" @click=${this._watchReplay}>Replay this question</button>
                    <button class="btn primary" @click=${this._watchNext}>${this._index + 1 >= this._exchanges.length ? 'Finish' : 'Next question'}</button>
                </div>
                ${this._status ? html`<div class="status">${this._status}</div>` : ''}
            </section>
        `;
    }

    _renderWatchDone() {
        return html`
            <section class="surface">
                <div class="surface-title">That was a sample interview</div>
                <div class="surface-subtitle">The answers use only what is in your documents. Now try the same questions yourself and get scored.</div>
                <div class="row">
                    <button class="btn primary" @click=${this._tryYourself}>Try it myself</button>
                    <button class="btn" @click=${this._restart}>Back</button>
                </div>
            </section>
        `;
    }

    render() {
        let body;
        if (this._step === 'setup') body = this._renderSetup();
        else if (this._step === 'loading') body = html`<section class="surface"><div class="status">${this._status}</div></section>`;
        else if (this._step === 'question' || this._step === 'reviewing') body = this._renderQuestion();
        else if (this._step === 'feedback') body = this._renderFeedback();
        else if (this._step === 'watch') body = this._renderWatch();
        else if (this._step === 'watchdone') body = this._renderWatchDone();
        else body = this._renderDone();
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div>
                        <div class="page-title">Practice</div>
                        <div class="page-subtitle">Rehearse out loud before the real thing.</div>
                    </div>
                    ${body}
                </div>
            </div>
        `;
    }
}

customElements.define('practice-view', PracticeView);

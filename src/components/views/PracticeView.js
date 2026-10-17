import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

// Practice mode: the app asks questions out loud, the user answers by voice or text, and gets feedback.
export class PracticeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
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
            .status {
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
                margin-top: 8px;
            }
        `,
    ];

    static properties = {
        _step: { state: true }, // setup | loading | question | reviewing | feedback | done
        _setup: { state: true },
        _questions: { state: true },
        _index: { state: true },
        _answer: { state: true },
        _results: { state: true },
        _error: { state: true },
        _status: { state: true },
        _recording: { state: true },
        _speak: { state: true },
    };

    constructor() {
        super();
        this._step = 'setup';
        this._setup = { role: '', company: '', jobDescription: '', count: 5, focus: '' };
        this._questions = [];
        this._index = 0;
        this._answer = '';
        this._results = [];
        this._error = '';
        this._status = '';
        this._recording = false;
        this._speak = true;
        this._recorder = null;
        this._chunks = [];
        this._stream = null;
        this._background = '';
        this._loadDefaults();
    }

    get _ipc() {
        return window.require('electron').ipcRenderer;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopSpeaking();
        this._releaseMic();
    }

    async _loadDefaults() {
        try {
            const prefs = await softMaster.storage.getPreferences();
            this._setup = { ...this._setup, company: prefs.company || '', jobDescription: prefs.jobDescription || '' };
            const docs = await this._ipc.invoke('documents:get-context');
            this._background = [prefs.customPrompt || '', docs || ''].filter(Boolean).join('\n\n');
        } catch (error) {
            console.error('Could not load practice defaults:', error);
        }
    }

    _set(key, value) {
        this._setup = { ...this._setup, [key]: value };
    }

    // ---- speaking ----
    _speakText(text) {
        this._stopSpeaking();
        if (!this._speak || !('speechSynthesis' in window) || !text) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
    }

    _stopSpeaking() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    // ---- steps ----
    async _start() {
        if (!this._setup.role.trim()) {
            this._error = 'Type the role you are practising for first (for example "Customer Support Lead").';
            return;
        }
        this._error = '';
        this._step = 'loading';
        this._status = 'Writing your questions...';
        const response = await this._ipc.invoke('practice:questions', { ...this._setup, background: this._background });
        if (!response.success) {
            this._step = 'setup';
            this._error = response.error;
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

    _askCurrent() {
        this._answer = '';
        this._error = '';
        this._status = '';
        this._step = 'question';
        this._speakText(this._questions[this._index].question);
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
    }

    _releaseMic() {
        if (this._stream) this._stream.getTracks().forEach(t => t.stop());
        this._stream = null;
        this._recording = false;
    }

    async _finishRecording() {
        const type = this._recorder?.mimeType || 'audio/webm';
        const blob = new Blob(this._chunks, { type });
        this._releaseMic();
        if (!blob.size) return;
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
        this._answer = [this._answer.trim(), response.text.trim()].filter(Boolean).join(' ');
        if (!response.text.trim()) this._error = 'No speech was heard. Try again, or type your answer.';
    }

    async _submit() {
        if (!this._answer.trim()) {
            this._error = 'Say or type your answer first.';
            return;
        }
        this._error = '';
        this._step = 'reviewing';
        const question = this._questions[this._index];
        const response = await this._ipc.invoke('practice:evaluate', {
            question: question.question,
            answer: this._answer,
            role: this._setup.role,
            background: this._background,
        });
        if (!response.success) {
            this._step = 'question';
            this._error = response.error;
            return;
        }
        this._results = [...this._results, { question: question.question, answer: this._answer, ...response.feedback }];
        this._step = 'feedback';
    }

    _next() {
        this._stopSpeaking();
        if (this._index + 1 >= this._questions.length) {
            this._step = 'done';
            return;
        }
        this._index += 1;
        this._askCurrent();
    }

    _restart() {
        this._stopSpeaking();
        this._step = 'setup';
        this._questions = [];
        this._results = [];
        this._error = '';
    }

    // ---- screens ----
    _renderSetup() {
        const s = this._setup;
        return html`
            <section class="surface">
                <div class="surface-title">Practice interview</div>
                <div class="surface-subtitle">
                    The app asks you questions out loud. Answer by speaking or typing, then see a score, what worked, what to fix and a stronger version you could say.
                    It uses your company, job description and documents from Session Setup.
                </div>
                <div class="form-grid">
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
                        <select class="control" .value=${String(s.count)} @change=${e => this._set('count', Number(e.target.value))}>
                            ${[3, 5, 8, 10].map(n => html`<option value=${n} ?selected=${s.count === n}>${n}</option>`)}
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
                    <label class="form-group" style="cursor: pointer;">
                        <span class="form-label" style="cursor: pointer;">Read questions aloud</span>
                        <input type="checkbox" .checked=${this._speak} @change=${e => (this._speak = e.target.checked)} />
                    </label>
                </div>
                <div class="row" style="margin-top: 12px;">
                    <button class="btn primary" @click=${this._start}>Start practice</button>
                </div>
                ${this._error ? html`<div class="error">${this._error}</div>` : ''}
            </section>
        `;
    }

    _renderQuestion() {
        const q = this._questions[this._index];
        return html`
            <section class="surface">
                <div class="progress">Question ${this._index + 1} of ${this._questions.length}${q.type ? ` · ${q.type}` : ''}</div>
                <div class="question-box">${q.question}</div>
                <div class="row">
                    <button class="btn" @click=${() => this._speakText(q.question)}>Hear it again</button>
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
                <div class="score">${r.score}<small> / 10</small></div>
                <div>${r.summary}</div>
                ${r.strengths.length ? html`<div class="heading">What worked</div><ul class="points">${r.strengths.map(s => html`<li>${s}</li>`)}</ul>` : ''}
                ${r.improvements.length ? html`<div class="heading">What to improve</div><ul class="points">${r.improvements.map(s => html`<li>${s}</li>`)}</ul>` : ''}
                <div class="heading">A stronger answer</div>
                <div class="better">${r.betterAnswer}</div>
                <div class="row" style="margin-top: 12px;">
                    <button class="btn" @click=${() => this._speakText(r.betterAnswer)}>Hear the stronger answer</button>
                    <button class="btn primary" @click=${this._next}>${last ? 'See my results' : 'Next question'}</button>
                </div>
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
                <div class="row"><button class="btn primary" @click=${this._restart}>Practise again</button></div>
            </section>
        `;
    }

    render() {
        let body;
        if (this._step === 'setup') body = this._renderSetup();
        else if (this._step === 'loading') body = html`<section class="surface"><div class="status">${this._status}</div></section>`;
        else if (this._step === 'question' || this._step === 'reviewing') body = this._renderQuestion();
        else if (this._step === 'feedback') body = this._renderFeedback();
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

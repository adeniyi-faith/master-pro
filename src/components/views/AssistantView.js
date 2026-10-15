import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class AssistantView extends LitElement {
    static styles = css`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        * {
            font-family: var(--font);
            cursor: default;
        }

        /* ── Response area ── */

        .response-container {
            flex: 1;
            overflow-y: auto;
            font-size: var(--response-font-size, 15px);
            line-height: var(--line-height);
            background: var(--bg-app);
            padding: var(--space-sm) var(--space-md);
            scroll-behavior: smooth;
            user-select: text;
            cursor: text;
            color: var(--text-primary);
        }

        .response-container * {
            user-select: text;
            cursor: text;
        }

        .response-container a {
            cursor: pointer;
        }

        .response-container [data-word] {
            display: inline-block;
        }

        /* ── Markdown ── */

        .response-container h1,
        .response-container h2,
        .response-container h3,
        .response-container h4,
        .response-container h5,
        .response-container h6 {
            margin: 1em 0 0.5em 0;
            color: var(--text-primary);
            font-weight: var(--font-weight-semibold);
        }

        .response-container h1 { font-size: 1.5em; }
        .response-container h2 { font-size: 1.3em; }
        .response-container h3 { font-size: 1.15em; }
        .response-container h4 { font-size: 1.05em; }
        .response-container h5,
        .response-container h6 { font-size: 1em; }

        .response-container p {
            margin: 0.6em 0;
            color: var(--text-primary);
        }

        .response-container ul,
        .response-container ol {
            margin: 0.6em 0;
            padding-left: 1.5em;
            color: var(--text-primary);
        }

        .response-container li {
            margin: 0.3em 0;
        }

        .response-container blockquote {
            margin: 0.8em 0;
            padding: 0.5em 1em;
            border-left: 2px solid var(--border-strong);
            background: var(--bg-surface);
            border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }

        .response-container code {
            background: var(--bg-elevated);
            padding: 0.15em 0.4em;
            border-radius: var(--radius-sm);
            font-family: var(--font-mono);
            font-size: 0.85em;
        }

        .response-container pre {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: var(--space-md);
            overflow-x: auto;
            margin: 0.8em 0;
        }

        .response-container pre code {
            background: none;
            padding: 0;
        }

        .response-container a {
            color: var(--accent);
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        .response-container strong,
        .response-container b {
            font-weight: var(--font-weight-semibold);
        }

        .response-container hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 1.5em 0;
        }

        .response-container table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.8em 0;
        }

        .response-container th,
        .response-container td {
            border: 1px solid var(--border);
            padding: var(--space-sm);
            text-align: left;
        }

        .response-container th {
            background: var(--bg-surface);
            font-weight: var(--font-weight-semibold);
        }

        .response-container::-webkit-scrollbar {
            width: 6px;
        }

        .response-container::-webkit-scrollbar-track {
            background: transparent;
        }

        .response-container::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb:hover {
            background: #444444;
        }


        /* ── Conversation feed ── */

        .turn {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin: 10px 0 18px;
            animation: turn-in 0.35s ease both;
        }

        @keyframes turn-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: none; }
        }

        .question {
            align-self: flex-end;
            max-width: 85%;
            background: linear-gradient(135deg, #5b6cff, #8b5cf6);
            color: #fff;
            padding: 8px 14px;
            border-radius: 16px 16px 4px 16px;
            font-size: 0.9em;
            line-height: 1.4;
            box-shadow: 0 2px 10px rgba(80, 90, 255, 0.25);
        }

        .question-label {
            align-self: flex-end;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--text-muted);
            margin-bottom: -2px;
        }

        .answer-card {
            position: relative;
            align-self: flex-start;
            max-width: 100%;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-left: 3px solid #7c5cff;
            border-radius: 4px 14px 14px 14px;
            padding: 4px 14px 8px;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .answer-card.latest {
            box-shadow: 0 0 0 1px rgba(124, 92, 255, 0.25), 0 4px 18px rgba(80, 90, 255, 0.12);
        }

        .answer-card.live::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 2px;
            border-radius: 2px;
            background: linear-gradient(90deg, transparent, #7c5cff, #5b6cff, transparent);
            background-size: 200% 100%;
            animation: shimmer 1.2s linear infinite;
        }

        @keyframes shimmer {
            from { background-position: 200% 0; }
            to { background-position: -200% 0; }
        }

        .answer-card.working {
            opacity: 0.6;
        }

        .answer-card.system {
            border-left-color: var(--border-strong);
            color: var(--text-secondary, var(--text-primary));
        }

        .answer-body > :first-child { margin-top: 0.5em; }
        .answer-body > :last-child { margin-bottom: 0.3em; }

        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
            padding-top: 8px;
            border-top: 1px dashed var(--border);
        }

        .chip {
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: var(--text-secondary, var(--text-primary));
            font-size: 11px;
            font-family: var(--font);
            padding: 3px 10px;
            border-radius: 100px;
            cursor: pointer;
            transition: transform 0.12s ease, border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
        }

        .chip:hover:not(:disabled) {
            border-color: #7c5cff;
            color: var(--text-primary);
            background: var(--bg-surface);
            transform: translateY(-1px);
        }

        .chip:disabled {
            opacity: 0.4;
            cursor: default;
        }

        .chip.done {
            border-color: #34c759;
            color: #34c759;
        }

        .rework-error {
            font-size: 11px;
            color: var(--danger, #ef4444);
            margin-top: 4px;
        }

        .listening {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            height: 100%;
            color: var(--text-muted);
            font-size: 0.95em;
            text-align: center;
        }

        .orb {
            width: 46px;
            height: 46px;
            border-radius: 50%;
            background: radial-gradient(circle at 35% 30%, #a99bff, #7c5cff 60%, #4b3fd1);
            animation: orb 2.4s ease-in-out infinite;
        }

        @keyframes orb {
            0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(124, 92, 255, 0.5); }
            50% { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(124, 92, 255, 0); }
        }

        /* ── Response navigation strip ── */

        .response-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-md);
            border-top: 1px solid var(--border);
            background: var(--bg-app);
        }

        .nav-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: var(--space-xs);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color var(--transition);
        }

        .nav-btn:hover:not(:disabled) {
            color: var(--text-primary);
        }

        .nav-btn:disabled {
            opacity: 0.25;
            cursor: default;
        }

        .nav-btn svg {
            width: 14px;
            height: 14px;
        }

        .response-counter {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-family: var(--font-mono);
            min-width: 40px;
            text-align: center;
        }

        /* ── Bottom input bar ── */

        .input-bar {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-md);
            background: var(--bg-app);
        }

        .input-bar-inner {
            display: flex;
            align-items: center;
            flex: 1;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 100px;
            padding: 0 var(--space-md);
            height: 32px;
            transition: border-color var(--transition);
        }

        .input-bar-inner:focus-within {
            border-color: var(--accent);
        }

        .input-bar-inner input {
            flex: 1;
            background: none;
            color: var(--text-primary);
            border: none;
            padding: 0;
            font-size: var(--font-size-sm);
            font-family: var(--font);
            height: 100%;
            outline: none;
        }

        .input-bar-inner input::placeholder {
            color: var(--text-muted);
        }

        .analyze-btn {
            position: relative;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: var(--text-primary);
            cursor: pointer;
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
            white-space: nowrap;
            padding: var(--space-xs) var(--space-md);
            border-radius: 100px;
            height: 32px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: border-color 0.4s ease, background var(--transition);
            flex-shrink: 0;
            overflow: hidden;
        }

        .analyze-btn:hover:not(.analyzing) {
            border-color: var(--accent);
            background: var(--bg-surface);
        }

        .analyze-btn.analyzing {
            cursor: default;
            border-color: transparent;
        }

        .analyze-btn-content {
            display: flex;
            align-items: center;
            gap: 4px;
            transition: opacity 0.4s ease;
            z-index: 1;
            position: relative;
        }

        .analyze-btn.analyzing .analyze-btn-content {
            opacity: 0;
        }

        .analyze-canvas {
            position: absolute;
            inset: -1px;
            width: calc(100% + 2px);
            height: calc(100% + 2px);
            pointer-events: none;
        }
    `;

    static properties = {
        responses: { type: Array },
        questions: { type: Array },
        currentResponseIndex: { type: Number },
        selectedProfile: { type: String },
        onSendText: { type: Function },
        shouldAnimateResponse: { type: Boolean },
        isAnalyzing: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.responses = [];
        this.questions = [];
        this._busy = new Map(); // answer index -> request id while a rewrite is running
        this._undo = new Map(); // answer index -> text before the last rewrite
        this._errors = new Map();
        this._copied = -1;
        this._markdownCache = new Map();
        this._lastChunkAt = 0;
        this.currentResponseIndex = -1;
        this.selectedProfile = 'interview';
        this.onSendText = () => {};
        this.isAnalyzing = false;
        this._animFrame = null;
    }

    getProfileNames() {
        return {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
    }

    getCurrentResponse() {
        const profileNames = this.getProfileNames();
        return this.responses.length > 0 && this.currentResponseIndex >= 0
            ? this.responses[this.currentResponseIndex]
            : `Listening to your ${profileNames[this.selectedProfile] || 'session'}...`;
    }

    renderMarkdown(content) {
        if (typeof window !== 'undefined' && window.marked) {
            try {
                window.marked.setOptions({
                    breaks: true,
                    gfm: true,
                    sanitize: false,
                });
                let rendered = window.marked.parse(content);
                rendered = this.wrapWordsInSpans(rendered);
                return rendered;
            } catch (error) {
                console.warn('Error parsing markdown:', error);
                return content;
            }
        }
        return content;
    }

    wrapWordsInSpans(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tagsToSkip = ['PRE'];

        function wrap(node) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && !tagsToSkip.includes(node.parentNode.tagName)) {
                const words = node.textContent.split(/(\s+)/);
                const frag = document.createDocumentFragment();
                words.forEach(word => {
                    if (word.trim()) {
                        const span = document.createElement('span');
                        span.setAttribute('data-word', '');
                        span.textContent = word;
                        frag.appendChild(span);
                    } else {
                        frag.appendChild(document.createTextNode(word));
                    }
                });
                node.parentNode.replaceChild(frag, node);
            } else if (node.nodeType === Node.ELEMENT_NODE && !tagsToSkip.includes(node.tagName)) {
                Array.from(node.childNodes).forEach(wrap);
            }
        }
        Array.from(doc.body.childNodes).forEach(wrap);
        return doc.body.innerHTML;
    }

    _scrollToTurn(index) {
        const turn = this.shadowRoot.querySelector(`[data-turn="${index}"]`);
        if (turn) turn.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    navigateToPreviousResponse() {
        if (this.currentResponseIndex > 0) {
            this.currentResponseIndex--;
            this._scrollToTurn(this.currentResponseIndex);
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    navigateToNextResponse() {
        if (this.currentResponseIndex < this.responses.length - 1) {
            this.currentResponseIndex++;
            this._scrollToTurn(this.currentResponseIndex);
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    scrollResponseUp() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
        }
    }

    scrollResponseDown() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + scrollAmount);
        }
    }

    connectedCallback() {
        super.connectedCallback();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');

            this.handlePreviousResponse = () => this.navigateToPreviousResponse();
            this.handleNextResponse = () => this.navigateToNextResponse();
            this.handleScrollUp = () => this.scrollResponseUp();
            this.handleScrollDown = () => this.scrollResponseDown();

            ipcRenderer.on('navigate-previous-response', this.handlePreviousResponse);
            ipcRenderer.on('navigate-next-response', this.handleNextResponse);
            ipcRenderer.on('scroll-response-up', this.handleScrollUp);
            ipcRenderer.on('scroll-response-down', this.handleScrollDown);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopWaveformAnimation();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (this.handlePreviousResponse) ipcRenderer.removeListener('navigate-previous-response', this.handlePreviousResponse);
            if (this.handleNextResponse) ipcRenderer.removeListener('navigate-next-response', this.handleNextResponse);
            if (this.handleScrollUp) ipcRenderer.removeListener('scroll-response-up', this.handleScrollUp);
            if (this.handleScrollDown) ipcRenderer.removeListener('scroll-response-down', this.handleScrollDown);
        }
    }

    async handleSendText() {
        const textInput = this.shadowRoot.querySelector('#textInput');
        if (textInput && textInput.value.trim()) {
            const message = textInput.value.trim();
            textInput.value = '';
            await this.onSendText(message);
        }
    }

    handleTextKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    async handleScreenAnswer() {
        if (this.isAnalyzing) return;
        if (window.captureManualScreenshot) {
            this.isAnalyzing = true;
            this._responseCountWhenStarted = this.responses.length;
            window.captureManualScreenshot();
        }
    }

    _startWaveformAnimation() {
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const dangerColor = getComputedStyle(this).getPropertyValue('--danger').trim() || '#EF4444';
        const startTime = performance.now();
        const FADE_IN = 0.5; // seconds
        const PARTICLE_SPREAD = 4; // px inward from border
        const PARTICLE_COUNT = 250;

        // Pill perimeter helpers
        const w = rect.width;
        const h = rect.height;
        const r = h / 2; // pill radius = half height
        const straightLen = w - 2 * r;
        const arcLen = Math.PI * r;
        const perimeter = 2 * straightLen + 2 * arcLen;

        // Given a distance along the perimeter, return {x, y, nx, ny} (position + inward normal)
        const pointOnPerimeter = (d) => {
            d = ((d % perimeter) + perimeter) % perimeter;
            // Top straight: left to right
            if (d < straightLen) {
                return { x: r + d, y: 0, nx: 0, ny: 1 };
            }
            d -= straightLen;
            // Right arc
            if (d < arcLen) {
                const angle = -Math.PI / 2 + (d / arcLen) * Math.PI;
                return {
                    x: w - r + Math.cos(angle) * r,
                    y: r + Math.sin(angle) * r,
                    nx: -Math.cos(angle),
                    ny: -Math.sin(angle),
                };
            }
            d -= arcLen;
            // Bottom straight: right to left
            if (d < straightLen) {
                return { x: w - r - d, y: h, nx: 0, ny: -1 };
            }
            d -= straightLen;
            // Left arc
            const angle = Math.PI / 2 + (d / arcLen) * Math.PI;
            return {
                x: r + Math.cos(angle) * r,
                y: r + Math.sin(angle) * r,
                nx: -Math.cos(angle),
                ny: -Math.sin(angle),
            };
        };

        // Pre-seed random offsets for stable particles
        const seeds = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            seeds.push({ pos: Math.random(), drift: Math.random(), depthSeed: Math.random() });
        }

        const draw = (now) => {
            const elapsed = (now - startTime) / 1000;
            const fade = Math.min(1, elapsed / FADE_IN);

            ctx.clearRect(0, 0, w, h);

            // ── Particle border ──
            ctx.fillStyle = dangerColor;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const s = seeds[i];
                const along = (s.pos + s.drift * elapsed * 0.03) * perimeter;
                const depth = s.depthSeed * PARTICLE_SPREAD;
                const density = 1 - depth / PARTICLE_SPREAD;

                if (Math.random() > density) continue;

                const p = pointOnPerimeter(along);
                const px = p.x + p.nx * depth;
                const py = p.y + p.ny * depth;
                const size = 0.8 + density * 0.6;

                ctx.globalAlpha = fade * density * 0.85;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // ── Waveform ──
            const midY = h / 2;
            const waves = [
                { freq: 3, amp: 0.35, speed: 2.5, opacity: 0.9, width: 1.8 },
                { freq: 5, amp: 0.2, speed: 3.5, opacity: 0.5, width: 1.2 },
                { freq: 7, amp: 0.12, speed: 5, opacity: 0.3, width: 0.8 },
            ];

            for (const wave of waves) {
                ctx.beginPath();
                ctx.strokeStyle = dangerColor;
                ctx.globalAlpha = wave.opacity * fade;
                ctx.lineWidth = wave.width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                for (let x = 0; x <= w; x++) {
                    const norm = x / w;
                    const envelope = Math.sin(norm * Math.PI);
                    const y = midY + Math.sin(norm * Math.PI * 2 * wave.freq + elapsed * wave.speed) * (midY * wave.amp) * envelope;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
            this._animFrame = requestAnimationFrame(draw);
        };

        this._animFrame = requestAnimationFrame(draw);
    }

    _stopWaveformAnimation() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.response-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    firstUpdated() {
        super.firstUpdated();
        this.dispatchEvent(new CustomEvent('response-animation-complete', { bubbles: true, composed: true }));
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('responses')) {
            this._lastChunkAt = Date.now();
            clearTimeout(this._liveTimer);
            this._liveTimer = setTimeout(() => this.requestUpdate(), 1300); // stop the "writing" shimmer
            // Keep the newest answer in view while it is being written
            const container = this.shadowRoot.querySelector('#responseContainer');
            const wasLatest = this.currentResponseIndex >= this.responses.length - 2;
            if (container && wasLatest) container.scrollTop = container.scrollHeight;
            if (this.shouldAnimateResponse) {
                this.dispatchEvent(new CustomEvent('response-animation-complete', { bubbles: true, composed: true }));
            }
        }

        if (changedProperties.has('isAnalyzing')) {
            if (this.isAnalyzing) {
                this._startWaveformAnimation();
            } else {
                this._stopWaveformAnimation();
            }
        }

        if (changedProperties.has('responses') && this.isAnalyzing) {
            if (this.responses.length > this._responseCountWhenStarted) {
                this.isAnalyzing = false;
            }
        }
    }

    async _rework(index, mode) {
        const question = this.questions[index];
        const answer = this.responses[index];
        if (!question || this._busy.has(index) || !window.require) return;
        const { ipcRenderer } = window.require('electron');
        const requestId = `${Date.now()}-${index}`;
        this._busy.set(index, requestId);
        this._errors.delete(index);
        const before = answer;
        let started = false;
        const onUpdate = (_, data) => {
            if (data.requestId !== requestId) return;
            if (data.error) {
                this._errors.set(index, `Could not do that: ${data.error}`);
            } else if (data.text) {
                if (!started) {
                    started = true;
                    this._undo.set(index, before);
                }
                this.dispatchEvent(new CustomEvent('response-rewritten', { detail: { index, text: data.text } }));
            }
            if (data.done) {
                this._busy.delete(index);
                ipcRenderer.removeListener('rework-update', onUpdate);
            }
            this.requestUpdate();
        };
        ipcRenderer.on('rework-update', onUpdate);
        this.requestUpdate();
        await ipcRenderer.invoke('rework-answer', { question, answer, mode, requestId });
    }

    _undoRework(index) {
        const previous = this._undo.get(index);
        if (previous === undefined) return;
        this._undo.delete(index);
        this.dispatchEvent(new CustomEvent('response-rewritten', { detail: { index, text: previous } }));
        this.requestUpdate();
    }

    async _copy(index) {
        try {
            await navigator.clipboard.writeText(this.responses[index]);
            this._copied = index;
            this.requestUpdate();
            setTimeout(() => {
                this._copied = -1;
                this.requestUpdate();
            }, 1200);
        } catch (e) {
            console.warn('Copy failed:', e);
        }
    }

    _markdown(text) {
        let cached = this._markdownCache.get(text);
        if (cached === undefined) {
            cached = this.renderMarkdown(text);
            if (this._markdownCache.size > 200) this._markdownCache.clear();
            this._markdownCache.set(text, cached);
        }
        return cached;
    }

    _renderTurn(response, index) {
        const question = this.questions[index] || '';
        const isLatest = index === this.responses.length - 1;
        const busy = this._busy.has(index);
        const isLive = isLatest && Date.now() - this._lastChunkAt < 1200;
        const isScreen = question.startsWith('📷');
        const canRework = Boolean(question) && !busy;
        const actions = [
            ['regenerate', '↻ Regenerate', isScreen],
            ['longer', '＋ Longer', false],
            ['shorter', '− Shorter', false],
            ['simpler', '✦ Simpler', false],
            ['example', '💡 Add example', false],
        ];

        return html`
            <div class="turn" data-turn=${index}>
                ${question
                    ? html`<div class="question-label">${isScreen ? 'Screen' : 'Question'}</div>
                          <div class="question">${question}</div>`
                    : ''}
                <div class="answer-card ${isLatest ? 'latest' : ''} ${isLive || busy ? 'live' : ''} ${busy ? 'working' : ''} ${question ? '' : 'system'}">
                    <div class="answer-body" .innerHTML=${this._markdown(response)}></div>
                    ${question
                        ? html`<div class="actions">
                              ${actions
                                  .filter(([, , hidden]) => !hidden)
                                  .map(([mode, label]) => html`<button class="chip" ?disabled=${!canRework} @click=${() => this._rework(index, mode)}>${label}</button>`)}
                              ${this._undo.has(index) && !busy ? html`<button class="chip" @click=${() => this._undoRework(index)}>↩ Previous version</button>` : ''}
                              <button class="chip ${this._copied === index ? 'done' : ''}" @click=${() => this._copy(index)}>${this._copied === index ? '✓ Copied' : '⧉ Copy'}</button>
                          </div>`
                        : ''}
                    ${this._errors.has(index) ? html`<div class="rework-error">${this._errors.get(index)}</div>` : ''}
                </div>
            </div>
        `;
    }

    render() {
        const profileNames = this.getProfileNames();

        return html`
            <div class="response-container" id="responseContainer">
                ${this.responses.length === 0
                    ? html`<div class="listening">
                          <div class="orb"></div>
                          <div>Listening to your ${profileNames[this.selectedProfile] || 'session'}...<br /><span style="font-size: 0.85em">Questions and answers will appear here</span></div>
                      </div>`
                    : this.responses.map((response, index) => this._renderTurn(response, index))}
            </div>

            <div class="input-bar">
                <div class="input-bar-inner">
                    <input
                        type="text"
                        id="textInput"
                        placeholder="Type a message..."
                        @keydown=${this.handleTextKeydown}
                    />
                </div>
                <button class="analyze-btn ${this.isAnalyzing ? 'analyzing' : ''}" @click=${this.handleScreenAnswer}>
                    <canvas class="analyze-canvas"></canvas>
                    <span class="analyze-btn-content">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 3v7h6l-8 11v-7H5z" />
                        </svg>
                        Analyze Screen
                    </span>
                </button>
            </div>
        `;
    }
}

customElements.define('assistant-view', AssistantView);

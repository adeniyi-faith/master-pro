import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

const samples = () => window.require('./utils/previewSamples');

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Turns the small subset of markdown used by the samples (bold, bullets, paragraphs) into safe HTML.
function sampleToHtml(markdown) {
    return markdown
        .split(/\n\n+/)
        .map(block => {
            const lines = block.split('\n');
            const inline = s => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (lines.every(l => l.startsWith('- '))) return `<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
            if (lines.some(l => l.startsWith('- '))) {
                const lead = lines.filter(l => !l.startsWith('- ')).map(inline).join(' ');
                return `<p>${lead}</p><ul>${lines.filter(l => l.startsWith('- ')).map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
            }
            return `<p>${inline(lines.join(' '))}</p>`;
        })
        .join('');
}

// A small copy of the live answer window that changes as the user changes their settings.
export class SetupPreview extends LitElement {
    static properties = {
        profile: { type: String },
        tone: { type: String },
        customTone: { type: String },
        format: { type: String },
        star: { type: Boolean },
    };

    static styles = css`
        :host {
            display: block;
        }
        .frame {
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--bg-app, #0f0f12);
            overflow: hidden;
        }
        .bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
            font-size: 12px;
            color: var(--text-secondary, var(--text-primary));
        }
        .bar .live {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #34d399;
        }
        .feed {
            padding: 12px 14px 6px;
        }
        .question-label {
            text-align: right;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--text-muted);
            margin-bottom: 4px;
        }
        .question {
            margin-left: auto;
            max-width: 85%;
            width: fit-content;
            background: linear-gradient(135deg, #5b6cff, #8b5cf6);
            color: #fff;
            padding: 8px 14px;
            border-radius: 16px 16px 4px 16px;
            font-size: 0.9em;
            line-height: 1.4;
            box-shadow: 0 2px 10px rgba(80, 90, 255, 0.25);
        }
        .answer-card {
            margin-top: 10px;
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-left: 3px solid #7c5cff;
            border-radius: 4px 14px 14px 14px;
            padding: 4px 14px 8px;
            box-shadow: 0 0 0 1px rgba(124, 92, 255, 0.25), 0 4px 18px rgba(80, 90, 255, 0.12);
            font-size: 0.92em;
            line-height: 1.55;
            color: var(--text-primary);
        }
        .answer-card p {
            margin: 0.6em 0;
        }
        .answer-card ul {
            margin: 0.6em 0;
            padding-left: 1.2em;
        }
        .answer-card li {
            margin: 0.25em 0;
        }
        .note {
            padding: 8px 14px 12px;
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.5;
        }
    `;

    constructor() {
        super();
        this.profile = 'interview';
        this.tone = 'default';
        this.customTone = '';
        this.format = 'default';
        this.star = false;
    }

    render() {
        const { buildPreviewAnswer, getPreviewQuestion, getPreviewMeta } = samples();
        const meta = getPreviewMeta(this.profile);
        const answer = buildPreviewAnswer({ profile: this.profile, tone: this.tone, format: this.format, star: this.star });
        const starIgnored = this.star && !meta.hasStar;
        return html`
            <div class="frame">
                <div class="bar">
                    <span class="live"><span class="dot"></span>Listening · ${meta.label}</span>
                    <span>Preview</span>
                </div>
                <div class="feed">
                    <div class="question-label">${meta.heardLabel} asked</div>
                    <div class="question">${getPreviewQuestion(this.profile)}</div>
                    <div class="answer-card" .innerHTML=${sampleToHtml(answer)}></div>
                </div>
                <div class="note">
                    This is a sample written by hand to show the layout and length. Your real answers use your documents and your words, so the content will differ.
                    ${this.tone === 'custom' ? 'A custom tone cannot be shown here; the sample uses the default wording.' : ''}
                    ${starIgnored ? 'STAR only applies to questions about past experience, so this sample is unchanged.' : ''}
                </div>
            </div>
        `;
    }
}

customElements.define('setup-preview', SetupPreview);

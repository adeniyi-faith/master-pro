import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

// Shows what went wrong inside the app (AI errors, audio problems, crashes) so it can be read or copied
export class ErrorLogView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .toolbar {
                display: flex;
                gap: var(--space-sm);
                flex-wrap: wrap;
                margin-bottom: var(--space-md);
            }

            .entry {
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
                padding: 8px 10px;
                margin-bottom: var(--space-sm);
            }

            .entry-head {
                display: flex;
                gap: 8px;
                align-items: baseline;
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
            }

            .entry-source {
                border: 1px solid var(--border);
                border-radius: 999px;
                padding: 0 6px;
            }

            .entry-message {
                margin-top: 4px;
                font-size: var(--font-size-sm);
                color: var(--text-primary);
                white-space: pre-wrap;
                word-break: break-word;
                user-select: text;
            }

            .entry-detail {
                margin-top: 6px;
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                white-space: pre-wrap;
                word-break: break-word;
                user-select: text;
            }

            .empty {
                padding: var(--space-lg) 0;
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
            }
        `,
    ];

    static properties = {
        entries: { state: true },
        copied: { state: true },
    };

    constructor() {
        super();
        this.entries = [];
        this.copied = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this.refresh();
    }

    get _ipc() {
        return window.require('electron').ipcRenderer;
    }

    async refresh() {
        try {
            this.entries = await this._ipc.invoke('error-log:get');
        } catch (error) {
            this.entries = [];
        }
    }

    async clear() {
        await this._ipc.invoke('error-log:clear');
        this.entries = [];
    }

    _asText() {
        return this.entries
            .map(e => `[${new Date(e.time).toLocaleString()}] [${e.source}] ${e.message}${e.detail ? '\n' + e.detail : ''}`)
            .join('\n\n');
    }

    async copyAll() {
        try {
            await navigator.clipboard.writeText(this._asText());
            this.copied = true;
            setTimeout(() => (this.copied = false), 1500);
        } catch (error) {
            // clipboard blocked: the text on screen can still be selected by hand
        }
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Error log</div>
                    <div class="page-subtitle">Newest first. If something goes wrong, copy this and send it over so the cause can be found.</div>

                    <div class="toolbar">
                        <button class="control" @click=${() => this.refresh()}>Refresh</button>
                        <button class="control" ?disabled=${this.entries.length === 0} @click=${() => this.copyAll()}>
                            ${this.copied ? 'Copied' : 'Copy all'}
                        </button>
                        <button class="control" ?disabled=${this.entries.length === 0} @click=${() => this.clear()}>Clear</button>
                    </div>

                    ${this.entries.length === 0
                        ? html`<div class="empty">No errors recorded since the app started.</div>`
                        : this.entries.map(
                              e => html`
                                  <div class="entry">
                                      <div class="entry-head">
                                          <span>${new Date(e.time).toLocaleTimeString()}</span>
                                          <span class="entry-source">${e.source}</span>
                                      </div>
                                      <div class="entry-message">${e.message}</div>
                                      ${e.detail ? html`<div class="entry-detail">${e.detail}</div>` : ''}
                                  </div>
                              `
                          )}
                </div>
            </div>
        `;
    }
}

customElements.define('error-log-view', ErrorLogView);

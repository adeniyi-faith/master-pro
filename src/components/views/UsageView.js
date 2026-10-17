import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

const KIND_LABELS = {
    answer: 'Answers',
    rewrite: 'Rewrite buttons',
    notes: 'Session notes',
    screenshot: 'Screenshots',
    live: 'Live listening',
    practice: 'Practice mode',
};

// Shows every Gemini call the app has made, the tokens used and an estimated cost
export class UsageView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .cards {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: var(--space-sm);
                margin-bottom: var(--space-md);
            }

            .card {
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
                padding: 10px 12px;
            }

            .card-label {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
            }

            .card-cost {
                font-size: 22px;
                font-weight: 700;
                color: var(--text-primary);
                margin: 2px 0;
            }

            .card-sub {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                line-height: 1.5;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                font-size: var(--font-size-xs);
            }

            th,
            td {
                text-align: left;
                padding: 5px 6px;
                border-bottom: 1px solid var(--border);
                color: var(--text-secondary);
            }

            th {
                color: var(--text-primary);
                font-weight: 600;
            }

            td.num,
            th.num {
                text-align: right;
                font-variant-numeric: tabular-nums;
            }

            td.name {
                color: var(--text-primary);
            }

            .note {
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                line-height: 1.5;
            }

            .toolbar {
                display: flex;
                gap: var(--space-sm);
                flex-wrap: wrap;
                margin-bottom: var(--space-md);
            }

            .empty {
                padding: var(--space-md) 0;
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
            }

            @media (max-width: 720px) {
                .cards {
                    grid-template-columns: 1fr;
                }
            }
        `,
    ];

    static properties = {
        report: { state: true },
        onExternalLinkClick: { type: Function },
    };

    constructor() {
        super();
        this.report = null;
        this.onExternalLinkClick = () => {};
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
            this.report = await this._ipc.invoke('usage:get');
        } catch (error) {
            this.report = null;
        }
    }

    async clear() {
        if (!window.confirm('Clear the saved usage record? This cannot be undone.')) return;
        await this._ipc.invoke('usage:clear');
        await this.refresh();
    }

    _cost(value) {
        if (!value) return '$0.00';
        return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
    }

    _tokens(count) {
        if (count >= 1e6) return `${(count / 1e6).toFixed(2)}M`;
        if (count >= 1e3) return `${(count / 1e3).toFixed(1)}k`;
        return String(count || 0);
    }

    _card(label, total) {
        return html`
            <div class="card">
                <div class="card-label">${label}</div>
                <div class="card-cost">${this._cost(total.cost)}</div>
                <div class="card-sub">
                    ${total.calls} call${total.calls === 1 ? '' : 's'}<br />
                    ${this._tokens(total.inTokens)} in · ${this._tokens(total.outTokens)} out
                    ${total.unpricedCalls ? html`<br />${total.unpricedCalls} call(s) with no known price` : ''}
                </div>
            </div>
        `;
    }

    _table(title, rows, labelOf) {
        const entries = Object.entries(rows || {}).sort((a, b) => b[1].cost - a[1].cost);
        if (entries.length === 0) return '';
        return html`
            <section class="surface">
                <div class="surface-title">${title}</div>
                <table>
                    <tr>
                        <th>${title === 'By model' ? 'Model' : 'Used for'}</th>
                        <th class="num">Calls</th>
                        <th class="num">Tokens in</th>
                        <th class="num">Tokens out</th>
                        <th class="num">Est. cost</th>
                    </tr>
                    ${entries.map(
                        ([key, t]) => html`
                            <tr>
                                <td class="name">${labelOf(key)}</td>
                                <td class="num">${t.calls}</td>
                                <td class="num">${this._tokens(t.inTokens)}</td>
                                <td class="num">${this._tokens(t.outTokens)}</td>
                                <td class="num">${t.unpricedCalls === t.calls ? 'n/a' : this._cost(t.cost)}</td>
                            </tr>
                        `
                    )}
                </table>
            </section>
        `;
    }

    render() {
        const r = this.report;
        const hasData = r && r.totals.all.calls > 0;
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Usage</div>
                    <div class="page-subtitle">Gemini calls made by this app, with an estimated cost. Counting starts from the day you install this version.</div>

                    <div class="toolbar">
                        <button class="control" @click=${() => this.refresh()}>Refresh</button>
                        <button class="control" @click=${() => this.onExternalLinkClick('https://aistudio.google.com/usage')}>Open Google's usage page</button>
                        <button class="control" ?disabled=${!hasData} @click=${() => this.clear()}>Clear record</button>
                    </div>

                    ${!hasData
                        ? html`<div class="empty">No Gemini calls recorded yet. Ask a question and come back.</div>`
                        : html`
                              <div class="cards">
                                  ${this._card('Today', r.totals.today)} ${this._card('This month', r.totals.month)} ${this._card('All recorded', r.totals.all)}
                              </div>

                              ${this._table('Used for', r.byKind, k => ({ ...KIND_LABELS })[k] || k)}
                              ${this._table('By model', r.byModel, m => m)}

                              <section class="surface">
                                  <div class="surface-title">Recent calls</div>
                                  <table>
                                      <tr>
                                          <th>When</th>
                                          <th>Used for</th>
                                          <th>Model</th>
                                          <th class="num">In</th>
                                          <th class="num">Out</th>
                                          <th class="num">Est. cost</th>
                                      </tr>
                                      ${r.recent.map(
                                          e => html`
                                              <tr>
                                                  <td>${new Date(e.time).toLocaleString()}</td>
                                                  <td class="name">${KIND_LABELS[e.kind] || e.kind}</td>
                                                  <td>${e.model}</td>
                                                  <td class="num">${this._tokens(e.inTokens)}</td>
                                                  <td class="num">${this._tokens(e.outTokens)}</td>
                                                  <td class="num">${typeof e.cost === 'number' ? this._cost(e.cost) : 'n/a'}</td>
                                              </tr>
                                          `
                                      )}
                                  </table>
                              </section>
                          `}

                    <div class="note">
                        These numbers are an estimate: tokens come from Google's replies and prices from Google's public price list (checked 2026-10-15).
                        It does not include Google Search charges, free-tier credits or discounts, and the live listening cost may be undercounted because
                        Google only reports it when the listening model replies. Your real bill is in Google AI Studio or Google Cloud Billing.
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('usage-view', UsageView);

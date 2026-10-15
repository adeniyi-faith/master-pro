import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

// Chooses which saved session is active, and (unless "compact") creates, copies, renames and deletes them.
// Each saved session has its own company, documents, answer bank and answer style.
export class SessionPicker extends LitElement {
    static styles = css`
        :host {
            display: block;
            font-family: var(--font);
        }
        .row {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            flex-wrap: wrap;
        }
        select,
        input {
            background: var(--bg-elevated);
            color: var(--text-primary);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 8px 10px;
            font-size: var(--font-size-sm);
            font-family: inherit;
            min-width: 180px;
        }
        select:focus,
        input:focus {
            outline: none;
            border-color: var(--border-strong);
        }
        button {
            background: var(--bg-elevated);
            color: var(--text-primary);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 7px 12px;
            font-size: var(--font-size-sm);
            font-family: inherit;
            cursor: pointer;
        }
        button:hover {
            border-color: var(--border-strong);
        }
        button.danger {
            color: var(--danger);
        }
        .hint {
            color: var(--text-secondary);
            font-size: var(--font-size-xs);
            margin-top: 6px;
        }
        .error {
            color: var(--danger);
            font-size: var(--font-size-xs);
            margin-top: 6px;
        }
    `;

    static properties = {
        compact: { type: Boolean },
        _setups: { state: true },
        _activeId: { state: true },
        _mode: { state: true },
        _name: { state: true },
        _error: { state: true },
    };

    constructor() {
        super();
        this.compact = false;
        this._setups = [];
        this._activeId = '';
        this._mode = '';
        this._name = '';
        this._error = '';
        this._reload = () => this._load();
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('setup-changed', this._reload);
        this._load();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('setup-changed', this._reload);
    }

    async _load() {
        try {
            const { activeId, setups } = await cheatingDaddy.storage.listSetups();
            this._setups = setups;
            this._activeId = activeId;
        } catch (error) {
            console.error('Error loading saved sessions:', error);
        }
    }

    get _active() {
        return this._setups.find(setup => setup.id === this._activeId);
    }

    _startMode(mode) {
        this._mode = mode;
        this._error = '';
        if (mode === 'rename') this._name = this._active?.name || '';
        else if (mode === 'new') this._name = '';
        else if (mode === 'copy') this._name = `${this._active?.name || 'Session'} copy`;
    }

    _cancel() {
        this._mode = '';
        this._error = '';
    }

    async _confirm() {
        const name = this._name.trim();
        if (this._mode !== 'delete' && !name) {
            this._error = 'Type a name first.';
            return;
        }
        if (this._mode === 'new') await cheatingDaddy.storage.createSetup(name);
        else if (this._mode === 'copy') await cheatingDaddy.storage.createSetup(name, this._activeId);
        else if (this._mode === 'rename') await cheatingDaddy.storage.renameSetup(this._activeId, name);
        else if (this._mode === 'delete') await cheatingDaddy.storage.deleteSetup(this._activeId);
        this._cancel();
    }

    async _switch(id) {
        await cheatingDaddy.storage.activateSetup(id);
    }

    _renderForm() {
        if (this._mode === 'delete') {
            return html`
                <div class="row" style="margin-top: 8px;">
                    <span>Delete "${this._active?.name}" with its documents and answer bank?</span>
                    <button class="danger" @click=${() => this._confirm()}>Delete</button>
                    <button @click=${() => this._cancel()}>Cancel</button>
                </div>
            `;
        }
        const labels = { new: 'Create', copy: 'Copy', rename: 'Rename' };
        return html`
            <div class="row" style="margin-top: 8px;">
                <input
                    type="text"
                    maxlength="60"
                    placeholder="Session name, e.g. Google PM interview"
                    .value=${this._name}
                    @input=${e => { this._name = e.target.value; }}
                    @keydown=${e => { if (e.key === 'Enter') this._confirm(); }}
                />
                <button @click=${() => this._confirm()}>${labels[this._mode]}</button>
                <button @click=${() => this._cancel()}>Cancel</button>
            </div>
            ${this._error ? html`<div class="error">${this._error}</div>` : ''}
        `;
    }

    render() {
        return html`
            <div class="row">
                <select @change=${e => this._switch(e.target.value)} aria-label="Saved session">
                    ${this._setups.map(setup => html`<option value=${setup.id} ?selected=${setup.id === this._activeId}>${setup.name}</option>`)}
                </select>
                ${this.compact
                    ? ''
                    : html`
                          <button @click=${() => this._startMode('new')}>New</button>
                          <button @click=${() => this._startMode('copy')}>Copy</button>
                          <button @click=${() => this._startMode('rename')}>Rename</button>
                          <button class="danger" ?disabled=${this._setups.length <= 1} @click=${() => this._startMode('delete')}>Delete</button>
                      `}
            </div>
            ${this._mode ? this._renderForm() : ''}
        `;
    }
}

customElements.define('session-picker', SessionPicker);

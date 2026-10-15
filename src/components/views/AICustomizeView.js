import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

const questionTypes = () => window.require('./utils/questionTypes');

export class AICustomizeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .unified-page {
                height: 100%;
            }
            .unified-wrap {
                height: 100%;
            }
            textarea.control {
                min-height: 140px;
                overflow-y: auto;
            }
            .doc-actions {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                flex-wrap: wrap;
            }
            .doc-button {
                background: var(--bg-elevated);
                color: var(--text-primary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 8px 14px;
                font-size: var(--font-size-sm);
                cursor: pointer;
            }
            .doc-button:hover {
                border-color: var(--border-strong);
            }
            .doc-button.small {
                padding: 4px 10px;
                font-size: var(--font-size-xs);
            }
            .type-card {
                display: flex;
                flex-direction: column;
                gap: 6px;
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 10px 12px;
            }
            .type-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-md);
            }
            .type-name {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-semibold);
            }
            .type-hint {
                color: var(--text-muted);
                font-size: var(--font-size-xs);
                margin-left: 8px;
                font-weight: normal;
            }
            .type-card textarea.control {
                min-height: 90px;
            }
            .drop-zone {
                border: 1px dashed var(--border-strong);
                border-radius: var(--radius-md);
                padding: var(--space-md);
                text-align: center;
                color: var(--text-muted);
                font-size: var(--font-size-sm);
            }
            .drop-zone.over {
                border-color: var(--accent);
                color: var(--text-primary);
            }
            .doc-list {
                display: flex;
                flex-direction: column;
                gap: var(--space-xs, 6px);
            }
            .doc-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-md);
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 8px 12px;
                font-size: var(--font-size-sm);
                color: var(--text-primary);
            }
            .doc-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .doc-meta {
                color: var(--text-muted);
                font-size: var(--font-size-xs);
                white-space: nowrap;
            }
            .doc-row-end {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                flex-shrink: 0;
            }
        `,
    ];

    static properties = {
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        _context: { state: true },
        _prefs: { state: true },
        _autoType: { state: true },
        _typeEdits: { state: true },
        _documents: { state: true },
        _message: { state: true },
        _dragOver: { state: true },
    };

    constructor() {
        super();
        this.selectedProfile = 'interview';
        this.onProfileChange = () => {};
        this._context = '';
        this._prefs = { company: '', jobDescription: '', answerTone: 'default', answerFormat: 'default', useStarMethod: false };
        this._autoType = true;
        this._typeEdits = {};
        this._documents = [];
        this._message = '';
        this._dragOver = false;
        this._loadFromStorage();
        this._loadDocuments();
    }

    async _loadFromStorage() {
        try {
            const prefs = await cheatingDaddy.storage.getPreferences();
            this._context = prefs.customPrompt || '';
            this._autoType = prefs.autoQuestionType !== false;
            this._typeEdits = prefs.questionTypePrompts || {};
            this._prefs = {
                company: prefs.company || '',
                jobDescription: prefs.jobDescription || '',
                answerTone: prefs.answerTone || 'default',
                answerFormat: prefs.answerFormat || 'default',
                useStarMethod: prefs.useStarMethod === true,
            };
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading AI customize storage:', error);
        }
    }

    get _ipc() {
        return window.require('electron').ipcRenderer;
    }

    async _loadDocuments() {
        try {
            this._documents = await this._ipc.invoke('documents:list');
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    }

    _showResults(results) {
        const failed = results.filter(r => !r.success);
        const added = results.length - failed.length;
        const parts = [];
        if (added) parts.push(`Added ${added} document${added === 1 ? '' : 's'}.`);
        failed.forEach(r => parts.push(`${r.name}: ${r.error}`));
        this._message = parts.join(' ');
    }

    async _pickDocuments() {
        const results = await this._ipc.invoke('documents:pick');
        if (results.length) this._showResults(results);
        await this._loadDocuments();
    }

    async _dropDocuments(e) {
        e.preventDefault();
        this._dragOver = false;
        const paths = Array.from(e.dataTransfer.files)
            .map(file => file.path)
            .filter(Boolean);
        if (!paths.length) return;
        this._showResults(await this._ipc.invoke('documents:add-paths', paths));
        await this._loadDocuments();
    }

    async _removeDocument(id) {
        await this._ipc.invoke('documents:remove', id);
        this._message = '';
        await this._loadDocuments();
    }

    _handleProfileChange(e) {
        this.onProfileChange(e.target.value);
    }

    async _savePref(key, val) {
        this._prefs = { ...this._prefs, [key]: val };
        await cheatingDaddy.storage.updatePreference(key, val);
    }

    async _saveAutoType(on) {
        this._autoType = on;
        await cheatingDaddy.storage.updatePreference('autoQuestionType', on);
    }

    // Saves an edit for one question type. Text that matches the default is not stored.
    async _saveTypePrompt(type, text) {
        const edits = { ...this._typeEdits };
        if (text.trim() === '' || text.trim() === type.prompt) delete edits[type.id];
        else edits[type.id] = text;
        this._typeEdits = edits;
        await cheatingDaddy.storage.updatePreference('questionTypePrompts', edits);
    }

    async _resetTypePrompt(type) {
        await this._saveTypePrompt(type, '');
    }

    async _resetAllTypePrompts() {
        this._typeEdits = {};
        await cheatingDaddy.storage.updatePreference('questionTypePrompts', {});
    }

    async _saveContext(val) {
        this._context = val;
        await cheatingDaddy.storage.updatePreference('customPrompt', val);
    }

    _getProfileName(profile) {
        const names = {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
        return names[profile] || profile;
    }

    render() {
        const profiles = [
            { value: 'interview', label: 'Job Interview' },
            { value: 'sales', label: 'Sales Call' },
            { value: 'meeting', label: 'Business Meeting' },
            { value: 'presentation', label: 'Presentation' },
            { value: 'negotiation', label: 'Negotiation' },
            { value: 'exam', label: 'Exam Assistant' },
        ];

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div>
                        <div class="page-title">Session Setup</div>
                        <div class="page-subtitle">Tell the AI about the call so its answers fit. Saved automatically and used the next time you start a session.</div>
                    </div>

                    <section class="surface">
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Profile</label>
                                <select class="control" .value=${this.selectedProfile} @change=${this._handleProfileChange}>
                                    ${profiles.map(profile => html`<option value=${profile.value}>${profile.label}</option>`)}
                                </select>
                            </div>
                            <div class="form-group vertical">
                                <label class="form-label">Custom Instructions</label>
                                <textarea
                                    class="control"
                                    placeholder="Resume details, role requirements, constraints..."
                                    .value=${this._context}
                                    @input=${e => this._saveContext(e.target.value)}
                                ></textarea>
                                <div class="form-help">Sent as context at session start. Keep it short.</div>
                            </div>
                        </div>
                    </section>

                    <section class="surface">
                        <div class="surface-title">Details</div>
                        <div class="surface-subtitle">Optional. The more the AI knows, the better it can tailor answers.</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Company</label>
                                <input
                                    class="control"
                                    style="width: 320px; max-width: 100%;"
                                    type="text"
                                    placeholder="Enter company name"
                                    .value=${this._prefs.company}
                                    @input=${e => this._savePref('company', e.target.value)}
                                />
                            </div>
                            <div class="form-group vertical">
                                <label class="form-label">Job Description</label>
                                <textarea
                                    class="control"
                                    placeholder="Paste the job description here"
                                    .value=${this._prefs.jobDescription}
                                    @input=${e => this._savePref('jobDescription', e.target.value)}
                                ></textarea>
                            </div>
                        </div>
                    </section>

                    <section class="surface">
                        <div class="surface-title">Documents</div>
                        <div class="surface-subtitle">
                            Add your resume, the job description, notes or any other file. The AI reads them at the start of each session.
                        </div>
                        <div class="form-grid">
                            <div
                                class="drop-zone ${this._dragOver ? 'over' : ''}"
                                @dragover=${e => {
                                    e.preventDefault();
                                    this._dragOver = true;
                                }}
                                @dragleave=${() => (this._dragOver = false)}
                                @drop=${e => this._dropDocuments(e)}
                            >
                                <div class="doc-actions" style="justify-content: center;">
                                    <button class="doc-button" @click=${() => this._pickDocuments()}>Choose files</button>
                                    <span>or drop them here (PDF, DOCX, TXT, MD, CSV, JSON, up to 10 MB each)</span>
                                </div>
                            </div>
                            ${this._message ? html`<div class="form-help">${this._message}</div>` : ''}
                            <div class="doc-list">
                                ${this._documents.length === 0
                                    ? html`<div class="form-help">No documents added yet.</div>`
                                    : this._documents.map(
                                          doc => html`
                                              <div class="doc-row">
                                                  <span class="doc-name">${doc.name}</span>
                                                  <span class="doc-row-end">
                                                      <span class="doc-meta">
                                                          ${doc.truncated ? 'trimmed to ' : ''}${doc.chars < 1000 ? doc.chars : Math.round(doc.chars / 1000) + 'k'} characters
                                                      </span>
                                                      <button class="doc-button small" @click=${() => this._removeDocument(doc.id)}>Remove</button>
                                                  </span>
                                              </div>
                                          `
                                      )}
                            </div>
                            <div class="form-help">Files stay on this computer. Their text is sent to your AI provider (Gemini or Groq) during a session. Very long files are trimmed.</div>
                        </div>
                    </section>

                    <section class="surface">
                        <div class="surface-title">Answer Preferences</div>
                        <div class="surface-subtitle">How the AI should word and lay out its answers.</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Tone</label>
                                <select class="control" .value=${this._prefs.answerTone} @change=${e => this._savePref('answerTone', e.target.value)}>
                                    <option value="default">Default</option>
                                    <option value="simple">Simple</option>
                                    <option value="formal">Formal</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Format</label>
                                <select class="control" .value=${this._prefs.answerFormat} @change=${e => this._savePref('answerFormat', e.target.value)}>
                                    <option value="default">Default</option>
                                    <option value="full_script">Full script</option>
                                    <option value="script_bullets">Script + bullets</option>
                                    <option value="bullets">Bullet points</option>
                                </select>
                            </div>
                            <div class="form-help">Simple uses plain words with no jargon. Formal uses precise, professional wording. Full script reads word for word; Script + bullets gives an opening line then bullets; Bullet points are short notes to say in your own words.</div>
                            <label class="form-group" style="cursor: pointer;">
                                <span>
                                    <span class="form-label" style="cursor: pointer;">Use the STAR method</span>
                                    <div class="form-help">Situation, Task, Action, Result structure for questions about past experience.</div>
                                </span>
                                <input
                                    type="checkbox"
                                    .checked=${this._prefs.useStarMethod}
                                    @change=${e => this._savePref('useStarMethod', e.target.checked)}
                                />
                            </label>
                        </div>
                    </section>

                    <section class="surface">
                        <div class="surface-title">Question Types</div>
                        <div class="surface-subtitle">
                            The AI works out what kind of question was asked and follows the matching guide below. Edit any guide to change how it answers.
                        </div>
                        <div class="form-grid">
                            <label class="form-group" style="cursor: pointer;">
                                <span>
                                    <span class="form-label" style="cursor: pointer;">Detect the question type automatically</span>
                                    <div class="form-help">Turn this off to use only your own instructions.</div>
                                </span>
                                <input type="checkbox" .checked=${this._autoType} @change=${e => this._saveAutoType(e.target.checked)} />
                            </label>
                            ${this._autoType
                                ? html`
                                      ${questionTypes().DEFAULT_QUESTION_TYPES.map(type => {
                                          const edited = typeof this._typeEdits[type.id] === 'string' && this._typeEdits[type.id].trim() !== '';
                                          return html`
                                              <div class="type-card">
                                                  <div class="type-head">
                                                      <span class="type-name">${type.label}<span class="type-hint">${type.hint}${edited ? ' · edited' : ''}</span></span>
                                                      ${edited
                                                          ? html`<button class="doc-button small" @click=${() => this._resetTypePrompt(type)}>Reset</button>`
                                                          : ''}
                                                  </div>
                                                  <textarea
                                                      class="control"
                                                      .value=${questionTypes().getTypePrompt(type, this._typeEdits)}
                                                      @change=${e => this._saveTypePrompt(type, e.target.value)}
                                                  ></textarea>
                                              </div>
                                          `;
                                      })}
                                      <div class="doc-actions">
                                          <button class="doc-button" @click=${() => this._resetAllTypePrompts()}>Reset all guides to default</button>
                                      </div>
                                  `
                                : ''}
                        </div>
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('ai-customize-view', AICustomizeView);

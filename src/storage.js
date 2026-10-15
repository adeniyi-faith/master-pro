const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_VERSION = 1;

// Default values
const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal',
    geminiLiveModel: 'gemini-3.1-flash-live-preview',
    geminiScreenshotModel: 'gemini-3.8-flash',
    geminiAnswerModel: '',
    groqModel: 'qwen/qwen3.6-27b',
    groqImageModel: 'qwen/qwen3.6-27b',
    disableGroqThinking: true,
};

const DEFAULT_CREDENTIALS = {
    apiKey: '',
    groqApiKey: '',
};

const DEFAULT_PREFERENCES = {
    customPrompt: '',
    company: '',
    jobDescription: '',
    answerTone: 'default',
    customTone: '',
    questionTypeTones: {},
    answerFormat: 'default',
    useStarMethod: false,
    autoQuestionType: true,
    questionTypePrompts: {},
    providerMode: 'byok',
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    englishOnly: false,
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    endOfSpeech: 'fast',
    fontSize: 'medium',
    backgroundTransparency: 0.8,
    googleSearchEnabled: false,
    localLlmModel: 'unsloth/Qwen3.5-4B-GGUF:Q4_K_M',
    whisperModel: 'tiny.en',
};

const DEFAULT_KEYBINDS = null; // null means use system defaults

const DEFAULT_LIMITS = {
    data: [], // Array of { date: 'YYYY-MM-DD', flash: { count }, flashLite: { count }, groq: { 'qwen3-32b': { chars, limit }, 'gpt-oss-120b': { chars, limit }, 'gpt-oss-20b': { chars, limit } }, gemini: { 'gemma-4-26b-a4b-it': { chars } } }
};

// Get the config directory path based on OS
function getConfigDir() {
    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'cheating-daddy-config');
    } else if (platform === 'darwin') {
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'cheating-daddy-config');
    } else {
        configDir = path.join(os.homedir(), '.config', 'cheating-daddy-config');
    }

    return configDir;
}

// File paths
function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

function getCredentialsPath() {
    return path.join(getConfigDir(), 'credentials.json');
}

function getPreferencesPath() {
    return path.join(getConfigDir(), 'preferences.json');
}

function getKeybindsPath() {
    return path.join(getConfigDir(), 'keybinds.json');
}

function getLimitsPath() {
    return path.join(getConfigDir(), 'limits.json');
}

function getHistoryDir() {
    return path.join(getConfigDir(), 'history');
}

// Helper to read JSON file safely
function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

// Helper to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
        return false;
    }
}

// Makes sure the config folder and its files exist, without ever deleting what the user has.
// A missing file is created with defaults. A file that cannot be read is moved aside
// (renamed to ".broken-<time>") so it can be recovered, then replaced with defaults.
function setUpConfigDir() {
    fs.mkdirSync(getConfigDir(), { recursive: true });
    fs.mkdirSync(getHistoryDir(), { recursive: true });

    const files = [
        [getConfigPath(), DEFAULT_CONFIG],
        [getCredentialsPath(), DEFAULT_CREDENTIALS],
        [getPreferencesPath(), DEFAULT_PREFERENCES],
    ];
    for (const [filePath, defaults] of files) {
        if (!fs.existsSync(filePath)) {
            writeJsonFile(filePath, defaults);
            continue;
        }
        try {
            JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            const backup = `${filePath}.broken-${Date.now()}`;
            try {
                fs.renameSync(filePath, backup);
                console.warn(`${filePath} could not be read; kept a copy at ${backup}`);
            } catch (renameError) {
                console.error('Could not set aside the unreadable file:', renameError.message);
            }
            writeJsonFile(filePath, defaults);
        }
    }

    // Record the settings version. Existing settings are kept as they are.
    try {
        const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
        if (config.configVersion !== CONFIG_VERSION) {
            writeJsonFile(getConfigPath(), { ...config, configVersion: CONFIG_VERSION });
        }
    } catch (error) {
        console.warn('Could not record the settings version:', error.message);
    }
}

// Deletes everything and starts over. Only used when the user chooses "clear all data".
function resetConfigDir() {
    const configDir = getConfigDir();
    if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
    }
    setUpConfigDir();
}

// Initialize storage - call this on app startup
function initializeStorage() {
    setUpConfigDir();
}

// ============ CONFIG ============

function getConfig() {
    const saved = readJsonFile(getConfigPath(), {});
    return { ...DEFAULT_CONFIG, ...saved };
}

function setConfig(config) {
    const current = getConfig();
    const updated = { ...current, ...config, configVersion: CONFIG_VERSION };
    return writeJsonFile(getConfigPath(), updated);
}

function updateConfig(key, value) {
    const config = getConfig();
    config[key] = value;
    return writeJsonFile(getConfigPath(), config);
}

// ============ CREDENTIALS ============

function getCredentials() {
    return readJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
}

function setCredentials(credentials) {
    const current = getCredentials();
    const updated = { ...current, ...credentials };
    return writeJsonFile(getCredentialsPath(), updated);
}

function getApiKey() {
    return getCredentials().apiKey || '';
}

function setApiKey(apiKey) {
    return setCredentials({ apiKey });
}

function getGroqApiKey() {
    return getCredentials().groqApiKey || '';
}

function setGroqApiKey(groqApiKey) {
    return setCredentials({ groqApiKey });
}

// ============ PREFERENCES ============

// Preference keys that belong to a saved session (company, answer style, and so on).
// Everything else (language, window, speed, and so on) is shared by all sessions.
const SESSION_PREFERENCE_KEYS = [
    'customPrompt',
    'company',
    'jobDescription',
    'answerTone',
    'customTone',
    'questionTypeTones',
    'answerFormat',
    'useStarMethod',
    'autoQuestionType',
    'questionTypePrompts',
];

function getPreferences() {
    const saved = readJsonFile(getPreferencesPath(), {});
    for (const key of SESSION_PREFERENCE_KEYS) delete saved[key];
    const preferences = { ...DEFAULT_PREFERENCES, ...saved, ...getActiveSetup().settings };
    const legacyWhisperModels = {
        'Xenova/whisper-tiny': 'tiny.en',
        'Xenova/whisper-base': 'base.en',
        'Xenova/whisper-small': 'small.en',
    };

    preferences.whisperModel = legacyWhisperModels[preferences.whisperModel] || preferences.whisperModel;
    return preferences;
}

// Saves preferences. Session keys go to the active session; the rest go to the shared file.
function setPreferences(preferences) {
    const sessionPart = {};
    const sharedPart = {};
    for (const [key, value] of Object.entries(preferences || {})) {
        (SESSION_PREFERENCE_KEYS.includes(key) ? sessionPart : sharedPart)[key] = value;
    }

    let ok = true;
    if (Object.keys(sessionPart).length) {
        const data = readSetups();
        const active = data.setups.find(setup => setup.id === data.activeId);
        active.settings = { ...active.settings, ...sessionPart };
        ok = writeSetups(data) && ok;
    }
    if (Object.keys(sharedPart).length) {
        const saved = readJsonFile(getPreferencesPath(), {});
        for (const key of SESSION_PREFERENCE_KEYS) delete saved[key];
        ok = writeJsonFile(getPreferencesPath(), { ...DEFAULT_PREFERENCES_SHARED(), ...saved, ...sharedPart }) && ok;
    }
    return ok;
}

function updatePreference(key, value) {
    return setPreferences({ [key]: value });
}

// The shared defaults: every default preference that is not a session key
function DEFAULT_PREFERENCES_SHARED() {
    const shared = { ...DEFAULT_PREFERENCES };
    for (const key of SESSION_PREFERENCE_KEYS) delete shared[key];
    return shared;
}

// ============ SAVED SESSIONS ("setups") ============
// Each saved session has its own company, job description, answer style, question guides,
// documents and answer bank. History entries are separate and keep the name of the session they came from.

const DEFAULT_SETUP_ID = 'default';

function getSetupsPath() {
    return path.join(getConfigDir(), 'sessions.json');
}

function newSetupId() {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Reads the list of saved sessions. The first time, a "My session" entry is made from the
// settings the user already has, so nothing is lost when upgrading.
function readSetups() {
    const data = readJsonFile(getSetupsPath(), null);
    if (data && Array.isArray(data.setups) && data.setups.length) {
        if (!data.setups.some(setup => setup.id === data.activeId)) data.activeId = data.setups[0].id;
        return data;
    }

    const legacy = readJsonFile(getPreferencesPath(), {});
    const settings = {};
    for (const key of SESSION_PREFERENCE_KEYS) {
        if (key in legacy) settings[key] = legacy[key];
    }
    const created = {
        activeId: DEFAULT_SETUP_ID,
        setups: [{ id: DEFAULT_SETUP_ID, name: 'My session', createdAt: Date.now(), settings }],
    };
    writeJsonFile(getSetupsPath(), created);
    return created;
}

function writeSetups(data) {
    return writeJsonFile(getSetupsPath(), data);
}

function getActiveSetup() {
    const data = readSetups();
    return data.setups.find(setup => setup.id === data.activeId);
}

// File for one kind of per-session data (documents, answer bank). The first session keeps the old file names.
function getSetupFilePath(kind, setupId) {
    const id = setupId || getActiveSetup().id;
    return path.join(getConfigDir(), id === DEFAULT_SETUP_ID ? `${kind}.json` : `${kind}-${id}.json`);
}

const SETUP_DATA_KINDS = ['documents', 'answerbank'];

function listSetups() {
    const data = readSetups();
    return {
        activeId: data.activeId,
        setups: data.setups.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
    };
}

function cleanSetupName(name, fallback) {
    const trimmed = String(name || '').trim().slice(0, 60);
    return trimmed || fallback;
}

// Creates a session and makes it the active one. With `copyFromId` it starts as a copy of that session.
function createSetup(name, copyFromId) {
    const data = readSetups();
    const source = copyFromId ? data.setups.find(setup => setup.id === copyFromId) : null;
    const setup = {
        id: newSetupId(),
        name: cleanSetupName(name, source ? `${source.name} copy` : `Session ${data.setups.length + 1}`),
        createdAt: Date.now(),
        settings: source ? JSON.parse(JSON.stringify(source.settings || {})) : {},
    };
    if (source) {
        for (const kind of SETUP_DATA_KINDS) {
            const from = getSetupFilePath(kind, source.id);
            if (fs.existsSync(from)) fs.copyFileSync(from, getSetupFilePath(kind, setup.id));
        }
    }
    data.setups.push(setup);
    data.activeId = setup.id;
    writeSetups(data);
    return setup.id;
}

function renameSetup(id, name) {
    const data = readSetups();
    const setup = data.setups.find(item => item.id === id);
    if (!setup) return false;
    setup.name = cleanSetupName(name, setup.name);
    return writeSetups(data);
}

function setActiveSetup(id) {
    const data = readSetups();
    if (!data.setups.some(setup => setup.id === id)) return false;
    data.activeId = id;
    return writeSetups(data);
}

// Removes a session and its documents and answer bank. The last remaining session cannot be removed.
function deleteSetup(id) {
    const data = readSetups();
    if (data.setups.length <= 1 || !data.setups.some(setup => setup.id === id)) return false;
    data.setups = data.setups.filter(setup => setup.id !== id);
    if (data.activeId === id) data.activeId = data.setups[0].id;
    for (const kind of SETUP_DATA_KINDS) {
        try {
            fs.rmSync(getSetupFilePath(kind, id), { force: true });
        } catch (error) {
            console.warn('Could not remove session data:', error.message);
        }
    }
    return writeSetups(data);
}

// ============ KEYBINDS ============

function getKeybinds() {
    return readJsonFile(getKeybindsPath(), DEFAULT_KEYBINDS);
}

function setKeybinds(keybinds) {
    return writeJsonFile(getKeybindsPath(), keybinds);
}

// ============ LIMITS (Rate Limiting) ============

function getLimits() {
    return readJsonFile(getLimitsPath(), DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(getLimitsPath(), limits);
}

function getTodayDateString() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    // Use the local calendar date so the daily counter resets at local midnight
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; // YYYY-MM-DD
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find today's entry
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry) {
        // ensure new fields exist
        if (!todayEntry.groq) {
            todayEntry.groq = {
                'qwen3-32b': { chars: 0, limit: 1500000 },
                'gpt-oss-120b': { chars: 0, limit: 600000 },
                'gpt-oss-20b': { chars: 0, limit: 600000 },
                'kimi-k2-instruct': { chars: 0, limit: 600000 },
            };
        }
        if (!todayEntry.gemini) {
            todayEntry.gemini = {
                'gemma-4-26b-a4b-it': { chars: 0 },
            };
        }
        setLimits(limits);
        return todayEntry;
    }

    // No entry for today - clean old entries and create new one
    limits.data = limits.data.filter(entry => entry.date === today);
    const newEntry = {
        date: today,
        flash: { count: 0 },
        flashLite: { count: 0 },
        groq: {
            'qwen3-32b': { chars: 0, limit: 1500000 },
            'gpt-oss-120b': { chars: 0, limit: 600000 },
            'gpt-oss-20b': { chars: 0, limit: 600000 },
            'kimi-k2-instruct': { chars: 0, limit: 600000 },
        },
        gemini: {
            'gemma-4-26b-a4b-it': { chars: 0 },
        },
    };
    limits.data.push(newEntry);
    setLimits(limits);

    return newEntry;
}

function incrementLimitCount(model) {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find or create today's entry
    let todayEntry = limits.data.find(entry => entry.date === today);

    if (!todayEntry) {
        // Clean old entries and create new one
        limits.data = [];
        todayEntry = {
            date: today,
            flash: { count: 0 },
            flashLite: { count: 0 },
        };
        limits.data.push(todayEntry);
    } else {
        // Clean old entries, keep only today
        limits.data = limits.data.filter(entry => entry.date === today);
    }

    // Increment the appropriate model count
    if (model === 'gemini-2.5-flash') {
        todayEntry.flash.count++;
    } else if (model === 'gemini-2.5-flash-lite') {
        todayEntry.flashLite.count++;
    }

    setLimits(limits);
    return todayEntry;
}

function incrementCharUsage(provider, model, charCount) {
    getTodayLimits();

    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry[provider] && todayEntry[provider][model]) {
        todayEntry[provider][model].chars += charCount;
        setLimits(limits);
    }

    return todayEntry;
}

// The Gemini model used to answer screenshots and to write session notes
function getAvailableModel() {
    return getConfig().geminiScreenshotModel || DEFAULT_CONFIG.geminiScreenshotModel;
}

function getModelForToday() {
    const todayEntry = getTodayLimits();
    const groq = todayEntry.groq;

    if (groq['gpt-oss-120b'].chars < groq['gpt-oss-120b'].limit) {
        return 'openai/gpt-oss-120b';
    }
    if (groq['gpt-oss-20b'].chars < groq['gpt-oss-20b'].limit) {
        return 'openai/gpt-oss-20b';
    }
    if (groq['kimi-k2-instruct'].chars < groq['kimi-k2-instruct'].limit) {
        return 'moonshotai/kimi-k2-instruct';
    }

    // All limits exhausted
    return null;
}

// ============ HISTORY ============

function getSessionPath(sessionId) {
    return path.join(getHistoryDir(), `${sessionId}.json`);
}

function saveSession(sessionId, data) {
    const sessionPath = getSessionPath(sessionId);

    // Load existing session to preserve metadata
    const existingSession = readJsonFile(sessionPath, null);

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        // Profile context - set once when session starts
        profile: data.profile || existingSession?.profile || null,
        customPrompt: data.customPrompt || existingSession?.customPrompt || null,
        // Conversation data
        conversationHistory: data.conversationHistory || existingSession?.conversationHistory || [],
        screenAnalysisHistory: data.screenAnalysisHistory || existingSession?.screenAnalysisHistory || [],
        // The saved session (company, documents...) that was active when this one started
        setupName: existingSession?.setupName || getActiveSetup().name,
        // Post-session notes, written on request
        notes: data.notes || existingSession?.notes || null,
    };
    return writeJsonFile(sessionPath, sessionData);
}

function getSession(sessionId) {
    return readJsonFile(getSessionPath(sessionId), null);
}

function getAllSessions() {
    const historyDir = getHistoryDir();

    try {
        if (!fs.existsSync(historyDir)) {
            return [];
        }

        const files = fs
            .readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => {
                // Sort by timestamp descending (newest first)
                const tsA = parseInt(a.replace('.json', ''));
                const tsB = parseInt(b.replace('.json', ''));
                return tsB - tsA;
            });

        return files
            .map(file => {
                const sessionId = file.replace('.json', '');
                const data = readJsonFile(path.join(historyDir, file), null);
                if (data) {
                    return {
                        sessionId,
                        createdAt: data.createdAt,
                        lastUpdated: data.lastUpdated,
                        messageCount: data.conversationHistory?.length || 0,
                        screenAnalysisCount: data.screenAnalysisHistory?.length || 0,
                        profile: data.profile || null,
                        customPrompt: data.customPrompt || null,
                        setupName: data.setupName || null,
                    };
                }
                return null;
            })
            .filter(Boolean);
    } catch (error) {
        console.error('Error reading sessions:', error.message);
        return [];
    }
}

function deleteSession(sessionId) {
    const sessionPath = getSessionPath(sessionId);
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            return true;
        }
    } catch (error) {
        console.error('Error deleting session:', error.message);
    }
    return false;
}

function deleteAllSessions() {
    const historyDir = getHistoryDir();
    try {
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                fs.unlinkSync(path.join(historyDir, file));
            });
        }
        return true;
    } catch (error) {
        console.error('Error deleting all sessions:', error.message);
        return false;
    }
}

// ============ CLEAR ALL DATA ============

function clearAllData() {
    resetConfigDir();
    return true;
}

module.exports = {
    // Initialization
    initializeStorage,
    getConfigDir,

    // Config
    getConfig,
    setConfig,
    updateConfig,

    // Credentials
    getCredentials,
    setCredentials,
    getApiKey,
    setApiKey,
    getGroqApiKey,
    setGroqApiKey,

    // Preferences
    getPreferences,
    setPreferences,
    updatePreference,

    // Keybinds
    getKeybinds,
    setKeybinds,

    // Limits (Rate Limiting)
    getLimits,
    setLimits,
    getTodayLimits,
    incrementLimitCount,
    getAvailableModel,
    incrementCharUsage,
    getModelForToday,

    // History
    saveSession,
    SESSION_PREFERENCE_KEYS,
    getSetupFilePath,
    listSetups,
    createSetup,
    renameSetup,
    setActiveSetup,
    deleteSetup,
    getSession,
    getAllSessions,
    deleteSession,
    deleteAllSessions,

    // Clear all
    clearAllData,
};

// Gemini models offered in the app's settings. Model names come from Google's
// model list (ai.google.dev/gemini-api/docs/models).

const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const DEFAULT_SCREENSHOT_MODEL = 'gemini-3.8-flash';

// Models that listen to audio and answer live
const LIVE_MODELS = [
    { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live (older, tested here)' },
    { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live (newest, fast)' },
    { id: 'gemini-3.8-live-extended-thinking', label: 'Gemini 3.8 Live, extended thinking (slower, deeper)' },
];

// Models that read a screenshot and write notes after a session
const SCREENSHOT_MODELS = [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (best quality)' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (previous generation)' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (faster, cheaper)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (fastest, cheapest)' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
];

module.exports = { DEFAULT_LIVE_MODEL, DEFAULT_SCREENSHOT_MODEL, LIVE_MODELS, SCREENSHOT_MODELS };

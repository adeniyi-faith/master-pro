const { GoogleGenAI, Modality, EndSensitivity } = require('@google/genai');
const { BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { saveDebugAudio } = require('../audioUtils');
const { getSystemPrompt } = require('./prompts');
const { recordUsage } = require('./usageTracker');
const { getSession, saveSession, getAvailableModel, incrementLimitCount, getApiKey, getGroqApiKey, incrementCharUsage, getConfig, getPreferences } = require('../storage');
const { connectCloud, sendCloudAudio, sendCloudText, sendCloudImage, closeCloud, isCloudActive, setOnTurnComplete } = require('./cloud');
const { startTransportLog, logTransportEvent, closeTransportLog } = require('./transportLogger');

// Lazy-loaded to avoid circular dependency (localai.js imports from gemini.js)
let _localai = null;
function getLocalAi() {
    if (!_localai) _localai = require('./localai');
    return _localai;
}

// Provider mode: 'byok', 'cloud', or 'local'
let currentProviderMode = 'byok';

// Groq conversation history for context
let groqConversationHistory = [];

// Conversation tracking variables
let currentSessionId = null;
let currentTranscription = '';
let lastTypedQuestion = ''; // text typed by the user, used when the Live model answers it
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let isInitializingSession = false;
let currentSystemPrompt = null;

// The newest token count the Live session reported during the current turn, saved to the usage record when the turn ends
let liveTurnUsage = null;
function flushLiveUsage() {
    if (liveTurnUsage) recordUsage('live', getConfig().geminiLiveModel, liveTurnUsage);
    liveTurnUsage = null;
}

function formatSpeakerResults(results) {
    let text = '';
    for (const result of results) {
        if (result.transcript && result.speakerId) {
            const speakerLabel = result.speakerId === 1 ? 'Interviewer' : 'Candidate';
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}

module.exports.formatSpeakerResults = formatSpeakerResults;

// Audio capture variables
let systemAudioProc = null;
let messageBuffer = '';
let groqRequestStartedForTurn = false;

const GROQ_MAX_COMPLETION_TOKENS = 16384;
const GROQ_EMPTY_RESPONSE_MESSAGE =
    'Groq reached the maximum completion-token limit before returning a final answer. Disable thinking in Home → AI responses and try again.';

// Reconnection variables
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
// Keep trying to get the connection back for this long before giving up (the user can then tap Reconnect)
let RECONNECT_GIVE_UP_MS = 120000;
let RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

// Live connection health. Google closes each live connection after about 10 minutes by design, and it sends a
// "go away" warning first, so we hand over to a fresh connection early (using the resume handle) instead of waiting for a drop.
let liveGeneration = 0; // the newest connection that is in use; older ones are being replaced and are ignored
let generationCounter = 0;
let liveConnected = false;
let liveReconnecting = false;
let resumeHandle = null;
let liveWatchdogTimer = null;
let lastWatchdogReconnectAt = 0;
let loudMsWithoutTranscript = 0;

// Audio heard while there is no connection is kept (newest 20 seconds) and replayed once the connection is back
const AUDIO_REPLAY_MAX_MS = 20000;
let AUDIO_REPLAY_GAP_MS = 30;
let pendingAudio = [];
let pendingAudioMs = 0;
let drainingPendingAudio = false;
let WATCHDOG_INTERVAL_MS = 5000;
const WATCHDOG_BUFFERED_BYTES = 400000; // audio piling up unsent means the connection has silently stalled
let WATCHDOG_LOUD_MS_NO_WORDS = 20000; // loud call audio but no words came back
let WATCHDOG_MIN_GAP_MS = 90000;
const LOUD_RMS = 500;

// Removes the stray "- ***"...***" wrapping some models put around a short answer
function tidyAnswer(text) {
    if (typeof text !== 'string') return text;
    const wrapped = /^\s*(?:-\s*\*{2,3}\s*["“]?|\*{2,3}["“])/;
    if (!wrapped.test(text)) return text;
    return text.replace(wrapped, '').replace(/["”]?\s*\*{2,3}\s*$/, '').trim();
}

const { looksLikeEnglish } = require('./languageFilter');

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, channel === 'new-response' || channel === 'update-response' ? tidyAnswer(data) : data);
    }
}

// Heard speech that is not worth answering: one- or two-word scraps ("Yeah.", "Thank you.", "Look at"),
// or the same question again within a few seconds (the microphone often hears the speakers twice).
const MIN_QUESTION_WORDS = 3;
const REPEAT_QUESTION_WINDOW_MS = 15000;
let lastQuestionKey = '';
let lastQuestionAt = 0;

function shouldSkipQuestion(text) {
    if (getPreferences().englishOnly === true && !looksLikeEnglish(text)) return true;
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (key.split(' ').filter(Boolean).length < MIN_QUESTION_WORDS) return true;
    if (key === lastQuestionKey && Date.now() - lastQuestionAt < REPEAT_QUESTION_WINDOW_MS) return true;
    lastQuestionKey = key;
    lastQuestionAt = Date.now();
    return false;
}

// Build context message for session restoration
// Tells the screen which question the answer that is about to appear belongs to
function announceQuestion(text) {
    sendToRenderer('question-asked', (text || '').trim());
}

// "fetch failed" and similar mean the computer could not reach Google (internet drop, VPN, firewall, timeout)
function isNetworkError(error) {
    const text = `${error?.message || ''} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`;
    return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EPIPE|socket|network|terminated|UND_ERR/i.test(text);
}

// A message a person can act on, instead of "TypeError: fetch failed"
function friendlyErrorMessage(error) {
    if (isNetworkError(error)) {
        return "Couldn't reach Google. Check your internet connection (or VPN or firewall) and try again.";
    }
    return error?.message || 'Unknown error';
}

// Starts a streamed Gemini answer and passes each growing text to onText(text, isFirst). If the connection drops before
// anything has arrived, it quietly tries again (up to 3 tries in total). Returns the full text.
async function streamGeminiWithRetry(ai, params, onText, usageKind) {
    const maxTries = 3;
    for (let attempt = 1; ; attempt++) {
        let fullText = '';
        let usage = null;
        try {
            const stream = await ai.models.generateContentStream(params);
            for await (const chunk of stream) {
                if (chunk.usageMetadata) usage = chunk.usageMetadata;
                if (chunk.text) {
                    fullText += chunk.text;
                    onText(fullText, fullText === chunk.text);
                }
            }
            if (usageKind) recordUsage(usageKind, params.model, usage);
            return fullText;
        } catch (error) {
            const canRetry = attempt < maxTries && fullText === '' && isNetworkError(error);
            console.error(`Gemini request failed (try ${attempt} of ${maxTries}${canRetry ? ', retrying' : ''}):`, error, error?.cause || '');
            if (!canRetry) throw error;
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }
}

// One-click ways to change an answer that is already on screen
const REWORK_INSTRUCTIONS = {
    regenerate: 'Write a completely fresh answer to the same question, using different wording and a different angle. Keep about the same length.',
    longer: 'Rewrite the answer so it is longer and more detailed, adding useful substance (not filler). Keep the same style.',
    shorter: 'Rewrite the answer so it is much shorter: the key point in one or two sentences.',
    simpler: 'Rewrite the answer in plainer, simpler words that anyone could follow, without losing the key point.',
    example: 'Rewrite the answer and include one short, concrete example that supports the main point.',
    search: 'Search the web with Google for current, accurate information about this question, then give an improved answer based on what you find. Keep the same style and length. Do not mention that you searched.',
};
const REWORK_MAX_CHARS = 8000;

// Rewrites one answer according to `mode` and streams the new version to the screen as 'rework-update'.
// It does not change the saved conversation history.
async function reworkAnswer({ question, answer, mode, requestId }) {
    const instruction = REWORK_INSTRUCTIONS[mode];
    const send = payload => sendToRenderer('rework-update', { requestId, ...payload });
    if (!instruction || typeof question !== 'string' || typeof answer !== 'string') {
        send({ done: true, error: 'Invalid request' });
        return;
    }
    const prompt =
        `Question that was asked:\n${question.slice(0, REWORK_MAX_CHARS)}\n\n` +
        `Your previous answer:\n${answer.slice(0, REWORK_MAX_CHARS)}\n\n` +
        `${instruction} Reply with only the new answer.`;
    const systemPrompt = currentSystemPrompt || 'You are a helpful assistant.';

    try {
        let fullText = '';
        if (getApiKey()) {
            const ai = new GoogleGenAI({ apiKey: getApiKey() });
            fullText = await streamGeminiWithRetry(
                ai,
                {
                    model: getGeminiAnswerModel() || 'gemini-3.5-flash-lite',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { systemInstruction: systemPrompt, ...(mode === 'search' ? { tools: [{ googleSearch: {} }] } : {}) },
                },
                text => send({ text, done: false }),
                'rewrite'
            );
        } else if (mode === 'search') {
            throw new Error('Search needs a Gemini key');
        } else if (hasGroqKey()) {
            const config = getConfig();
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${getGroqApiKey()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.groqModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.7,
                    max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
                    ...getGroqReasoningOptions(config.groqModel, config.disableGroqThinking),
                }),
            });
            if (!response.ok) throw new Error(`Groq error ${response.status}`);
            const json = await response.json();
            fullText = stripThinkingTags(json.choices?.[0]?.message?.content || '');
        } else {
            throw new Error('No API key set');
        }
        if (!fullText.trim()) throw new Error('Empty answer');
        send({ text: fullText, done: true });
    } catch (error) {
        console.error('Error reworking answer:', error);
        send({ done: true, error: friendlyErrorMessage(error) });
    }
}

function buildContextMessage() {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(turn => `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`);

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

// Conversation management functions
function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    startTransportLog(currentSessionId);
    currentTranscription = '';
    clearQuestionEndTimer();
    groqRequestStartedForTurn = false;
    conversationHistory = [];
    screenAnalysisHistory = [];
    groqConversationHistory = [];
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    console.log('New conversation session started:', currentSessionId, 'profile:', profile);

    // Save initial session with profile context
    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: profile,
            customPrompt: customPrompt || '',
        });
    }
}

function saveConversationTurn(transcription, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: transcription.trim(),
        ai_response: aiResponse.trim(),
    };

    conversationTurn.ai_response = tidyAnswer(conversationTurn.ai_response);
    conversationHistory.push(conversationTurn);
    console.log('Saved conversation turn:', conversationTurn);

    // Send to renderer to save in IndexedDB
    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function saveScreenAnalysis(prompt, response, model) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const analysisEntry = {
        timestamp: Date.now(),
        prompt: prompt,
        response: response.trim(),
        model: model,
    };

    screenAnalysisHistory.push(analysisEntry);
    console.log('Saved screen analysis:', analysisEntry);

    // Send to renderer to save
    sendToRenderer('save-screen-analysis', {
        sessionId: currentSessionId,
        analysis: analysisEntry,
        fullHistory: screenAnalysisHistory,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
    };
}

// How quickly the AI decides the other person has finished speaking.
// 'balanced' keeps Gemini's defaults; the others end a turn after a shorter silence.
function getRealtimeInputConfig() {
    const speed = getPreferences().endOfSpeech;
    const silenceMs = { fast: 500, fastest: 250 }[speed];
    if (!silenceMs) return undefined;

    return {
        automaticActivityDetection: {
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            silenceDurationMs: silenceMs,
        },
    };
}

async function getEnabledTools() {
    const tools = [];

    // Read the saved preference (the same one the Customize screen writes)
    const googleSearchEnabled = getPreferences().googleSearchEnabled === true;
    console.log('Google Search enabled:', googleSearchEnabled);

    if (googleSearchEnabled) {
        tools.push({ googleSearch: {} });
        console.log('Added Google Search tool');
    } else {
        console.log('Google Search tool disabled');
    }

    return tools;
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            // Wait a bit for the renderer to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to get setting from renderer process localStorage
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            console.log('localStorage not available yet for ${key}');
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        console.log('Retrieved setting ${key}:', stored);
                        return stored || '${defaultValue}';
                    } catch (e) {
                        console.error('Error accessing localStorage for ${key}:', e);
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting for', key, ':', error.message);
    }
    console.log('Using default value for', key, ':', defaultValue);
    return defaultValue;
}

// helper to check if groq has been configured
function hasGroqKey() {
    const key = getGroqApiKey();
    return key && key.trim() != '';
}

// The Gemini text model chosen in Settings to write answers ('' means not used)
function getGeminiAnswerModel() {
    const model = (getConfig().geminiAnswerModel || '').trim();
    return model && getApiKey() ? model : '';
}

// True when answers come from a text model (Gemini or Groq) instead of the Live model's own voice answers
function usesTextAnswers() {
    return Boolean(getGeminiAnswerModel()) || hasGroqKey();
}

// Sends the question to the chosen text model. Gemini wins over Groq when both are set.
function sendQuestionToAnswerModel(transcription) {
    if (getGeminiAnswerModel()) {
        sendToGeminiText(transcription);
    } else if (hasGroqKey()) {
        sendToGroq(transcription);
    }
}

// Starts the Gemini text answer once the speaker has finished the question. The Live model starts
// replying only after it decides the speaker stopped, so its first reply signal marks the end.
function sendFinalTranscriptionToGemini() {
    if (!getGeminiAnswerModel()) {
        return;
    }
    const transcription = currentTranscription.trim();
    if (transcription === '') {
        return;
    }
    // Start fresh so speech heard while the answer is written counts as the next question
    currentTranscription = '';
    if (shouldSkipQuestion(transcription)) {
        return;
    }
    sendToGeminiText(transcription);
}

// How long to wait in silence before treating the question as finished. People pause to think in the middle of
// long questions, so the wait is generous, and longer still when the last word is one that rarely ends a
// sentence ("and", "the", "because"). It is shorter when the question clearly ended with a question mark.
const QUESTION_END_SILENCE_MS = 3000;
const QUESTION_OPEN_END_SILENCE_MS = 5500;
const QUESTION_CLEAR_END_SILENCE_MS = 2000;
const OPEN_ENDING_WORDS = /\b(and|or|but|so|because|that|which|who|when|where|if|the|a|an|to|of|with|for|in|on|about|how|what|why|like|then|also|is|are|was|were|my|your|our|their|it|you|i|we|can|could|would|should|do|does|did|have|has|had)$/i;

// "Patience" setting: how much longer (or shorter) than normal to wait for the question to finish
const PATIENCE_MULTIPLIERS = { quick: 0.6, normal: 1, patient: 1.5, 'very-patient': 2 };

function getQuestionEndWaitMs(text) {
    const trimmed = (text || '').trim();
    let ms = QUESTION_END_SILENCE_MS;
    if (/\?$/.test(trimmed)) ms = QUESTION_CLEAR_END_SILENCE_MS;
    else if (OPEN_ENDING_WORDS.test(trimmed.replace(/[.,;:!"')\s]+$/, ''))) ms = QUESTION_OPEN_END_SILENCE_MS;
    const multiplier = PATIENCE_MULTIPLIERS[getPreferences().questionPatience] || 1;
    return Math.round(Math.min(12000, Math.max(1000, ms * multiplier)));
}

let questionEndTimer = null;

function clearQuestionEndTimer() {
    if (questionEndTimer) {
        clearTimeout(questionEndTimer);
        questionEndTimer = null;
    }
}

// Sends the finished question to whichever text model is answering (Gemini or Groq), once per question
function sendFinalTranscription() {
    clearQuestionEndTimer();
    sendFinalTranscriptionToGemini();
    sendFinalTranscriptionToGroq();
}

// Called for every new piece of heard speech: restarts the countdown to "the question has ended"
function restartQuestionEndTimer() {
    clearQuestionEndTimer();
    if (!usesTextAnswers()) return;
    questionEndTimer = setTimeout(sendFinalTranscription, getQuestionEndWaitMs(currentTranscription));
}

function sendFinalTranscriptionToGroq() {
    if (getGeminiAnswerModel() || !hasGroqKey()) {
        return;
    }

    const transcription = currentTranscription.trim();
    if (transcription === '') {
        return;
    }
    currentTranscription = '';

    if (shouldSkipQuestion(transcription)) {
        return;
    }
    sendToGroq(transcription);
}

function trimConversationHistoryForGemma(history, maxChars = 42000) {
    if (!history || history.length === 0) return [];
    let totalChars = 0;
    const trimmed = [];

    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        const turnChars = (turn.content || '').length;

        if (totalChars + turnChars > maxChars) break;
        totalChars += turnChars;
        trimmed.unshift(turn);
    }
    return trimmed;
}

function stripThinkingTags(text) {
    const trimmedStart = text.trimStart();
    if ('<think>'.startsWith(trimmedStart)) {
        return '';
    }

    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
}

function getGroqReasoningOptions(model, disableThinking) {
    if (model.includes('qwen3')) {
        const options = {
            reasoning_format: 'hidden',
        };

        if (disableThinking) {
            options.reasoning_effort = 'none';
        }

        return options;
    }

    if (model.startsWith('openai/gpt-oss-')) {
        return {
            include_reasoning: false,
        };
    }

    return {};
}

async function sendToGroq(transcription) {
    const groqApiKey = getGroqApiKey();
    if (!groqApiKey) {
        console.log('No Groq API key configured, skipping Groq response');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Groq');
        return;
    }

    const config = getConfig();
    const modelToUse = config.groqModel;

    announceQuestion(transcription);
    console.log(`Sending to Groq (${modelToUse}):`, transcription.substring(0, 100) + '...');
    logTransportEvent('groq.text.request', {
        model: modelToUse,
        transcription,
    });

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    if (groqConversationHistory.length > 20) {
        groqConversationHistory = groqConversationHistory.slice(-20);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [{ role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' }, ...groqConversationHistory],
                stream: true,
                temperature: 0.7,
                max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
                ...getGroqReasoningOptions(modelToUse, config.disableGroqThinking),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            logTransportEvent('groq.text.http_error', {
                status: response.status,
                body: errorText,
            });
            sendToRenderer('update-status', `Groq error: ${response.status}`);
            return;
        }

        logTransportEvent('groq.text.http_response', {
            status: response.status,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;
        let finishReason = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            logTransportEvent('groq.text.stream_chunk', { chunk });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        logTransportEvent('groq.text.stream_event', json);
                        finishReason = json.choices?.[0]?.finish_reason || finishReason;
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullText += token;
                            const displayText = stripThinkingTags(fullText);
                            if (displayText) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                                isFirst = false;
                            }
                        }
                    } catch (parseError) {
                        logTransportEvent('groq.text.stream_parse_error', {
                            data,
                            error: parseError.message,
                        });
                    }
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        const modelKey = modelToUse.split('/').pop();

        const systemPromptChars = (currentSystemPrompt || 'You are a helpful assistant.').length;
        const historyChars = groqConversationHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        const inputChars = systemPromptChars + historyChars;
        const outputChars = cleanedResponse.length;

        incrementCharUsage('groq', modelKey, inputChars + outputChars);

        if (cleanedResponse) {
            groqConversationHistory.push({
                role: 'assistant',
                content: cleanedResponse,
            });

            saveConversationTurn(transcription, cleanedResponse);
        } else {
            console.warn(`Groq returned no final answer (${modelToUse})`);
            logTransportEvent('groq.text.empty_response', {
                model: modelToUse,
                fullText,
                finishReason,
            });
            sendToRenderer('new-response', GROQ_EMPTY_RESPONSE_MESSAGE);
            sendToRenderer('update-status', 'Groq reached the completion-token limit');
            return;
        }

        logTransportEvent('groq.text.completed', {
            model: modelToUse,
            response: cleanedResponse,
        });
        console.log(`Groq response completed (${modelToUse})`);
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Groq API:', error);
        logTransportEvent('groq.text.error', {
            error: error.message,
            stack: error.stack,
        });
        sendToRenderer('update-status', 'Groq error: ' + error.message);
    }
}

async function sendImageToGroq(base64Data, prompt) {
    const groqApiKey = getGroqApiKey();
    const config = getConfig();
    const model = config.groqImageModel;

    logTransportEvent('groq.image.request', {
        model,
        prompt,
        imageBytes: Buffer.byteLength(base64Data, 'base64'),
    });

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: currentSystemPrompt || 'You are a helpful assistant.' },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Data}`,
                                },
                            },
                        ],
                    },
                ],
                stream: true,
                temperature: 0.7,
                max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
                ...getGroqReasoningOptions(model, config.disableGroqThinking),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq image API error:', response.status, errorText);
            logTransportEvent('groq.image.http_error', {
                status: response.status,
                body: errorText,
            });
            return { success: false, error: `Groq error: ${response.status}` };
        }

        logTransportEvent('groq.image.http_response', {
            status: response.status,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;
        let finishReason = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            logTransportEvent('groq.image.stream_chunk', { chunk });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;

                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    logTransportEvent('groq.image.stream_event', json);
                    finishReason = json.choices?.[0]?.finish_reason || finishReason;
                    const token = json.choices?.[0]?.delta?.content || '';
                    if (!token) continue;

                    fullText += token;
                    const displayText = stripThinkingTags(fullText);
                    if (displayText) {
                        sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                        isFirst = false;
                    }
                } catch (parseError) {
                    logTransportEvent('groq.image.stream_parse_error', {
                        data,
                        error: parseError.message,
                    });
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        if (!cleanedResponse) {
            logTransportEvent('groq.image.empty_response', {
                model,
                fullText,
                finishReason,
            });
            return { success: false, error: GROQ_EMPTY_RESPONSE_MESSAGE };
        }

        saveScreenAnalysis(prompt, cleanedResponse, model);
        logTransportEvent('groq.image.completed', {
            model,
            response: cleanedResponse,
        });
        return { success: true, text: cleanedResponse, model };
    } catch (error) {
        console.error('Error calling Groq image API:', error);
        logTransportEvent('groq.image.error', {
            error: error.message,
            stack: error.stack,
        });
        return { success: false, error: error.message };
    }
}

async function sendToGeminiText(transcription) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log('No Gemini API key configured');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Gemini text answer');
        return;
    }

    const answerModel = getGeminiAnswerModel() || 'gemini-3.5-flash-lite';
    announceQuestion(transcription);
    console.log(`Sending to ${answerModel}:`, transcription.substring(0, 100) + '...');

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    const trimmedHistory = trimConversationHistoryForGemma(groqConversationHistory, 42000);

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const messages = trimmedHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));

        const systemPrompt = currentSystemPrompt || 'You are a helpful assistant.';

        let isFirst = true;
        const fullText = await streamGeminiWithRetry(
            ai,
            { model: answerModel, contents: messages, config: { systemInstruction: systemPrompt } },
            text => {
                sendToRenderer(isFirst ? 'new-response' : 'update-response', text);
                isFirst = false;
            },
            'answer'
        );

        if (fullText.trim()) {
            groqConversationHistory.push({
                role: 'assistant',
                content: fullText.trim(),
            });

            if (groqConversationHistory.length > 40) {
                groqConversationHistory = groqConversationHistory.slice(-40);
            }

            saveConversationTurn(transcription, fullText);
        }

        console.log(`${answerModel} response completed`);
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Gemini text answer model:', error);
        sendToRenderer('update-status', 'Gemini error: ' + friendlyErrorMessage(error));
    }
}

async function initializeGeminiSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnect = false) {
    if (isInitializingSession) {
        console.log('Session initialization already in progress');
        return false;
    }

    isInitializingSession = true;
    if (!isReconnect) {
        sendToRenderer('session-initializing', true);
    }

    // Store params for reconnection
    if (!isReconnect) {
        sessionParams = { apiKey, customPrompt, profile, language };
        reconnectAttempts = 0;
        resumeHandle = null;
        pendingAudio = [];
        pendingAudioMs = 0;
        loudMsWithoutTranscript = 0;
    }

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    // Get enabled tools first to determine Google Search status
    const enabledTools = await getEnabledTools();
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);

    const systemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled);
    currentSystemPrompt = systemPrompt; // Store for Groq

    // Initialize new conversation session only on first connect
    if (!isReconnect) {
        initializeNewSession(profile, customPrompt);
    }

    const generation = ++generationCounter;

    try {
        const session = await client.live.connect({
            model: getConfig().geminiLiveModel,
            callbacks: {
                onopen: function () {
                    logTransportEvent('gemini.live.opened', {});
                    sendToRenderer('update-status', 'Live session connected');
                },
                onmessage: function (message) {
                    if (generation < liveGeneration) return; // a replaced connection
                    console.log('----------------', message);

                    // Google's resume code: lets the next connection carry on this same session
                    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
                        resumeHandle = message.sessionResumptionUpdate.newHandle;
                    }
                    // Google's warning that this connection is about to be closed: swap to a fresh one now
                    if (message.goAway) {
                        logTransportEvent('gemini.live.go-away', message.goAway);
                        handoverToFreshConnection('go-away');
                    }
                    if (message.usageMetadata) liveTurnUsage = message.usageMetadata;
                    logTransportEvent('gemini.live.message', message);

                    // Handle input transcription (what was spoken)
                    if (message.serverContent?.inputTranscription?.results) {
                        currentTranscription += formatSpeakerResults(message.serverContent.inputTranscription.results);
                    } else if (message.serverContent?.inputTranscription?.text) {
                        const text = message.serverContent.inputTranscription.text;
                        if (text.trim() !== '') {
                            currentTranscription += text;
                        }
                    }

                    if (message.serverContent?.inputTranscription) {
                        loudMsWithoutTranscript = 0;
                        restartQuestionEndTimer();
                    }

                    // With a text answer model, only our own silence timer decides the question has ended: the Live
                    // model often "replies" after a short pause in the middle of a long question. Without one, the
                    // Live model replying (or finishing) is the signal.
                    if (
                        message.serverContent?.modelTurn ||
                        message.serverContent?.outputTranscription ||
                        message.serverContent?.generationComplete ||
                        message.serverContent?.turnComplete
                    ) {
                        if (!usesTextAnswers()) {
                            sendFinalTranscription();
                        } else if (!questionEndTimer && currentTranscription.trim() !== '') {
                            restartQuestionEndTimer();
                        }
                    }

                    if (!usesTextAnswers() && message.serverContent?.outputTranscription?.text) {
                        const isFirstChunk = messageBuffer === '';
                        if (isFirstChunk) {
                            announceQuestion(currentTranscription.trim() || lastTypedQuestion);
                            lastTypedQuestion = '';
                        }
                        messageBuffer += message.serverContent.outputTranscription.text;
                        sendToRenderer(isFirstChunk ? 'new-response' : 'update-response', messageBuffer);
                    }

                    if (message.serverContent?.generationComplete && !usesTextAnswers()) {
                        if (currentTranscription.trim() !== '') {
                            if (!usesTextAnswers() && messageBuffer.trim() !== '') {
                                saveConversationTurn(currentTranscription, messageBuffer);
                            }
                            currentTranscription = '';
                        }
                        messageBuffer = '';
                    }

                    if (message.serverContent?.turnComplete) {
                        flushLiveUsage();
                        messageBuffer = '';
                        if (!usesTextAnswers()) {
                            clearQuestionEndTimer();
                            currentTranscription = '';
                            groqRequestStartedForTurn = false;
                            sendToRenderer('update-status', 'Listening...');
                        }
                    }
                },
                onerror: function (e) {
                    console.log('Session error:', e.message);
                    logTransportEvent('gemini.live.error', {
                        error: e.message,
                    });
                    sendToRenderer('update-status', 'Error: ' + e.message);
                },
                onclose: function (e) {
                    if (generation < liveGeneration) return; // a replaced connection closing is expected
                    console.log('Session closed:', e.reason);
                    liveConnected = false;
                    flushLiveUsage();
                    logTransportEvent('gemini.live.closed', {
                        reason: e.reason,
                    });

                    // Don't reconnect if user intentionally closed
                    if (isUserClosing) {
                        isUserClosing = false;
                        closeTransportLog();
                        sendToRenderer('update-status', 'Session closed');
                        return;
                    }

                    // Attempt reconnection
                    if (sessionParams) {
                        attemptReconnect();
                    } else {
                        closeTransportLog();
                        sendToRenderer('update-status', 'Session closed');
                    }
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                proactivity: { proactiveAudio: true },
                outputAudioTranscription: {},
                tools: enabledTools,
                realtimeInputConfig: getRealtimeInputConfig(),
                // Enable speaker diarization
                inputAudioTranscription: {
                    enableSpeakerDiarization: true,
                    minSpeakerCount: 2,
                    maxSpeakerCount: 2,
                },
                contextWindowCompression: { slidingWindow: {} },
                // Lets a new connection carry on the same session (Google's own advice for long calls)
                sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
                speechConfig: { languageCode: language },
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
            },
        });

        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        liveGeneration = generation;
        liveConnected = true;
        startLiveWatchdog();
        return session;
    } catch (error) {
        console.error('Failed to initialize Gemini session:', error);
        // A stale resume code can be the reason the connection is refused: forget it for the next try
        if (resumeHandle) resumeHandle = null;
        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return null;
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function backoffDelay(attempt) {
    const base = RECONNECT_BACKOFF_MS[Math.min(attempt - 1, RECONNECT_BACKOFF_MS.length - 1)];
    // A little randomness so many users do not all retry at the same moment
    return Math.round(base * (0.75 + Math.random() * 0.5));
}

// Opens a new live connection, makes it the active one, and replays the audio heard while we had none.
async function openReplacementConnection() {
    const usedResumeHandle = !!resumeHandle;
    const session = await initializeGeminiSession(
        sessionParams.apiKey,
        sessionParams.customPrompt,
        sessionParams.profile,
        sessionParams.language,
        true // isReconnect
    );
    if (!session || !global.geminiSessionRef) return false;

    const oldSession = global.geminiSessionRef.current;
    global.geminiSessionRef.current = session;
    if (oldSession && oldSession !== session) {
        try {
            oldSession.close();
        } catch (e) {
            // already closed
        }
    }

    // With a resume code Google already holds the conversation, so only paste it back when we started fresh
    if (!usedResumeHandle) {
        const contextMessage = buildContextMessage();
        if (contextMessage) {
            try {
                console.log('Restoring conversation context...');
                await session.sendRealtimeInput({ text: contextMessage });
            } catch (contextError) {
                console.error('Failed to restore context:', contextError);
                // Continue without context - better than failing
            }
        }
    }

    reconnectAttempts = 0;
    drainPendingAudio(); // not awaited: live audio keeps flowing in order behind it
    return true;
}

// Connection dropped: keep trying (with growing waits) for up to two minutes, keeping what was heard meanwhile.
async function attemptReconnect() {
    if (liveReconnecting) return false;
    liveReconnecting = true;
    liveConnected = false;
    const startedAt = Date.now();
    let attempt = 0;

    // The question being asked is kept: the transcript is not cleared, only the unfinished reply
    messageBuffer = '';

    try {
        while (sessionParams && Date.now() - startedAt < RECONNECT_GIVE_UP_MS) {
            attempt++;
            reconnectAttempts = attempt;
            sendToRenderer('update-status', `Connection lost. Reconnecting (try ${attempt})... what you hear is being kept.`);
            await sleep(backoffDelay(attempt));
            if (!sessionParams) return false; // the user ended the session while we waited

            try {
                if (await openReplacementConnection()) {
                    sendToRenderer('update-status', 'Back online. Listening...');
                    console.log(`Session reconnected successfully after ${attempt} ${attempt === 1 ? 'try' : 'tries'}`);
                    return true;
                }
            } catch (error) {
                console.error(`Reconnection attempt ${attempt} failed:`, error);
            }
        }
    } finally {
        liveReconnecting = false;
    }

    if (sessionParams) {
        console.error('Gave up reconnecting after 2 minutes');
        sendToRenderer('reconnect-failed', {
            message: "Couldn't get the connection back after 2 minutes. Check your internet, then tap Reconnect. Nothing you said was lost from the saved notes.",
            canRetry: true,
        });
    }
    return false;
}

// Moves to a fresh connection before the old one dies (Google's go-away warning, or the watchdog noticing a stall).
// Audio keeps flowing to the old connection until the new one is ready, so nothing is missed.
async function handoverToFreshConnection(reason) {
    if (liveReconnecting || !sessionParams) return false;
    liveReconnecting = true;
    try {
        console.log(`Handing over to a fresh live connection (${reason})`);
        if (await openReplacementConnection()) {
            if (reason !== 'go-away') sendToRenderer('update-status', 'Connection refreshed. Listening...');
            return true;
        }
    } catch (error) {
        console.error(`Handover (${reason}) failed:`, error);
    } finally {
        liveReconnecting = false;
    }
    // The fresh connection could not be made: fall back to the normal reconnect loop
    liveConnected = false;
    return attemptReconnect();
}

// Called from the Reconnect button after the app gave up
async function reconnectNow() {
    if (!sessionParams) return false;
    return attemptReconnect();
}

// ---- Audio that cannot be sent yet is kept and replayed ----
function audioChunkMs(data, mimeType) {
    const rate = Number((/rate=(\d+)/.exec(mimeType || '') || [])[1]) || 24000;
    const bytes = (data.length * 3) / 4;
    return (bytes / 2 / rate) * 1000;
}

function audioLooksLoud(data) {
    try {
        const buf = Buffer.from(data, 'base64');
        let sum = 0;
        let n = 0;
        for (let i = 0; i + 1 < buf.length; i += 20) {
            const v = buf.readInt16LE(i);
            sum += v * v;
            n++;
        }
        return n > 0 && Math.sqrt(sum / n) > LOUD_RMS;
    } catch (e) {
        return false;
    }
}

function queueAudio(data, mimeType) {
    const ms = audioChunkMs(data, mimeType);
    pendingAudio.push({ data, mimeType, ms });
    pendingAudioMs += ms;
    while (pendingAudioMs > AUDIO_REPLAY_MAX_MS && pendingAudio.length > 1) {
        pendingAudioMs -= pendingAudio.shift().ms;
    }
}

async function drainPendingAudio() {
    if (drainingPendingAudio) return;
    drainingPendingAudio = true;
    try {
        while (pendingAudio.length > 0 && liveConnected) {
            const chunk = pendingAudio.shift();
            pendingAudioMs -= chunk.ms;
            const session = global.geminiSessionRef?.current;
            if (!session) {
                pendingAudio.unshift(chunk);
                pendingAudioMs += chunk.ms;
                break;
            }
            try {
                await session.sendRealtimeInput({ audio: { data: chunk.data, mimeType: chunk.mimeType } });
            } catch (error) {
                pendingAudio.unshift(chunk);
                pendingAudioMs += chunk.ms;
                break;
            }
            await sleep(AUDIO_REPLAY_GAP_MS); // a little faster than real time, not a flood
        }
    } finally {
        drainingPendingAudio = false;
    }
}

// The one place live call audio is sent from. Returns { success }.
async function pushLiveAudio(geminiSessionRef, data, mimeType, marker = '.') {
    if (!sessionParams) {
        // No call in progress
        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };
    }
    if (audioLooksLoud(data)) loudMsWithoutTranscript += audioChunkMs(data, mimeType);

    // Not connected right now, or older audio is still being replayed: keep it, in order
    if (!liveConnected || !geminiSessionRef.current || drainingPendingAudio) {
        if (sessionParams) {
            queueAudio(data, mimeType);
            return { success: true, queued: true };
        }
        return { success: false, error: 'No active Gemini session' };
    }

    try {
        process.stdout.write(marker);
        await geminiSessionRef.current.sendRealtimeInput({ audio: { data, mimeType } });
        return { success: true };
    } catch (error) {
        console.error('Error sending audio to Gemini:', error);
        if (sessionParams) {
            // The connection is probably gone. Keep this audio; the close event starts the reconnect,
            // and if that never comes the watchdog catches it.
            liveConnected = false;
            queueAudio(data, mimeType);
            if (!liveReconnecting) attemptReconnect();
            return { success: true, queued: true };
        }
        return { success: false, error: error.message };
    }
}

// ---- Watchdog: notices a connection that has frozen without any error ----
function startLiveWatchdog() {
    if (liveWatchdogTimer) return;
    liveWatchdogTimer = setInterval(() => {
        if (!sessionParams || !liveConnected || liveReconnecting) return;
        if (Date.now() - lastWatchdogReconnectAt < WATCHDOG_MIN_GAP_MS) return;

        let reason = '';
        try {
            // Audio piling up inside the socket means it is not getting through
            const buffered = global.geminiSessionRef?.current?.conn?.ws?.bufferedAmount || 0;
            if (buffered > WATCHDOG_BUFFERED_BYTES) reason = 'audio is stuck';
        } catch (e) {
            // internal detail of the Google library; ignore if it is not there
        }
        // Loud call audio for a good while but not one word came back
        if (!reason && loudMsWithoutTranscript > WATCHDOG_LOUD_MS_NO_WORDS) reason = 'no words came back';

        if (reason) {
            console.warn(`Watchdog: ${reason}, refreshing the connection`);
            lastWatchdogReconnectAt = Date.now();
            loudMsWithoutTranscript = 0;
            sendToRenderer('update-status', 'Connection looks stuck. Refreshing...');
            handoverToFreshConnection('watchdog');
        }
    }, WATCHDOG_INTERVAL_MS);
}

function stopLiveWatchdog() {
    if (liveWatchdogTimer) clearInterval(liveWatchdogTimer);
    liveWatchdogTimer = null;
    liveConnected = false;
    pendingAudio = [];
    pendingAudioMs = 0;
}

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        console.log('Checking for existing SystemAudioDump processes...');

        // Kill any existing SystemAudioDump processes
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });

        killProc.on('close', code => {
            if (code === 0) {
                console.log('Killed existing SystemAudioDump processes');
            } else {
                console.log('No existing SystemAudioDump processes found');
            }
            resolve();
        });

        killProc.on('error', err => {
            console.log('Error checking for existing processes (this is normal):', err.message);
            resolve();
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            killProc.kill();
            resolve();
        }, 2000);
    });
}

async function startMacOSAudioCapture(geminiSessionRef) {
    if (process.platform !== 'darwin') return false;

    // Kill any existing SystemAudioDump processes first
    await killExistingSystemAudioDump();

    console.log('Starting macOS audio capture with SystemAudioDump...');

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    console.log('SystemAudioDump path:', systemAudioPath);

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
        },
    };

    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        console.error('Failed to start SystemAudioDump');
        return false;
    }

    console.log('SystemAudioDump started with PID:', systemAudioProc.pid);

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;

            if (currentProviderMode === 'cloud') {
                sendCloudAudio(monoChunk);
            } else if (currentProviderMode === 'local') {
                getLocalAi().processLocalAudio(monoChunk);
            } else {
                const base64Data = monoChunk.toString('base64');
                sendAudioToGemini(base64Data, geminiSessionRef);
            }

            if (process.env.DEBUG_AUDIO) {
                console.log(`Processed audio chunk: ${chunk.length} bytes`);
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        console.error('SystemAudioDump stderr:', data.toString());
    });

    systemAudioProc.on('close', code => {
        console.log('SystemAudioDump process closed with code:', code);
        systemAudioProc = null;
    });

    systemAudioProc.on('error', err => {
        console.error('SystemAudioDump process error:', err);
        systemAudioProc = null;
    });

    return true;
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }

    return monoBuffer;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        console.log('Stopping SystemAudioDump...');
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

async function sendAudioToGemini(base64Data, geminiSessionRef) {
    await pushLiveAudio(geminiSessionRef, base64Data, 'audio/pcm;rate=24000', '.');
}

// Writes post-session notes (what was asked, how it went, what to study) from the saved conversation
async function generateSessionNotes(sessionId) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return { success: false, error: 'Add your Gemini API key in Settings first.' };
    }
    const session = getSession(sessionId);
    const turns = session?.conversationHistory || [];
    if (!turns.length) {
        return { success: false, error: 'This session has no conversation to summarise.' };
    }

    // Keep the most recent part if the session is very long
    const MAX_CHARS = 60000;
    let transcript = turns.map((turn, i) => `Q${i + 1}: ${turn.transcription}\nAnswer given by the assistant: ${turn.ai_response}`).join('\n\n');
    if (transcript.length > MAX_CHARS) transcript = transcript.slice(-MAX_CHARS);

    const prompt = `Below is the record of a live session (such as an interview). Each item has a question that was heard and the answer the assistant suggested. Write short post-session notes in plain text, with these headings and nothing else:

Summary: two or three sentences on how the session went.
Questions asked: a numbered list, one line each, with a few words on the answer given.
What went well:
What to improve:
Topics to study before next time:
Follow-ups: things to send, ask or do after the session.

Use only what is in the record. If a heading has nothing to say, write "None". Do not use markdown symbols such as ** or #.

Record:
${transcript}`;

    const model = getAvailableModel();
    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({ model, contents: prompt });
        recordUsage('notes', model, response.usageMetadata);
        const text = (response.text || '').trim();
        if (!text) {
            return { success: false, error: 'The AI returned no notes. Try again.' };
        }
        const notes = { text, model, generatedAt: Date.now() };
        saveSession(sessionId, { notes });
        return { success: true, notes };
    } catch (error) {
        console.error('Error generating session notes:', error);
        return { success: false, error: error.message };
    }
}

async function sendImageToGeminiHttp(base64Data, prompt) {
    // Get available model based on rate limits
    const model = getAvailableModel();

    const apiKey = getApiKey();
    if (!apiKey) {
        return { success: false, error: 'No API key configured' };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const contents = [
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                },
            },
            { text: prompt },
        ];

        console.log(`Sending image to ${model} (streaming)...`);
        const response = await ai.models.generateContentStream({
            model: model,
            contents: contents,
        });

        // Increment count after successful call
        incrementLimitCount(model);

        // Stream the response
        let fullText = '';
        let isFirst = true;
        let imageUsage = null;
        for await (const chunk of response) {
            if (chunk.usageMetadata) imageUsage = chunk.usageMetadata;
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                // Send to renderer - new response for first chunk, update for subsequent
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                isFirst = false;
            }
        }

        recordUsage('screenshot', model, imageUsage);
        console.log(`Image response completed from ${model}`);

        // Save screen analysis to history
        saveScreenAnalysis(prompt, fullText, model);

        return { success: true, text: fullText, model: model };
    } catch (error) {
        console.error('Error sending image to Gemini HTTP:', error);
        return { success: false, error: error.message };
    }
}

function setupGeminiIpcHandlers(geminiSessionRef) {
    // Store the geminiSessionRef globally for reconnection access
    global.geminiSessionRef = geminiSessionRef;

    ipcMain.handle('initialize-cloud', async (event, token, profile, userContext) => {
        try {
            currentProviderMode = 'cloud';
            initializeNewSession(profile);
            setOnTurnComplete((transcription, response) => {
                saveConversationTurn(transcription, response);
            });
            sendToRenderer('session-initializing', true);
            await connectCloud(token, profile, userContext);
            sendToRenderer('session-initializing', false);
            return true;
        } catch (err) {
            console.error('[Cloud] Init error:', err);
            currentProviderMode = 'byok';
            sendToRenderer('session-initializing', false);
            return false;
        }
    });

    ipcMain.handle('initialize-gemini', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        currentProviderMode = 'byok';
        const session = await initializeGeminiSession(apiKey, customPrompt, profile, language);
        if (session) {
            geminiSessionRef.current = session;
            return true;
        }
        return false;
    });

    ipcMain.handle('initialize-local', async (event, localLlmModel, whisperModel, profile, customPrompt) => {
        currentProviderMode = 'local';
        const success = await getLocalAi().initializeLocalSession(localLlmModel, whisperModel, profile, customPrompt);
        if (!success) {
            currentProviderMode = 'byok';
        }
        return success;
    });

    ipcMain.handle('cancel-local-initialization', async () => {
        const cancelled = await getLocalAi().cancelLocalInitialization();
        if (cancelled) {
            currentProviderMode = 'byok';
        }
        return cancelled;
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        if (currentProviderMode === 'cloud') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                sendCloudAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'local') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                getLocalAi().processLocalAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending local audio:', error);
                return { success: false, error: error.message };
            }
        }
        return pushLiveAudio(geminiSessionRef, data, mimeType, '.');
    });

    // Handle microphone audio on a separate channel
    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        if (currentProviderMode === 'cloud') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                sendCloudAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        if (currentProviderMode === 'local') {
            try {
                const pcmBuffer = Buffer.from(data, 'base64');
                getLocalAi().processLocalAudio(pcmBuffer);
                return { success: true };
            } catch (error) {
                console.error('Error sending local mic audio:', error);
                return { success: false, error: error.message };
            }
        }
        return pushLiveAudio(geminiSessionRef, data, mimeType, ',');
    });

    ipcMain.handle('send-image-content', async (event, { data, prompt }) => {
        try {
            if (!data || typeof data !== 'string') {
                console.error('Invalid image data received');
                return { success: false, error: 'Invalid image data' };
            }

            const buffer = Buffer.from(data, 'base64');

            if (buffer.length < 1000) {
                console.error(`Image buffer too small: ${buffer.length} bytes`);
                return { success: false, error: 'Image buffer too small' };
            }

            process.stdout.write('!');
            announceQuestion('📷 Screen capture');

            if (currentProviderMode === 'cloud') {
                const sent = sendCloudImage(data);
                if (!sent) {
                    return { success: false, error: 'Cloud connection not active' };
                }
                return { success: true, model: 'cloud' };
            }

            if (currentProviderMode === 'local') {
                const result = await getLocalAi().sendLocalImage(data, prompt);
                return result;
            }

            const result = hasGroqKey() ? await sendImageToGroq(data, prompt) : await sendImageToGeminiHttp(data, prompt);
            return result;
        } catch (error) {
            console.error('Error sending image:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { success: false, error: 'Invalid text message' };
        }

        if (currentProviderMode === 'cloud') {
            try {
                console.log('Sending text to cloud:', text);
                sendCloudText(text.trim());
                return { success: true };
            } catch (error) {
                console.error('Error sending cloud text:', error);
                return { success: false, error: error.message };
            }
        }

        if (currentProviderMode === 'local') {
            try {
                console.log('Sending text to local Llama:', text);
                return await getLocalAi().sendLocalText(text.trim());
            } catch (error) {
                console.error('Error sending local text:', error);
                return { success: false, error: error.message };
            }
        }

        if (!geminiSessionRef.current) return { success: false, error: 'No active Gemini session' };

        try {
            console.log('Sending text message:', text);

            if (usesTextAnswers()) {
                groqRequestStartedForTurn = true;
                sendQuestionToAnswerModel(text.trim());
            } else {
                lastTypedQuestion = text.trim();
            }

            await geminiSessionRef.current.sendRealtimeInput({ text: text.trim() });
            return { success: true };
        } catch (error) {
            console.error('Error sending text:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-macos-audio', async event => {
        if (process.platform !== 'darwin') {
            return {
                success: false,
                error: 'macOS audio capture only available on macOS',
            };
        }

        try {
            const success = await startMacOSAudioCapture(geminiSessionRef);
            return { success };
        } catch (error) {
            console.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async event => {
        try {
            stopMacOSAudioCapture();
            return { success: true };
        } catch (error) {
            console.error('Error stopping macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async event => {
        try {
            stopMacOSAudioCapture();

            if (currentProviderMode === 'cloud') {
                closeCloud();
                currentProviderMode = 'byok';
                closeTransportLog();
                return { success: true };
            }

            if (currentProviderMode === 'local') {
                getLocalAi().closeLocalSession();
                currentProviderMode = 'byok';
                closeTransportLog();
                return { success: true };
            }

            clearQuestionEndTimer();

            // Set flag to prevent reconnection attempts
            isUserClosing = true;
            sessionParams = null;
            stopLiveWatchdog();

            // Cleanup session
            if (geminiSessionRef.current) {
                await geminiSessionRef.current.close();
                geminiSessionRef.current = null;
            } else {
                closeTransportLog();
            }

            return { success: true };
        } catch (error) {
            console.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('reconnect-live', async () => ({ success: await reconnectNow() }));

    ipcMain.handle('rework-answer', async (event, request) => {
        reworkAnswer(request || {});
        return { success: true };
    });

    ipcMain.handle('generate-session-notes', async (event, sessionId) => {
        return generateSessionNotes(sessionId);
    });

    // Conversation history IPC handlers
    ipcMain.handle('get-current-session', async event => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            console.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async event => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            console.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            console.log('Google Search setting updated to:', enabled);
            // The setting is already saved in the preferences file by the renderer
            // This is just for logging/confirmation
            return { success: true };
        } catch (error) {
            console.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });
}

// Lets the tests shorten the waits
function _setLiveTimingForTests(t) {
    if (t.giveUpMs !== undefined) RECONNECT_GIVE_UP_MS = t.giveUpMs;
    if (t.backoffMs) RECONNECT_BACKOFF_MS = t.backoffMs;
    if (t.replayGapMs !== undefined) AUDIO_REPLAY_GAP_MS = t.replayGapMs;
    if (t.watchdogIntervalMs !== undefined) WATCHDOG_INTERVAL_MS = t.watchdogIntervalMs;
    if (t.watchdogLoudMs !== undefined) WATCHDOG_LOUD_MS_NO_WORDS = t.watchdogLoudMs;
    if (t.watchdogMinGapMs !== undefined) WATCHDOG_MIN_GAP_MS = t.watchdogMinGapMs;
}

module.exports = {
    _setLiveTimingForTests,
    initializeGeminiSession,
    getEnabledTools,
    getStoredSetting,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
    killExistingSystemAudioDump,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    sendAudioToGemini,
    sendImageToGeminiHttp,
    setupGeminiIpcHandlers,
    formatSpeakerResults,
};

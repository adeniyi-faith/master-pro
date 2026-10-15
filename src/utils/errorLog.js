const fs = require('fs');
const path = require('path');
const { getConfigDir } = require('../storage');

// A small record of what went wrong, shown on the "Error log" screen and saved next to the settings.
const MAX_ENTRIES = 300;
const MAX_FILE_BYTES = 500 * 1024;
const entries = [];
let nextId = 1;
let installed = false;

function logFilePath() {
    return path.join(getConfigDir(), 'error-log.txt');
}

// Turns anything thrown or logged (Error, string, object) into plain text
function describe(value) {
    if (value instanceof Error) {
        const stack = (value.stack || '').split('\n').slice(0, 6).join('\n');
        return { message: `${value.name}: ${value.message}`, detail: stack };
    }
    if (typeof value === 'string') return { message: value, detail: '' };
    try {
        return { message: JSON.stringify(value), detail: '' };
    } catch {
        return { message: String(value), detail: '' };
    }
}

function addEntry(source, args, extraDetail = '') {
    const parts = args.map(describe);
    const message = parts.map(p => p.message).join(' ').slice(0, 1000);
    const detail = [...parts.map(p => p.detail), extraDetail].filter(Boolean).join('\n').slice(0, 3000);
    const entry = { id: nextId++, time: Date.now(), source, message, detail };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
    try {
        fs.appendFileSync(logFilePath(), `[${new Date(entry.time).toISOString()}] [${source}] ${message}${detail ? '\n' + detail : ''}\n`);
    } catch {
        // the file is a bonus; the in-app list still works
    }
    return entry;
}

function installErrorLogging() {
    if (installed) return;
    installed = true;
    try {
        const file = logFilePath();
        if (fs.existsSync(file) && fs.statSync(file).size > MAX_FILE_BYTES) fs.writeFileSync(file, '');
    } catch {
        // ignore
    }

    const originalError = console.error.bind(console);
    console.error = (...args) => {
        originalError(...args);
        addEntry('app', args);
    };
    process.on('unhandledRejection', reason => addEntry('app (unhandled)', [reason]));
    process.on('uncaughtExceptionMonitor', error => addEntry('app (crash)', [error]));
}

function getEntries() {
    return entries.slice().reverse();
}

function clearEntries() {
    entries.length = 0;
    try {
        fs.writeFileSync(logFilePath(), '');
    } catch {
        // ignore
    }
}

module.exports = { installErrorLogging, addEntry, getEntries, clearEntries };

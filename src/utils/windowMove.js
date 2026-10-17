// Lets the user move the window by double-clicking and dragging, and resize it from its edges.
// The window itself is moved by the main process (see window.js); this file only reports mouse actions.

const { ipcRenderer } = require('electron');

const DOUBLE_CLICK_MS = 400;
const HANDLE_SIZE = 10; // thickness of the invisible resize strips, in pixels
const CORNER_SIZE = 20;

// Things you click or type in. Pressing on these never starts a window drag.
const INTERACTIVE = 'input, textarea, select, button, a, label, summary, [contenteditable="true"], [role="button"]';

function isInteractive(event) {
    return event.composedPath().some(node => node instanceof Element && node.matches(INTERACTIVE));
}

const HANDLES = [
    { edge: 'top', cursor: 'ns-resize', style: `top:0;left:${CORNER_SIZE}px;right:${CORNER_SIZE}px;height:${HANDLE_SIZE}px` },
    { edge: 'bottom', cursor: 'ns-resize', style: `bottom:0;left:${CORNER_SIZE}px;right:${CORNER_SIZE}px;height:${HANDLE_SIZE}px` },
    { edge: 'left', cursor: 'ew-resize', style: `left:0;top:${CORNER_SIZE}px;bottom:${CORNER_SIZE}px;width:${HANDLE_SIZE}px` },
    { edge: 'right', cursor: 'ew-resize', style: `right:0;top:${CORNER_SIZE}px;bottom:${CORNER_SIZE}px;width:${HANDLE_SIZE}px` },
    { edge: 'top-left', cursor: 'nwse-resize', style: `top:0;left:0;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px` },
    { edge: 'top-right', cursor: 'nesw-resize', style: `top:0;right:0;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px` },
    { edge: 'bottom-left', cursor: 'nesw-resize', style: `bottom:0;left:0;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px` },
    { edge: 'bottom-right', cursor: 'nwse-resize', style: `bottom:0;right:0;width:${CORNER_SIZE}px;height:${CORNER_SIZE}px` },
];

let dragging = false;
let installed = false;
let bubbleEl = null;

const PRESS_MOVE_LIMIT = 5; // a press that moves less than this many pixels counts as a click

// The small round icon shown while the app is collapsed. Press and drag to move it, click to bring the app back.
function setUpBubble() {
    bubbleEl = document.createElement('div');
    bubbleEl.title = 'Click to bring SoftMaster back';
    bubbleEl.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;' +
        'border-radius:50%;background:#1f6feb;color:#fff;font:700 22px sans-serif;cursor:pointer;' +
        'user-select:none;-webkit-app-region:no-drag;box-shadow:inset 0 0 0 3px rgba(255,255,255,.6)';
    bubbleEl.textContent = 'SM';
    let pressAt = null;
    bubbleEl.addEventListener('mousedown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        pressAt = { x: event.screenX, y: event.screenY };
        dragging = true;
        ipcRenderer.send('window-drag-start');
    });
    window.addEventListener(
        'mouseup',
        event => {
            if (!pressAt) return;
            const moved = Math.hypot(event.screenX - pressAt.x, event.screenY - pressAt.y);
            pressAt = null;
            endDrag();
            if (moved < PRESS_MOVE_LIMIT) ipcRenderer.send('window-expand');
        },
        true
    );
    document.body.appendChild(bubbleEl);

    ipcRenderer.on('bubble-mode', (event, on) => {
        bubbleEl.style.display = on ? 'flex' : 'none';
        for (const el of document.querySelectorAll('[data-window-chrome]')) el.style.display = on ? 'none' : '';
        document.documentElement.style.background = on ? 'transparent' : '';
    });
}

// A small always-visible strip at the top-left: a grip to move the window with one press-and-drag,
// a button that collapses the app into the bubble, one that hides it and one that quits.
const ICON_SVG = {
    grip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>',
    collapse: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    hide: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>',
    quit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function addMoveGrip() {
    const bar = document.createElement('div');
    bar.dataset.windowChrome = '1';
    bar.style.cssText =
        'position:fixed;top:6px;left:12px;z-index:2147483646;display:flex;gap:2px;' +
        'align-items:center;padding:2px;border-radius:10px;background:rgba(30,30,30,.55);-webkit-app-region:no-drag;opacity:.85';
    const buttonStyle =
        'display:flex;align-items:center;justify-content:center;min-width:32px;height:30px;padding:0 6px;border:0;border-radius:8px;' +
        'background:transparent;color:#ddd;cursor:pointer;user-select:none;font:600 13px sans-serif';
    const makeButton = (icon, title) => {
        const button = document.createElement('button');
        button.title = title;
        button.innerHTML = ICON_SVG[icon];
        button.style.cssText = buttonStyle;
        button.addEventListener('mouseenter', () => (button.style.background = 'rgba(255,255,255,.14)'));
        button.addEventListener('mouseleave', () => (button.style.background = button.dataset.armed ? '#d33' : 'transparent'));
        return button;
    };

    const grip = makeButton('grip', 'Press and drag to move the window');
    grip.style.cursor = 'move';
    grip.addEventListener('mousedown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragging = true;
        ipcRenderer.send('window-drag-start');
    });

    const collapse = makeButton('collapse', 'Minimize to a small icon (click the icon to bring the app back)');
    collapse.addEventListener('click', () => ipcRenderer.send('window-collapse'));

    const hide = makeButton('hide', 'Hide the app completely (press the show/hide shortcut, Ctrl+\\ by default, to bring it back)');
    hide.addEventListener('click', () => ipcRenderer.send('window-hide'));

    // Quitting takes two clicks so it cannot happen by accident in the middle of a session
    const quit = makeButton('quit', 'Quit the app completely');
    let quitTimer = null;
    const quitIdle = () => {
        quit.innerHTML = ICON_SVG.quit;
        quit.title = 'Quit the app completely';
        delete quit.dataset.armed;
        quit.style.background = 'transparent';
        quit.style.color = '#ddd';
    };
    quit.addEventListener('click', () => {
        if (quitTimer) {
            ipcRenderer.send('app-quit');
            return;
        }
        quit.textContent = 'Quit?';
        quit.title = 'Click again to quit';
        quit.dataset.armed = '1';
        quit.style.background = '#d33';
        quit.style.color = '#fff';
        quitTimer = setTimeout(() => {
            quitTimer = null;
            quitIdle();
        }, 3000);
    });
    bar.append(grip, collapse, hide, quit);
    document.body.appendChild(bar);
}

function endDrag() {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    ipcRenderer.send('window-drag-end');
}

function addResizeHandles() {
    for (const { edge, cursor, style } of HANDLES) {
        const handle = document.createElement('div');
        handle.dataset.resizeEdge = edge;
        handle.dataset.windowChrome = '1';
        handle.style.cssText = `position:fixed;z-index:2147483647;cursor:${cursor};-webkit-app-region:no-drag;${style}`;
        handle.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            dragging = true;
            document.body.style.userSelect = 'none';
            ipcRenderer.send('window-resize-start', edge);
        });
        document.body.appendChild(handle);
    }
}

function setUpWindowMove() {
    if (installed) return;
    installed = true;

    // Double-click and hold, then drag: the second press starts moving the window
    let lastPress = 0;
    document.addEventListener(
        'mousedown',
        event => {
            if (event.button !== 0 || isInteractive(event)) return;
            const now = Date.now();
            const isSecondPress = now - lastPress <= DOUBLE_CLICK_MS;
            lastPress = isSecondPress ? 0 : now;
            if (!isSecondPress) return;
            event.preventDefault();
            dragging = true;
            document.body.style.userSelect = 'none';
            ipcRenderer.send('window-drag-start');
        },
        true
    );

    window.addEventListener('mouseup', endDrag, true);
    window.addEventListener('blur', endDrag);
    window.addEventListener('dragend', endDrag);

    addResizeHandles();
    addMoveGrip();
    setUpBubble();
}

module.exports = { setUpWindowMove };

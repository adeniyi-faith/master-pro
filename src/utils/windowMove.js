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
}

module.exports = { setUpWindowMove };

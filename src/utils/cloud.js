// A hosted mode (sending audio to a hosted service) used to live here. SoftMaster PRO does not use one:
// audio and text go only to the AI provider the user chose and its own key. These stand-ins keep the
// rest of the app working without any hosted connection.

let onTurnComplete = null;

function setOnTurnComplete(callback) {
    onTurnComplete = callback;
}

function connectCloud() {
    return Promise.reject(new Error('Hosted mode is not available in this app'));
}

function sendCloudAudio() {}

function sendCloudText() {}

function sendCloudImage() {
    return false;
}

function closeCloud() {
    onTurnComplete = null;
}

function isCloudActive() {
    return false;
}

module.exports = {
    connectCloud,
    sendCloudAudio,
    sendCloudText,
    sendCloudImage,
    closeCloud,
    isCloudActive,
    setOnTurnComplete,
};

import { buildZip, toBase64 } from './lib/zip.js';

const key = (tabId) => `job:${tabId}`;

function safeName(name) {
  const s = String(name || 'Echo360 transcripts.zip')
    .replace(/[\\/:*?"<>|\u0000-\u001f~]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();
  return s.toLowerCase().endsWith('.zip') ? s : `${s}.zip`;
}

async function saveZip({ zipName, files }) {
  if (!Array.isArray(files) || !files.length) throw new Error('Nothing to save.');
  const bytes = await buildZip(files);
  const url = `data:application/zip;base64,${toBase64(bytes)}`;
  const filename = safeName(zipName);
  const downloadId = await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
  return { ok: true, downloadId, filename, bytes: bytes.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  if (msg.type === 'echoTx:progress' && sender.tab) {
    // Remember the latest state so the popup can show it after being reopened.
    chrome.storage.session.set({ [key(sender.tab.id)]: { ...msg.state, frameId: sender.frameId } }).catch(() => {});
    return false;
  }

  if (msg.type === 'echoTx:saveZip') {
    saveZip(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true; // async response
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(key(tabId)).catch(() => {});
});

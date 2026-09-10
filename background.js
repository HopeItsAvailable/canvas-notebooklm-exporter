// background.js — MV3 Service Worker (classic type)
// All event listeners registered synchronously at top level.

// --- Dependency Loading via importScripts ---
// Each file is wrapped in an IIFE and exports to self._xxx to avoid global scope collisions.

importScripts('lib/jszip.min.js');
// JSZip self-registers as self.JSZip in browser environments

importScripts('src/cleaner.js');
// cleaner.js exports to self._cleaner

importScripts('src/pipeline.js');
// pipeline.js exports to self._pipeline, reads self._cleaner and self.JSZip internally

var processAssets = self._pipeline.processAssets;

console.log('[Canvas NB Exporter] Service worker loaded OK');

// --- Message Listener (registered synchronously at top level) ---
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'export') {
    runExport(message.assets, message.modulePrefix);
  }
  return false;
});

// --- Port-based progress for popup ---
var popupPort = null;

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'export-progress') {
    popupPort = port;
    port.onDisconnect.addListener(function() {
      popupPort = null;
    });
  }
});

function sendProgress(text, done) {
  console.log('[Progress]', text);
  if (popupPort) {
    try {
      popupPort.postMessage({ type: 'progress', text: text, done: !!done });
    } catch (e) {
      popupPort = null;
    }
  }
}

async function runExport(assets, modulePrefix) {
  try {
    sendProgress('Starting export of ' + assets.length + ' items...');

    var fetchFn = async function(url) {
      sendProgress('Downloading: ' + url.split('/').pop().split('?')[0] + '...');
      var response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch ' + url + ': ' + response.status + ' ' + response.statusText);
      }
      return await response.arrayBuffer();
    };

    sendProgress('Processing assets...');
    var processedFiles = await processAssets(assets, modulePrefix, fetchFn);

    sendProgress('Saving ' + processedFiles.length + ' files...');

    for (var i = 0; i < processedFiles.length; i++) {
      var file = processedFiles[i];
      sendProgress('Saving ' + (i + 1) + '/' + processedFiles.length + ': ' + file.filename);

      // Convert content to data: URL (URL.createObjectURL not available in service workers)
      var dataUrl;
      if (typeof file.content === 'string') {
        dataUrl = 'data:' + file.mimeType + ';base64,' + btoa(unescape(encodeURIComponent(file.content)));
      } else {
        var bytes = new Uint8Array(file.content);
        var binary = '';
        for (var j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j]);
        }
        dataUrl = 'data:' + file.mimeType + ';base64,' + btoa(binary);
      }

      await new Promise(function(resolve, reject) {
        chrome.downloads.download({
          url: dataUrl,
          filename: file.relativePath,
          saveAs: false
        }, function(downloadId) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(downloadId);
          }
        });
      });
    }

    sendProgress('Done! ' + processedFiles.length + ' files saved to Downloads/notebookLM/', true);
  } catch (err) {
    console.error('[Canvas NB Exporter] Export error:', err);
    sendProgress('Error: ' + err.message, true);
  }
}

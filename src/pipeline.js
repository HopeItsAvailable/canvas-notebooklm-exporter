(function() {
// Resolve cleanSubtitles depending on environment
function _getCleanSubtitles() {
  if (typeof self !== 'undefined' && self._cleaner) return self._cleaner.cleanSubtitles;
  if (typeof require !== 'undefined') return require('./cleaner.js').cleanSubtitles;
  throw new Error('cleanSubtitles not available');
}

function classifyZipEntry(filename) {
  if (!filename) return null;
  var match = filename.match(/\.([a-zA-Z0-9]+)$/i);
  if (!match) return null;
  var ext = match[1].toLowerCase();
  if (['vtt', 'srt', 'txt'].includes(ext)) return 'transcript';
  if (['pdf', 'pptx', 'docx', 'doc', 'ppt'].includes(ext)) return 'document';
  return null;
}

function buildRelativePath(modulePrefix, filename) {
  return 'notebookLM/' + modulePrefix + '_' + filename;
}

async function processAssets(assets, modulePrefix, fetchFn) {
  var processedFiles = [];

  for (var asset of assets) {
    if (asset.category === 'archive') {
      var buffer = await fetchFn(asset.url);
      var JSZip = (typeof self !== 'undefined' && self.JSZip) || (typeof window !== 'undefined' && window.JSZip) || require('../lib/jszip.min.js');
      var zip = await JSZip.loadAsync(buffer);

      for (var [path, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        
        var entryName = zipEntry.name.split('/').pop();
        var classification = classifyZipEntry(entryName);

        if (classification === 'transcript') {
          var text = await zipEntry.async('string');
          var cleaned = _getCleanSubtitles()(text);
          var newName = entryName.replace(/\.[a-zA-Z0-9]+$/i, '.txt');
          processedFiles.push({
            filename: newName,
            relativePath: buildRelativePath(modulePrefix, newName),
            content: cleaned,
            mimeType: 'text/plain'
          });
        } else if (classification === 'document') {
          var content = await zipEntry.async('arraybuffer');
          processedFiles.push({
            filename: entryName,
            relativePath: buildRelativePath(modulePrefix, entryName),
            content: content,
            mimeType: 'application/octet-stream'
          });
        }
      }
    } else if (asset.category === 'transcript') {
      var buffer = await fetchFn(asset.url);
      var text = new TextDecoder('utf-8').decode(buffer);
      var cleaned = _getCleanSubtitles()(text);
      var newName = asset.title || 'transcript.txt';
      newName = newName.replace(/\.[a-zA-Z0-9]+$/i, '.txt');
      if (!newName.endsWith('.txt')) newName += '.txt';
      
      processedFiles.push({
        filename: newName,
        relativePath: buildRelativePath(modulePrefix, newName),
        content: cleaned,
        mimeType: 'text/plain'
      });
    } else if (asset.category === 'document') {
      var buffer = await fetchFn(asset.url);
      var filename = asset.title || 'document.pdf';
      processedFiles.push({
        filename: filename,
        relativePath: buildRelativePath(modulePrefix, filename),
        content: buffer,
        mimeType: 'application/octet-stream'
      });
    }
  }

  return processedFiles;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { processAssets: processAssets, buildRelativePath: buildRelativePath, classifyZipEntry: classifyZipEntry };
}
if (typeof self !== 'undefined') {
  self._pipeline = { processAssets: processAssets, buildRelativePath: buildRelativePath, classifyZipEntry: classifyZipEntry };
}
})();

(function() {
function cleanSubtitles(rawText) {
  if (!rawText) return "";

  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let rawBlocks = text.split(/\n{2,}/);
  let finalBlocks = [];
  let lastBlockLines = [];
  
  let hasAnyTimestamps = rawBlocks.some(block => /\d.*-->.*\d/.test(block));

  for (let block of rawBlocks) {
    let lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) continue;

    let timestampIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->') && /\d.*-->.*\d/.test(lines[i])) {
        timestampIndex = i;
        break;
      }
    }

    let textLinesRaw = [];
    if (timestampIndex !== -1) {
      textLinesRaw = lines.slice(timestampIndex + 1);
    } else {
      if (hasAnyTimestamps) {
        continue;
      } else {
        textLinesRaw = lines;
      }
    }

    let currentLines = [];
    for (let line of textLinesRaw) {
      let cleanLine = line.replace(/<[^>]+>/g, '').trim();
      if (cleanLine && cleanLine !== currentLines[currentLines.length - 1]) {
        currentLines.push(cleanLine);
      }
    }

    if (currentLines.length === 0) continue;

    let overlapCount = 0;
    let maxOverlap = Math.min(lastBlockLines.length, currentLines.length);
    for (let len = maxOverlap; len > 0; len--) {
      let match = true;
      for (let i = 0; i < len; i++) {
        if (lastBlockLines[lastBlockLines.length - len + i] !== currentLines[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        overlapCount = len;
        break;
      }
    }

    let newLines = currentLines.slice(overlapCount);

    if (newLines.length > 0) {
      finalBlocks.push(newLines.join(' '));
    }
    
    lastBlockLines = currentLines;
  }

  return finalBlocks.join('\n\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanSubtitles };
}
if (typeof self !== 'undefined') {
  self._cleaner = { cleanSubtitles: cleanSubtitles };
}
})();

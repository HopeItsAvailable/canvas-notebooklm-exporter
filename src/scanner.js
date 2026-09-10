/**
 * scanner.js
 * Canvas Page Scanner and Link Resolver
 */

/**
 * Extracts module prefix from Canvas page title, breadcrumbs, or heading elements.
 * @param {Document} document - Mock or real DOM document
 * @returns {string} - Module prefix like 'Module-4' or 'Unknown-Module'
 */
function extractModulePrefix(document) {
  let textToSearch = '';
  
  const titleEl = document.querySelector('title');
  if (titleEl) textToSearch += titleEl.textContent + ' ';
  
  const breadcrumbs = document.querySelectorAll('#breadcrumbs, .ic-app-crumbs, .breadcrumbs');
  breadcrumbs.forEach(el => textToSearch += el.textContent + ' ');
  
  const headings = document.querySelectorAll('h1, h2');
  headings.forEach(el => textToSearch += el.textContent + ' ');

  const match = textToSearch.match(/Module[- ]?\d+/i);
  if (match) {
    // Normalize to Module-X with capital M
    const parts = match[0].split(/[- ]/);
    return 'Module-' + parts[1];
  }

  return 'Unknown-Module';
}

/**
 * Transforms Canvas file URLs into direct download endpoints.
 * @param {string} href - The link href
 * @param {string} baseUrl - The base URL of the page
 * @returns {string} - Resolved direct download URL
 */
function resolveCanvasDownloadUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    const pathname = url.pathname;
    
    // Check if it looks like a Canvas file link
    if (pathname.includes('/files/')) {
       // If it already ends with /download, ensure params
       if (pathname.endsWith('/download')) {
           url.searchParams.set('download_frd', '1');
       } else {
           // Otherwise, remove wrap and append /download
           url.searchParams.delete('wrap');
           url.pathname = pathname + '/download';
           url.searchParams.set('download_frd', '1');
       }
    }
    
    return url.href;
  } catch (e) {
    return href; // Fallback to original
  }
}

/**
 * Extracts extension from filename, text, or URL string.
 * Supports dot extensions and word markers (e.g. "Transcript (VTT)").
 * @param {string} str
 * @returns {string | null}
 */
function extractExtension(str) {
  if (!str) return null;
  // Match standard file extension with a dot, e.g. .vtt, .srt, .zip, .pdf
  const dotMatch = str.match(/\.(vtt|srt|txt|zip|pdf|pptx|docx|doc|ppt)\b/i);
  if (dotMatch) return dotMatch[1].toLowerCase();

  // Word match for transcript formats in titles/labels (e.g. "Transcript (VTT)", "[SRT]")
  const wordMatch = str.match(/\b(vtt|srt)\b/i);
  if (wordMatch) return wordMatch[1].toLowerCase();

  return null;
}

/**
 * Categorizes a file or string by its extension.
 * @param {string} filename 
 * @returns {'archive' | 'transcript' | 'document' | null}
 */
function categorizeByExtension(filename) {
  if (!filename) return null;
  const ext = extractExtension(filename);
  if (!ext) return null;
  
  if (['zip'].includes(ext)) return 'archive';
  if (['vtt', 'srt', 'txt'].includes(ext)) return 'transcript';
  if (['pdf', 'pptx', 'docx', 'doc', 'ppt'].includes(ext)) return 'document';
  
  return null;
}

/**
 * Scans a DOM document for all download links and subtitle tracks,
 * categorizes them, and returns an array of DiscoveredAsset objects.
 * @param {Document} document 
 * @param {string} baseUrl 
 * @returns {Array<Object>}
 */
function scanPageForAssets(document, baseUrl) {
  const assets = [];
  let idCounter = 1;

  // 1. Scan links: a[href]
  const links = document.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    
    const textContent = (link.textContent || '').trim();
    const titleAttr = link.getAttribute('title') || '';
    const ariaLabel = link.getAttribute('aria-label') || '';
    const downloadAttr = link.getAttribute('download') || '';
    const apiEndpoint = link.getAttribute('data-api-endpoint') || '';

    // Inspect candidates in priority order
    const candidates = [textContent, titleAttr, ariaLabel, downloadAttr, apiEndpoint];
    let detectedCategory = null;
    let detectedExt = '';

    for (const cand of candidates) {
      if (!cand) continue;
      const cat = categorizeByExtension(cand);
      if (cat) {
        detectedCategory = cat;
        detectedExt = extractExtension(cand);
        break;
      }
    }

    // If text/attributes didn't have extension, check URL path and search params
    if (!detectedCategory) {
      try {
        const urlObj = new URL(href, baseUrl);
        const urlString = urlObj.pathname + urlObj.search;
        const cat = categorizeByExtension(urlString);
        if (cat) {
          detectedCategory = cat;
          detectedExt = extractExtension(urlString);
        }
      } catch (e) {
        const cat = categorizeByExtension(href);
        if (cat) {
          detectedCategory = cat;
          detectedExt = extractExtension(href);
        }
      }
    }

    if (detectedCategory) {
      let title = textContent || titleAttr || ariaLabel;
      if (!title) {
        try {
          title = new URL(href, baseUrl).pathname.split('/').pop();
        } catch(e) {
          title = href;
        }
      }
      // Clean up common Canvas badge clutter like " (123 KB)" or "(opens in a new tab)"
      title = title.replace(/\s*\(\d+(\.\d+)?\s*(KB|MB|B|GB)\)/i, '')
                   .replace(/\s*\((opens|this link) in [^)]*\)/i, '')
                   .trim();

      const resolvedUrl = resolveCanvasDownloadUrl(href, baseUrl);
      
      // Prevent duplicates by URL
      const isDuplicate = assets.some(a => a.url === resolvedUrl);
      if (!isDuplicate) {
        assets.push({
          id: 'asset-' + (idCounter++),
          title: title,
          url: resolvedUrl,
          category: detectedCategory,
          originalExtension: detectedExt
        });
      }
    }
  });

  // 2. Scan HTML5 track elements: track[src]
  const tracks = document.querySelectorAll('track[src], track[data-src]');
  tracks.forEach(track => {
    const src = track.getAttribute('src') || track.getAttribute('data-src');
    if (!src) return;

    const label = track.getAttribute('label') || track.getAttribute('title') || 'Transcript';
    const title = label.toLowerCase().endsWith('.vtt') ? label : `${label}.vtt`;
    const resolvedUrl = resolveCanvasDownloadUrl(src, baseUrl);

    const isDuplicate = assets.some(a => a.url === resolvedUrl);
    if (!isDuplicate) {
      assets.push({
        id: 'asset-' + (idCounter++),
        title: title,
        url: resolvedUrl,
        category: 'transcript',
        originalExtension: 'vtt'
      });
    }
  });

  return assets;
}

module.exports = {
  extractModulePrefix,
  resolveCanvasDownloadUrl,
  extractExtension,
  categorizeByExtension,
  scanPageForAssets
};

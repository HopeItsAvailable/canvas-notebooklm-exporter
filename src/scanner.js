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
 * Categorizes a file by its extension.
 * @param {string} filename 
 * @returns {'archive' | 'transcript' | 'document' | null}
 */
function categorizeByExtension(filename) {
  if (!filename) return null;
  const match = filename.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  if (!match) return null;
  
  const ext = match[1].toLowerCase();
  
  if (['zip'].includes(ext)) return 'archive';
  if (['vtt', 'srt', 'txt'].includes(ext)) return 'transcript';
  if (['pdf', 'pptx', 'docx', 'doc', 'ppt'].includes(ext)) return 'document';
  
  return null;
}

/**
 * Scans a DOM document for all download links, categorizes them, and returns an array of DiscoveredAsset objects.
 * @param {Document} document 
 * @param {string} baseUrl 
 * @returns {Array<Object>}
 */
function scanPageForAssets(document, baseUrl) {
  const links = document.querySelectorAll('a[href]');
  const assets = [];
  let idCounter = 1;

  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    
    const textContent = (link.textContent || '').trim();
    const titleAttr = link.getAttribute('title') || '';
    
    // Determine the filename to check for extension
    let filenameToCheck = '';
    if (categorizeByExtension(textContent)) {
      filenameToCheck = textContent;
    } else if (categorizeByExtension(titleAttr)) {
      filenameToCheck = titleAttr;
    } else {
      try {
        filenameToCheck = new URL(href, baseUrl).pathname;
      } catch (e) {
        filenameToCheck = href;
      }
    }
    
    const category = categorizeByExtension(filenameToCheck);
    if (category) {
      const originalExtensionMatch = filenameToCheck.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
      const originalExtension = originalExtensionMatch ? originalExtensionMatch[1].toLowerCase() : '';
      
      let title = textContent || titleAttr;
      if (!title) {
         try {
             title = new URL(href, baseUrl).pathname.split('/').pop();
         } catch(e) {
             title = href;
         }
      }

      const resolvedUrl = resolveCanvasDownloadUrl(href, baseUrl);
      
      // Prevent duplicates by URL
      const isDuplicate = assets.some(a => a.url === resolvedUrl);
      if (!isDuplicate) {
        assets.push({
          id: 'asset-' + (idCounter++),
          title: title,
          url: resolvedUrl,
          category: category,
          originalExtension: originalExtension
        });
      }
    }
  });

  return assets;
}

module.exports = {
  extractModulePrefix,
  resolveCanvasDownloadUrl,
  categorizeByExtension,
  scanPageForAssets
};

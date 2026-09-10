// content-scanner.js
// Injected by popup.js to scan the active Canvas tab.

(() => {
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
      const parts = match[0].split(/[- ]/);
      return 'Module-' + parts[1];
    }
  
    return 'Unknown-Module';
  }

  function resolveCanvasDownloadUrl(href, baseUrl) {
    try {
      const url = new URL(href, baseUrl);
      const pathname = url.pathname;
      
      if (pathname.includes('/files/')) {
         if (pathname.endsWith('/download')) {
             url.searchParams.set('download_frd', '1');
         } else {
             url.searchParams.delete('wrap');
             url.pathname = pathname + '/download';
             url.searchParams.set('download_frd', '1');
         }
      }
      
      return url.href;
    } catch (e) {
      return href; 
    }
  }

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

  function scanPageForAssets(document, baseUrl) {
    const links = document.querySelectorAll('a[href]');
    const assets = [];
    let idCounter = 1;
  
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      
      const textContent = (link.textContent || '').trim();
      const titleAttr = link.getAttribute('title') || '';
      
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

  return {
    modulePrefix: extractModulePrefix(document),
    assets: scanPageForAssets(document, location.href)
  };
})();

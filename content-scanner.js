// content-scanner.js
// Injected by popup.js to scan the active Canvas tab.
// Async IIFE to allow resolving Canvas file metadata when links don't have extensions in their text.

(async () => {
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

  function extractExtension(str) {
    if (!str) return null;
    const dotMatch = str.match(/\.(vtt|srt|txt|zip|pdf|pptx|docx|doc|ppt)\b/i);
    if (dotMatch) return dotMatch[1].toLowerCase();

    const wordMatch = str.match(/\b(vtt|srt)\b/i);
    if (wordMatch) return wordMatch[1].toLowerCase();

    return null;
  }

  function categorizeByExtension(filename) {
    if (!filename) return null;
    const ext = extractExtension(filename);
    if (!ext) return null;
    
    if (['zip'].includes(ext)) return 'archive';
    if (['vtt', 'srt', 'txt'].includes(ext)) return 'transcript';
    if (['pdf', 'pptx', 'docx', 'doc', 'ppt'].includes(ext)) return 'document';
    
    return null;
  }

  async function scanDoc(doc, baseUrl, assets, state) {
    if (!doc) return;

    const links = doc.querySelectorAll('a[href]');
    const unresolvedCanvasLinks = [];

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      
      const textContent = (link.textContent || '').trim();
      const titleAttr = link.getAttribute('title') || '';
      const ariaLabel = link.getAttribute('aria-label') || '';
      const downloadAttr = link.getAttribute('download') || '';

      const candidates = [textContent, titleAttr, ariaLabel, downloadAttr];
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

      const resolvedUrl = resolveCanvasDownloadUrl(href, baseUrl);

      if (detectedCategory) {
        let title = textContent || titleAttr || ariaLabel;
        if (!title) {
          try {
            title = new URL(href, baseUrl).pathname.split('/').pop();
          } catch(e) {
            title = href;
          }
        }
        title = title.replace(/\s*\(\d+(\.\d+)?\s*(KB|MB|B|GB)\)/i, '')
                     .replace(/\s*\((opens|this link) in [^)]*\)/i, '')
                     .trim();

        const isDuplicate = assets.some(a => a.url === resolvedUrl);
        if (!isDuplicate) {
          assets.push({
            id: 'asset-' + (state.idCounter++),
            title: title,
            url: resolvedUrl,
            category: detectedCategory,
            originalExtension: detectedExt
          });
        }
      } else if (href.includes('/files/')) {
        // Canvas file link with no visible extension in text or title
        // e.g. "Hidden Markov Models: Formulation" pointing to /files/132797764?wrap=1
        const isDuplicate = assets.some(a => a.url === resolvedUrl) ||
                            unresolvedCanvasLinks.some(u => u.resolvedUrl === resolvedUrl);
        if (!isDuplicate) {
          unresolvedCanvasLinks.push({
            link,
            href,
            resolvedUrl,
            title: textContent || titleAttr || ariaLabel || 'Canvas File',
            apiEndpoint: link.getAttribute('data-api-endpoint')
          });
        }
      }
    });

    // Resolve any Canvas file links by querying Canvas File API endpoint
    if (unresolvedCanvasLinks.length > 0) {
      await Promise.all(unresolvedCanvasLinks.map(async item => {
        let apiEndpoint = item.apiEndpoint;
        if (!apiEndpoint) {
          const match = item.href.match(/\/files\/(\d+)/);
          if (match) {
            apiEndpoint = `/api/v1/files/${match[1]}`;
          }
        }
        if (!apiEndpoint) return;

        try {
          const res = await fetch(apiEndpoint, { credentials: 'include' });
          if (!res.ok) return;
          const data = await res.json();
          const realName = data.filename || data.display_name || '';
          const contentType = (data['content-type'] || '').toLowerCase();

          let cat = categorizeByExtension(realName);
          let ext = extractExtension(realName);

          if (!cat && contentType.includes('vtt')) {
            cat = 'transcript';
            ext = 'vtt';
          } else if (!cat && contentType.includes('srt')) {
            cat = 'transcript';
            ext = 'srt';
          } else if (!cat && (contentType.includes('pdf') || contentType.includes('presentation'))) {
            cat = 'document';
            ext = 'pdf';
          }

          if (cat) {
            const isDuplicate = assets.some(a => a.url === item.resolvedUrl);
            if (!isDuplicate) {
              assets.push({
                id: 'asset-' + (state.idCounter++),
                title: item.title || realName,
                url: item.resolvedUrl,
                category: cat,
                originalExtension: ext || 'vtt'
              });
            }
          }
        } catch (err) {
          console.warn('[Canvas NB Exporter] Error resolving file metadata:', item.href, err);
        }
      }));
    }

    // 2. Scan HTML5 track elements: track[src]
    const tracks = doc.querySelectorAll('track[src], track[data-src]');
    tracks.forEach(track => {
      const src = track.getAttribute('src') || track.getAttribute('data-src');
      if (!src) return;

      const label = track.getAttribute('label') || track.getAttribute('title') || 'Transcript';
      const title = label.toLowerCase().endsWith('.vtt') ? label : `${label}.vtt`;
      const resolvedUrl = resolveCanvasDownloadUrl(src, baseUrl);

      const isDuplicate = assets.some(a => a.url === resolvedUrl);
      if (!isDuplicate) {
        assets.push({
          id: 'asset-' + (state.idCounter++),
          title: title,
          url: resolvedUrl,
          category: 'transcript',
          originalExtension: 'vtt'
        });
      }
    });
  }

  async function scanPageForAssets(doc, baseUrl) {
    const assets = [];
    const state = { idCounter: 1 };

    await scanDoc(doc, baseUrl, assets, state);

    // Also scan accessible same-origin iframes
    const iframes = doc.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          await scanDoc(iframeDoc, baseUrl, assets, state);
        }
      } catch (e) {
        // Cross-origin iframe
      }
    }

    return assets;
  }

  const modulePrefix = extractModulePrefix(document);
  const assets = await scanPageForAssets(document, location.href);

  const results = {
    modulePrefix: modulePrefix,
    assets: assets
  };

  console.log('[Canvas NB Exporter] Scanner finished. Found:', results);
  return results;
})();

const test = require('node:test');
const assert = require('node:assert');
const {
  extractModulePrefix,
  resolveCanvasDownloadUrl,
  categorizeByExtension,
  scanPageForAssets
} = require('../src/scanner');

test('categorizeByExtension', (t) => {
  assert.strictEqual(categorizeByExtension('lecture.zip'), 'archive');
  assert.strictEqual(categorizeByExtension('captions.vtt'), 'transcript');
  assert.strictEqual(categorizeByExtension('notes.txt'), 'transcript');
  assert.strictEqual(categorizeByExtension('slides.pdf'), 'document');
  assert.strictEqual(categorizeByExtension('presentation.pptx'), 'document');
  assert.strictEqual(categorizeByExtension('doc.docx?download=1'), 'document');
  assert.strictEqual(categorizeByExtension('unknown.exe'), null);
  assert.strictEqual(categorizeByExtension('noextension'), null);
});

test('resolveCanvasDownloadUrl', (t) => {
  const baseUrl = 'https://canvas.edu';
  
  // Transform wrap=1 to download_frd=1
  assert.strictEqual(
    resolveCanvasDownloadUrl('/courses/1/files/123?wrap=1', baseUrl),
    'https://canvas.edu/courses/1/files/123/download?download_frd=1'
  );
  
  // Already has download, should ensure download_frd=1
  assert.strictEqual(
    resolveCanvasDownloadUrl('/files/456/download', baseUrl),
    'https://canvas.edu/files/456/download?download_frd=1'
  );

  assert.strictEqual(
    resolveCanvasDownloadUrl('/files/456/download?download_frd=1', baseUrl),
    'https://canvas.edu/files/456/download?download_frd=1'
  );

  // Non-canvas URL shouldn't be altered other than resolving against base
  assert.strictEqual(
    resolveCanvasDownloadUrl('https://example.com/file.pdf', baseUrl),
    'https://example.com/file.pdf'
  );
});

test('extractModulePrefix', (t) => {
  const createMockDocument = (title, breadcrumb, heading) => ({
    querySelector: (selector) => {
      if (selector === 'title' && title) return { textContent: title };
      return null;
    },
    querySelectorAll: (selector) => {
      if ((selector.includes('breadcrumbs') || selector.includes('.ic-app-crumbs')) && breadcrumb) return [{ textContent: breadcrumb }];
      if ((selector.includes('h1') || selector.includes('h2')) && heading) return [{ textContent: heading }];
      return [];
    }
  });

  // From title
  assert.strictEqual(
    extractModulePrefix(createMockDocument('Module 4: Overview', '', '')),
    'Module-4'
  );

  // From breadcrumb
  assert.strictEqual(
    extractModulePrefix(createMockDocument('', 'Courses > Bio 101 > Module-10 > Notes', '')),
    'Module-10'
  );

  // From heading
  assert.strictEqual(
    extractModulePrefix(createMockDocument('', '', 'Welcome to module 2')),
    'Module-2'
  );

  // Fallback
  assert.strictEqual(
    extractModulePrefix(createMockDocument('Some Page', 'Home', 'Heading')),
    'Unknown-Module'
  );
});

test('scanPageForAssets', (t) => {
  const mockLinks = [
    { href: '/courses/1/files/100?wrap=1', textContent: 'slides.pdf', title: '' },
    { href: '/courses/1/files/101', textContent: 'Download Archive', title: 'materials.zip' },
    { href: 'https://external.com/captions.vtt', textContent: 'Subtitles', title: '' },
    { href: '/courses/1/pages/ignore-me', textContent: 'Module Page', title: '' },
    { href: '/courses/1/files/100?wrap=1', textContent: 'Duplicate PDF', title: '' } // Duplicate URL
  ];

  const mockDocument = {
    querySelectorAll: (selector) => {
      if (selector === 'a[href]') {
        return mockLinks.map(l => ({
          getAttribute: (attr) => attr === 'href' ? l.href : (attr === 'title' ? l.title : null),
          textContent: l.textContent
        }));
      }
      return [];
    }
  };

  const baseUrl = 'https://canvas.edu';
  const assets = scanPageForAssets(mockDocument, baseUrl);

  assert.strictEqual(assets.length, 3, 'Should discover 3 unique valid assets');

  // Check the PDF
  const pdfAsset = assets.find(a => a.id === 'asset-1');
  assert.strictEqual(pdfAsset.title, 'slides.pdf');
  assert.strictEqual(pdfAsset.url, 'https://canvas.edu/courses/1/files/100/download?download_frd=1');
  assert.strictEqual(pdfAsset.category, 'document');
  assert.strictEqual(pdfAsset.originalExtension, 'pdf');

  // Check the ZIP
  const zipAsset = assets.find(a => a.id === 'asset-2');
  assert.strictEqual(zipAsset.title, 'Download Archive'); // It uses textContent if available, but wait, textContent does not have extension.
  // Actually, our logic says if textContent has extension, use it for filename. It doesn't, so it checks title.
  // Title has .zip, so category is archive.
  assert.strictEqual(zipAsset.url, 'https://canvas.edu/courses/1/files/101/download?download_frd=1');
  assert.strictEqual(zipAsset.category, 'archive');
  assert.strictEqual(zipAsset.originalExtension, 'zip');

  // Check the VTT
  const vttAsset = assets.find(a => a.id === 'asset-3');
  assert.strictEqual(vttAsset.title, 'Subtitles');
  assert.strictEqual(vttAsset.url, 'https://external.com/captions.vtt');
  assert.strictEqual(vttAsset.category, 'transcript');
  assert.strictEqual(vttAsset.originalExtension, 'vtt');
});

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
  // Edge cases with size badges and word markers
  assert.strictEqual(categorizeByExtension('lecture.vtt (14.2 KB)'), 'transcript');
  assert.strictEqual(categorizeByExtension('Module 4 Video 1.vtt\n(50 KB)'), 'transcript');
  assert.strictEqual(categorizeByExtension('Video Transcript (VTT)'), 'transcript');
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
  assert.strictEqual(zipAsset.title, 'Download Archive');
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

test('scanPageForAssets - Canvas VTT variations', (t) => {
  const mockElements = {
    'a[href]': [
      {
        href: '/courses/258697/files/132797807?wrap=1',
        textContent: 'Lecture 4 Transcript.vtt (14.2 KB)',
        title: '',
        ariaLabel: ''
      },
      {
        href: '/courses/258697/files/132797808?wrap=1',
        textContent: 'Video 2 Captions (VTT)',
        title: '',
        ariaLabel: ''
      }
    ],
    'track[src], track[data-src]': [
      {
        src: '/courses/258697/files/132797809/download',
        label: 'English Captions'
      }
    ]
  };

  const mockDocument = {
    querySelectorAll: (selector) => {
      if (mockElements[selector]) {
        return mockElements[selector].map(item => ({
          getAttribute: (attr) => item[attr] || null,
          textContent: item.textContent || ''
        }));
      }
      return [];
    }
  };

  const assets = scanPageForAssets(mockDocument, 'https://canvas.asu.edu');
  assert.strictEqual(assets.length, 3, 'Should discover all 3 VTT transcripts');
  assert.strictEqual(assets[0].category, 'transcript');
  assert.strictEqual(assets[0].originalExtension, 'vtt');
  assert.strictEqual(assets[0].title, 'Lecture 4 Transcript.vtt');

  assert.strictEqual(assets[1].category, 'transcript');
  assert.strictEqual(assets[1].originalExtension, 'vtt');

  assert.strictEqual(assets[2].category, 'transcript');
  assert.strictEqual(assets[2].originalExtension, 'vtt');
  assert.strictEqual(assets[2].title, 'English Captions.vtt');
});

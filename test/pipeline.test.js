const test = require('node:test');
const assert = require('node:assert');
const { processAssets, buildRelativePath, classifyZipEntry } = require('../src/pipeline.js');
const JSZip = require('../lib/jszip.min.js');

test('classifyZipEntry', (t) => {
  assert.strictEqual(classifyZipEntry('test.vtt'), 'transcript');
  assert.strictEqual(classifyZipEntry('test.srt'), 'transcript');
  assert.strictEqual(classifyZipEntry('test.txt'), 'transcript');
  assert.strictEqual(classifyZipEntry('test.pdf'), 'document');
  assert.strictEqual(classifyZipEntry('test.pptx'), 'document');
  assert.strictEqual(classifyZipEntry('test.docx'), 'document');
  assert.strictEqual(classifyZipEntry('test.jpg'), null);
  assert.strictEqual(classifyZipEntry('no-extension'), null);
});

test('buildRelativePath', (t) => {
  assert.strictEqual(buildRelativePath('Module-1', 'file.txt'), 'notebookLM/Module-1_file.txt');
  assert.strictEqual(buildRelativePath('Unknown-Module', 'test.pdf'), 'notebookLM/Unknown-Module_test.pdf');
});

test('processAssets with archive, transcript, and document', async (t) => {
  const assets = [
    {
      id: '1',
      title: 'archive.zip',
      url: 'http://test/archive.zip',
      category: 'archive',
      originalExtension: 'zip'
    },
    {
      id: '2',
      title: 'video.vtt',
      url: 'http://test/video.vtt',
      category: 'transcript',
      originalExtension: 'vtt'
    },
    {
      id: '3',
      title: 'slides.pdf',
      url: 'http://test/slides.pdf',
      category: 'document',
      originalExtension: 'pdf'
    }
  ];

  const fetchFn = async (url) => {
    if (url === 'http://test/archive.zip') {
      const zip = new JSZip();
      zip.file('inner.pdf', new Uint8Array([1, 2, 3]));
      zip.file('sub/inner.vtt', 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello');
      zip.file('ignore.jpg', new Uint8Array([255]));
      return await zip.generateAsync({ type: 'arraybuffer' });
    }
    if (url === 'http://test/video.vtt') {
      return new TextEncoder().encode('WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nWorld').buffer;
    }
    if (url === 'http://test/slides.pdf') {
      return new Uint8Array([4, 5, 6]).buffer;
    }
    throw new Error('Not found: ' + url);
  };

  const results = await processAssets(assets, 'Module-2', fetchFn);

  assert.strictEqual(results.length, 4);

  // archive -> inner.pdf
  const pdfEntry = results.find(r => r.filename === 'inner.pdf');
  assert.ok(pdfEntry);
  assert.strictEqual(pdfEntry.relativePath, 'notebookLM/Module-2_inner.pdf');
  assert.strictEqual(pdfEntry.mimeType, 'application/octet-stream');

  // archive -> inner.vtt -> inner.txt
  const txtEntry = results.find(r => r.filename === 'inner.txt');
  assert.ok(txtEntry);
  assert.strictEqual(txtEntry.relativePath, 'notebookLM/Module-2_inner.txt');
  assert.strictEqual(txtEntry.mimeType, 'text/plain');
  assert.strictEqual(txtEntry.content, 'Hello'); // Cleaned subtitle

  // transcript -> video.txt
  const videoTxt = results.find(r => r.filename === 'video.txt');
  assert.ok(videoTxt);
  assert.strictEqual(videoTxt.relativePath, 'notebookLM/Module-2_video.txt');
  assert.strictEqual(videoTxt.mimeType, 'text/plain');
  assert.strictEqual(videoTxt.content, 'World');

  // document -> slides.pdf
  const slidesPdf = results.find(r => r.filename === 'slides.pdf');
  assert.ok(slidesPdf);
  assert.strictEqual(slidesPdf.relativePath, 'notebookLM/Module-2_slides.pdf');
  assert.strictEqual(slidesPdf.mimeType, 'application/octet-stream');
});

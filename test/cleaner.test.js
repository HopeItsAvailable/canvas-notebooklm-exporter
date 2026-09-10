const test = require('node:test');
const assert = require('node:assert');
const { cleanSubtitles } = require('../src/cleaner');

test('cleanSubtitles - basic WebVTT', () => {
  const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello World

2
00:00:04.000 --> 00:00:06.000
This is a test.`;
  const result = cleanSubtitles(vtt);
  assert.strictEqual(result, 'Hello World\n\nThis is a test.');
});

test('cleanSubtitles - basic SRT', () => {
  const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:04,000 --> 00:00:06,000
This is a test.`;
  const result = cleanSubtitles(srt);
  assert.strictEqual(result, 'Hello World\n\nThis is a test.');
});

test('cleanSubtitles - rolling captions deduplication', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
First line

00:00:02.000 --> 00:00:03.000
First line
Second line

00:00:03.000 --> 00:00:04.000
Second line
Third line`;
  const result = cleanSubtitles(vtt);
  assert.strictEqual(result, 'First line\n\nSecond line\n\nThird line');
});

test('cleanSubtitles - inline tags removal', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Speaker Name>Hello <b>World</b></v>
<c.color>How are you?</c>`;
  const result = cleanSubtitles(vtt);
  assert.strictEqual(result, 'Hello World How are you?');
});

test('cleanSubtitles - empty input', () => {
  assert.strictEqual(cleanSubtitles(''), '');
  assert.strictEqual(cleanSubtitles(null), '');
});

test('cleanSubtitles - only headers', () => {
  const vtt = `WEBVTT
Kind: captions
Language: en`;
  const result = cleanSubtitles(vtt);
  assert.strictEqual(result, 'WEBVTT Kind: captions Language: en');
});

test('cleanSubtitles - millisecond format variations', () => {
  const vtt = `1
00:00:01.000 --> 00:00:04,000
Hello World

2
00:00:04.00 --> 00:00:06.00
This is a test.`;
  const result = cleanSubtitles(vtt);
  assert.strictEqual(result, 'Hello World\n\nThis is a test.');
});

test('cleanSubtitles - compact blocks and comments', () => {
  const vtt = `WEBVTT
Kind: captions

NOTE
This is a comment

1
00:00:01.000 --> 00:00:04.000
Hello World

2
00:00:04.000 --> 00:00:06.000
This is a test.`;
  const result = cleanSubtitles(vtt);
  assert.strictEqual(result, 'Hello World\n\nThis is a test.');
});

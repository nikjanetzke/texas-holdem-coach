const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('page declares the canonical Poker hostname', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/poker\.buildai\.nz\/" \/>/);
});

test('www redirects permanently while preserving path and query', async () => {
  const source = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
  const middleware = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const response = await middleware.onRequest({
    request: new Request('https://www.poker.buildai.nz/training/table?mode=beginner&hand=7'),
    next: () => Promise.reject(new Error('redirect request reached origin')),
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://poker.buildai.nz/training/table?mode=beginner&hand=7');
});

test('canonical hostname passes through unchanged', async () => {
  const source = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
  const middleware = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const expected = new Response('ok', { status: 200 });
  let called = false;
  const response = await middleware.onRequest({
    request: new Request('https://poker.buildai.nz/'),
    next: async () => { called = true; return expected; },
  });

  assert.equal(called, true);
  assert.equal(response, expected);
});
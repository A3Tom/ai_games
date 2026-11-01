import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { handlePreviewRequest, resolveAsset, resolvePreparedRoot, startPreview } from './serve.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fifa98-preview-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'prepared');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, status: 'reconstruction-only' }));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Invented preview</title>');
  return { directory, root };
}

class Response extends Writable {
  constructor() {
    super();
    this.headers = new Map();
    this.chunks = [];
    this.headersSent = false;
    this.on('error', () => {});
  }
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  writeHead(status, headers) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    this.headersSent = true;
    return this;
  }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
  get body() { return Buffer.concat(this.chunks); }
}

async function request(root, url, method = 'GET') {
  const response = new Response();
  await handlePreviewRequest(root, { url, method }, response);
  return response;
}

test('prepared root requires a regular manifest, reconstruction status and an index', async (t) => {
  const { root } = await fixture(t);
  assert.equal(await resolvePreparedRoot(root), root);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ status: 'playable' }));
  await assert.rejects(resolvePreparedRoot(root), /reconstruction-only/);
  await writeFile(path.join(root, 'manifest.json'), 'null');
  await assert.rejects(resolvePreparedRoot(root), /reconstruction-only/);
  await writeFile(path.join(root, 'manifest.json'), 'invalid json');
  await assert.rejects(resolvePreparedRoot(root), SyntaxError);
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ status: 'reconstruction-only' }));
  await rm(path.join(root, 'index.html'));
  await assert.rejects(resolvePreparedRoot(root), /not found/);
});

test('manifest cannot be a symlink to another output or an oversized file', async (t) => {
  const { root, directory } = await fixture(t);
  const outside = path.join(directory, 'manifest.json');
  await writeFile(outside, JSON.stringify({ status: 'reconstruction-only' }));
  await rm(path.join(root, 'manifest.json'));
  await symlink(outside, path.join(root, 'manifest.json'));
  await assert.rejects(resolvePreparedRoot(root), /manifest must remain inside/);
  await rm(path.join(root, 'manifest.json'));
  await writeFile(path.join(root, 'manifest.json'), ' '.repeat(1024 * 1024 + 1));
  await assert.rejects(resolvePreparedRoot(root), /1 MiB limit/);
});

test('asset resolver retains root confinement for traversal, encoding and symlinks', async (t) => {
  const { root, directory } = await fixture(t);
  const outside = path.join(directory, 'outside.txt');
  await writeFile(outside, 'must remain outside');
  await symlink(outside, path.join(root, 'alias.txt'));
  await symlink(directory, path.join(root, 'outside-directory'));
  await symlink(path.join(root, 'index.html'), path.join(root, 'inside.html'));
  for (const url of ['/../outside.txt', '/%2e%2e/outside.txt', '/assets/%2E%2E/index.html', '/%2f..%2foutside.txt', '/alias.txt', '/outside-directory/outside.txt']) {
    await assert.rejects(resolveAsset(root, url), (error) => error.status === 403, url);
  }
  for (const url of ['not-a-url', '//example.com/file', '/%zz', '/%00', '/%5c..%5cfile', '/C:%5cfile']) {
    await assert.rejects(resolveAsset(root, url), (error) => error.status === 400, url);
  }
  assert.equal((await resolveAsset(root, '/inside.html')).path, path.join(root, 'index.html'));
  assert.equal((await resolveAsset(root, '/index.html?reload=1#ignored')).path, path.join(root, 'index.html'));
});

test('BIN and CUE files are denied even with case changes, query strings and symlink aliases', async (t) => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, 'disc.bin'), 'invented disc bytes');
  await writeFile(path.join(root, 'disc.CUE'), 'invented descriptor');
  await symlink(path.join(root, 'disc.bin'), path.join(root, 'disguised.wasm'));
  for (const url of ['/disc.bin', '/disc.bin?x=1', '/disc.CUE', '/disc.%62in', '/disguised.wasm']) {
    await assert.rejects(resolveAsset(root, url), (error) => error.status === 403, url);
    const response = await request(root, url);
    assert.equal(response.statusCode, 403);
    assert.ok(!response.body.toString().includes('invented'));
  }
});

test('GET and HEAD deliver bytes and useful MIME types with no caching', async (t) => {
  const { root } = await fixture(t);
  const formats = [
    ['page.html', 'text/html; charset=utf-8'], ['runtime.js', 'text/javascript; charset=utf-8'],
    ['module.mjs', 'text/javascript; charset=utf-8'], ['style.css', 'text/css; charset=utf-8'],
    ['data.json', 'application/json; charset=utf-8'], ['native.wasm', 'application/wasm'],
    ['texture.png', 'image/png'], ['raw.dat', 'application/octet-stream'],
  ];
  for (const [name, type] of formats) {
    const data = Buffer.from(`invented contents for ${name}`);
    await writeFile(path.join(root, 'assets', name), data);
    const response = await request(root, `/assets/${name}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(response.headers.get('content-length'), data.length);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(response.body, data);
    const head = await request(root, `/assets/${name}`, 'HEAD');
    assert.equal(head.statusCode, 200);
    assert.equal(head.headers.get('content-length'), data.length);
    assert.equal(head.headers.get('content-type'), type);
    assert.equal(head.body.length, 0);
  }
  const index = await request(root, '/');
  assert.deepEqual(index.body, await readFile(path.join(root, 'index.html')));
  await writeFile(path.join(root, 'index.html'), 'updated mods');
  assert.equal((await request(root, '/')).body.toString(), 'updated mods');
  await writeFile(path.join(root, 'empty.txt'), '');
  const empty = await request(root, '/empty.txt');
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body.length, 0);
});

test('unsupported methods, missing assets and directory listings fail without exposing paths', async (t) => {
  const { root } = await fixture(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await request(root, '/', method);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(response.body.length, 0);
  }
  for (const url of ['/missing', '/assets', '/assets/', '/index.html/missing']) {
    const response = await request(root, url);
    assert.equal(response.statusCode, 404);
    assert.ok(!response.body.toString().includes(root));
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    const head = await request(root, url, 'HEAD');
    assert.equal(head.statusCode, 404);
    assert.equal(head.body.length, 0);
  }
});

test('server validates port and directory before listening', async (t) => {
  const { root } = await fixture(t);
  for (const port of [-1, 65536, 1.5, NaN, '5198']) {
    await assert.rejects(startPreview({ directory: root, port }), /Port must be an integer/);
  }
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ status: 'unsupported' }));
  await assert.rejects(startPreview({ directory: root, port: 0 }), /reconstruction-only/);
});

test('listening preview binds loopback, handles HTTP, and closes idempotently', async (t) => {
  const { root } = await fixture(t);
  let preview;
  try { preview = await startPreview({ directory: root, port: 0 }); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('The sandbox prohibits binding a local test socket; request and path tests still ran'); return; }
    throw error;
  }
  try {
    assert.equal(preview.server.address().address, '127.0.0.1');
    assert.match(preview.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const response = await fetch(preview.url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), await readFile(path.join(root, 'index.html'), 'utf8'));
    const head = await fetch(preview.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const denied = await fetch(preview.url, { method: 'POST' });
    assert.equal(denied.status, 405);
  } finally {
    const first = preview.close();
    assert.equal(preview.close(), first);
    await first;
  }
  assert.equal(preview.server.listening, false);
});

import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const defaultDirectory = fileURLToPath(new URL('../.work/web/', import.meta.url));
const sourceDirectory = fileURLToPath(new URL('../../../reference-games/', import.meta.url));
const HOST = '127.0.0.1';
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.wasm', 'application/wasm'],
  ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const within = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);
const discFile = (filename) => ['.bin', '.cue'].includes(path.extname(filename).toLowerCase());

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function openRegularFile(filename) {
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Expected a regular prepared file');
    return { handle, info };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/** Validate the prepared web directory before creating any listening socket. */
export async function resolvePreparedRoot(directory = defaultDirectory) {
  if (typeof directory !== 'string' || !directory) throw new TypeError('Supply a prepared web directory');
  const root = await realpath(directory);
  if (!(await stat(root)).isDirectory()) throw new Error('The prepared web root must be a directory');
  // An explicit --directory can select another generated output, never the
  // reference directory or one of its subdirectories through a symlink alias.
  const source = await realpath(sourceDirectory).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return sourceDirectory;
  });
  if (within(source, root)) throw new Error('The reference-games directory cannot be served');
  const manifestPath = await realpath(path.join(root, 'manifest.json'));
  if (!within(root, manifestPath)) throw new Error('The web manifest must remain inside the prepared directory');
  const { handle, info } = await openRegularFile(manifestPath);
  let manifest;
  try {
    if (info.size > 1024 * 1024) throw new Error('The web manifest exceeds the 1 MiB limit');
    manifest = JSON.parse(await handle.readFile('utf8'));
  } finally { await handle.close(); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifest.status !== 'reconstruction-only') {
    throw new Error('The web manifest must identify a prepared reconstruction-only build');
  }
  await resolveAsset(root, '/');
  return root;
}

/** Resolve one URL path without reading data or permitting paths outside root. */
export async function resolveAsset(root, requestUrl) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('Use an absolute prepared root');
  if (typeof requestUrl !== 'string' || !requestUrl.startsWith('/') || requestUrl.startsWith('//')) {
    throw new HttpError(400, 'Invalid asset path');
  }
  let pathname;
  try { pathname = decodeURIComponent(requestUrl.split(/[?#]/, 1)[0]); }
  catch { throw new HttpError(400, 'Invalid URL encoding'); }
  if (/[\\:\x00-\x1f\x7f]/u.test(pathname)) throw new HttpError(400, 'Invalid asset path');
  if (pathname.split('/').some((part) => part === '.' || part === '..')) throw new HttpError(403, 'Asset path is outside the prepared root');
  if (discFile(pathname)) throw new HttpError(403, 'Disc images and CUE descriptors are not web assets');
  if (pathname !== '/' && pathname.endsWith('/')) throw new HttpError(404, 'Asset not found');
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const requested = path.resolve(root, relative);
  if (!within(root, requested)) throw new HttpError(403, 'Asset path is outside the prepared root');
  let filename;
  let info;
  try {
    filename = await realpath(requested);
    if (!within(root, filename)) throw new HttpError(403, 'Asset symlink leaves the prepared root');
    if (discFile(filename)) throw new HttpError(403, 'Disc images and CUE descriptors are not web assets');
    info = await stat(filename);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw new HttpError(404, 'Asset not found');
    throw error;
  }
  if (!info.isFile()) throw new HttpError(404, 'Asset not found');
  return { path: filename, size: info.size, type: MIME_TYPES.get(path.extname(filename).toLowerCase()) ?? 'application/octet-stream' };
}

function responseHeaders(response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

/** Exported for request tests without binding a listening socket. */
export async function handlePreviewRequest(root, request, response) {
  responseHeaders(response);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 0 });
    response.end();
    return;
  }
  let handle;
  try {
    const asset = await resolveAsset(root, request.url);
    const file = await openRegularFile(asset.path);
    handle = file.handle;
    response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': file.info.size });
    if (request.method === 'HEAD' || file.info.size === 0) response.end();
    else await pipeline(handle.createReadStream({ autoClose: false, start: 0, end: file.info.size - 1 }), response);
  } catch (error) {
    if (response.headersSent) { response.destroy(error); return; }
    const status = error instanceof HttpError ? error.status : ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code) ? 404 : 500;
    const message = status === 500 ? 'Unable to read prepared asset' : error instanceof HttpError ? error.message : 'Asset not found';
    const body = Buffer.from(`${message}\n`);
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } finally {
    if (handle) await handle.close();
  }
}

/** Start a localhost-only preview. Port 0 chooses an available ephemeral port. */
export async function startPreview({ directory = defaultDirectory, port = 5198 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Port must be an integer from 0 to 65535');
  const root = await resolvePreparedRoot(directory);
  const server = createServer((request, response) => {
    handlePreviewRequest(root, request, response).catch((error) => response.destroy(error));
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, HOST, () => { server.off('error', onError); resolve(); });
  });
  const address = server.address();
  let closing;
  return {
    server,
    root,
    url: `http://${HOST}:${address.port}/`,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      return closing;
    },
  };
}

const help = `FIFA 98 native reconstruction preview (localhost only)

  node games/fifa98/scripts/serve.mjs [--port 5198] [--directory DIRECTORY]

Default directory: games/fifa98/.work/web
The directory must contain index.html and a manifest.json whose status is
reconstruction-only. Prepare the browser output before starting this server.
The server binds 127.0.0.1 only; --port 0 selects an available port.
Press Ctrl+C to stop. Disc BIN/CUE files and directory listings are never served.
`;

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    port: { type: 'string' }, directory: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { process.stdout.write(help); return; }
  if (positionals.length) throw new Error(help);
  if (values.port !== undefined && !/^\d+$/u.test(values.port)) throw new Error('Supply --port as an integer from 0 to 65535');
  const preview = await startPreview({ directory: values.directory, port: values.port === undefined ? 5198 : Number(values.port) });
  process.stdout.write(`FIFA 98 reconstruction preview: ${preview.url}\nThis build inspects original assets; playable match logic remains under reconstruction.\n`);
  const stop = () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    preview.close().catch((error) => { process.stderr.write(`Unable to close preview: ${error.message}\n`); process.exitCode = 1; });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return preview;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`FIFA 98 preview: ${error.message}\n`); process.exitCode = 1; });
}

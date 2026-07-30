const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const evidenceFile =
  process.env.P2_V2_OUTBOUND_EVIDENCE_FILE ||
  '/tmp/p2-v2-synthetic-outbound-attempts.log';
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function hostFromArgs(args) {
  const first = args[0];
  if (typeof first === 'number' && typeof args[1] === 'string') return args[1];
  if (typeof first === 'string') return first;
  if (first instanceof URL) return first.hostname;
  if (first && typeof first === 'object')
    return first.hostname || first.host || 'localhost';
  return 'localhost';
}

function reject(kind, host) {
  const safeHost = String(host || 'unknown').replace(/[\r\n\t]/g, '_');
  fs.appendFileSync(evidenceFile, `${kind}\t${safeHost}\n`, 'utf8');
  throw new Error(`P2_V2_SYNTHETIC_OUTBOUND_BLOCKED: ${kind} to ${safeHost}`);
}

function guardRequest(original, kind) {
  return function guardedRequest(...args) {
    const host = hostFromArgs(args);
    const normalizedHost =
      String(host).startsWith('[') && String(host).endsWith(']')
        ? String(host).slice(1, -1)
        : String(host).replace(/:\d+$/, '');
    if (!allowedHosts.has(normalizedHost)) return reject(kind, host);
    return original.apply(this, args);
  };
}

http.request = guardRequest(http.request, 'http');
http.get = guardRequest(http.get, 'http');
https.request = guardRequest(https.request, 'https');
https.get = guardRequest(https.get, 'https');

const originalConnect = net.connect;
const originalCreateConnection = net.createConnection;
net.connect = guardRequest(originalConnect, 'tcp');
net.createConnection = guardRequest(originalCreateConnection, 'tcp');

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function guardedFetch(input, init) {
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === 'string' ? input : input.url);
    if (!allowedHosts.has(url.hostname)) reject('fetch', url.hostname);
    return originalFetch(input, init);
  };
}

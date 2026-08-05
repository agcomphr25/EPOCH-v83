'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns');
const dgram = require('node:dgram');
const {
  classifyDestination,
  isIpcPath,
  parseAllowedEndpoints,
} = require('./p2-v2-outbound-classifier.cjs');

const evidenceFile =
  process.env.P2_V2_OUTBOUND_EVIDENCE_FILE ||
  '/tmp/p2-v2-synthetic-outbound-attempts.log';
const allowedEndpoints = parseAllowedEndpoints(
  process.env.P2_V2_ALLOWED_LOOPBACK_ENDPOINTS
);

function record(event, detail) {
  fs.appendFileSync(
    evidenceFile,
    `${JSON.stringify({ event, detail: String(detail || 'unknown') })}\n`,
    'utf8'
  );
}

function decide(destination, port) {
  const result = classifyDestination(destination, port, allowedEndpoints);
  record(result.classification, result.destination || result.reason);
  if (result.classification === 'blocked_outbound') {
    throw new Error(`P2_V2_SYNTHETIC_OUTBOUND_BLOCKED: ${result.reason}`);
  }
  return result;
}

function socketArgs(args) {
  const first = args[0];
  if (typeof first === 'string' && isIpcPath(first))
    return { destination: first };
  if (typeof first === 'object' && first)
    return {
      destination: first.path || first.host || first.hostname,
      port: first.port,
    };
  return { port: first, destination: args[1] };
}

function requestArgs(args) {
  const first = args[0];
  const url =
    first instanceof URL
      ? first
      : typeof first === 'string'
        ? new URL(first)
        : null;
  const protocol = url?.protocol || first?.protocol || 'http:';
  return {
    destination: url?.hostname || first?.hostname || first?.host,
    port: Number(
      url?.port || first?.port || (protocol === 'https:' ? 443 : 80)
    ),
  };
}

function guardRequest(original) {
  return function (...args) {
    const target = requestArgs(args);
    decide(target.destination, target.port);
    return original.apply(this, args);
  };
}

http.request = guardRequest(http.request);
http.get = guardRequest(http.get);
https.request = guardRequest(https.request);
https.get = guardRequest(https.get);

for (const method of ['connect', 'createConnection']) {
  const original = net[method];
  net[method] = function (...args) {
    const target = socketArgs(args);
    decide(target.destination, target.port);
    return original.apply(this, args);
  };
}

for (const method of [
  'lookup',
  'resolve',
  'resolve4',
  'resolve6',
  'resolveAny',
]) {
  if (typeof dns[method] !== 'function') continue;
  const original = dns[method];
  dns[method] = function (hostname, ...args) {
    const normalized = String(hostname).toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(normalized))
      decide(hostname, 53);
    else record('allowed_loopback', `dns:${normalized}`);
    return original.call(this, hostname, ...args);
  };
}

const originalCreateSocket = dgram.createSocket;
dgram.createSocket = function (...createArgs) {
  const socket = originalCreateSocket.apply(this, createArgs);
  for (const method of ['connect', 'send']) {
    const original = socket[method];
    socket[method] = function (...args) {
      const port = args.find((value) => Number.isInteger(value));
      const destination = args.find(
        (value) => typeof value === 'string' && value !== 'utf8'
      );
      decide(destination, port);
      return original.apply(this, args);
    };
  }
  return socket;
};

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === 'string' ? input : input.url);
    decide(
      url.hostname,
      Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    );
    return originalFetch(input, init);
  };
}

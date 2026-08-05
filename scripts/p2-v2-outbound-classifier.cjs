'use strict';

const net = require('node:net');

function isIpcPath(value) {
  if (typeof value !== 'string') return false;
  return (
    /^(?:\\\\[.?]\\pipe\\|\\\\\?\\pipe\\)/i.test(value) ||
    (value.startsWith('/') && !value.includes('://'))
  );
}

function normalizeHost(value) {
  const host = String(value || '')
    .trim()
    .toLowerCase();
  if (host.startsWith('[') && host.includes(']'))
    return host.slice(1, host.indexOf(']'));
  return host.indexOf(':') === host.lastIndexOf(':')
    ? host.replace(/:\d+$/, '')
    : host;
}

function parseAllowedEndpoints(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function classifyDestination(destination, port, allowedEndpoints) {
  if (isIpcPath(destination))
    return { classification: 'allowed_ipc', destination: String(destination) };
  if (destination == null || destination === '')
    return {
      classification: 'blocked_outbound',
      reason: 'ambiguous_destination',
    };
  const host = normalizeHost(destination);
  const numericPort = Number(port);
  if (
    !Number.isInteger(numericPort) ||
    numericPort < 1 ||
    numericPort > 65535
  ) {
    return {
      classification: 'blocked_outbound',
      reason: 'invalid_port',
      destination: host,
    };
  }
  if (host === 'localhost') {
    const aliases = [
      `localhost:${numericPort}`,
      `127.0.0.1:${numericPort}`,
      `[::1]:${numericPort}`,
      `::1:${numericPort}`,
    ];
    return aliases.some((entry) => allowedEndpoints.has(entry))
      ? {
          classification: 'allowed_loopback',
          destination: `localhost:${numericPort}`,
        }
      : {
          classification: 'blocked_outbound',
          reason: 'loopback_not_enumerated',
          destination: `localhost:${numericPort}`,
        };
  }
  const ipVersion = net.isIP(host);
  if (!ipVersion)
    return {
      classification: 'blocked_outbound',
      reason: 'hostname_not_allowed',
      destination: host,
    };
  const isLoopback = host === '127.0.0.1' || host === '::1';
  const endpoint =
    ipVersion === 6 ? `[${host}]:${numericPort}` : `${host}:${numericPort}`;
  return isLoopback &&
    (allowedEndpoints.has(endpoint) ||
      allowedEndpoints.has(`${host}:${numericPort}`))
    ? { classification: 'allowed_loopback', destination: endpoint }
    : {
        classification: 'blocked_outbound',
        reason: isLoopback ? 'loopback_not_enumerated' : 'non_loopback',
        destination: endpoint,
      };
}

module.exports = {
  classifyDestination,
  isIpcPath,
  normalizeHost,
  parseAllowedEndpoints,
};

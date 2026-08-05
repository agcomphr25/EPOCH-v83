import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyDestination,
  isIpcPath,
  parseAllowedEndpoints,
} = require('../../scripts/p2-v2-outbound-classifier.cjs');
const allowed = parseAllowedEndpoints(
  '127.0.0.1:55173,localhost:55173,127.0.0.1:55432,[::1]:55173'
);

describe('P2 V2 synthetic outbound classifier', () => {
  it.each([
    String.raw`\\.\pipe\tsx-synthetic`,
    String.raw`\\?\pipe\tsx-synthetic`,
    '/tmp/tsx-synthetic.sock',
  ])('classifies %s as local IPC', (destination) => {
    expect(isIpcPath(destination)).toBe(true);
    expect(
      classifyDestination(destination, undefined, allowed).classification
    ).toBe('allowed_ipc');
  });

  it.each([
    ['127.0.0.1', 55173],
    ['localhost', 55173],
    ['::1', 55173],
    ['127.0.0.1', 55432],
  ])('allows only enumerated local endpoint %s:%s', (host, port) => {
    expect(classifyDestination(host, port, allowed).classification).toBe(
      'allowed_loopback'
    );
  });

  it.each([
    ['127.0.0.1', 9999, 'loopback_not_enumerated'],
    ['8.8.8.8', 443, 'non_loopback'],
    ['192.168.1.20', 443, 'non_loopback'],
    ['example.com', 443, 'hostname_not_allowed'],
    ['2001:4860:4860::8888', 443, 'non_loopback'],
    ['169.254.169.254', 80, 'non_loopback'],
    [undefined, 443, 'ambiguous_destination'],
    ['not a host', 443, 'hostname_not_allowed'],
  ])('rejects unsafe destination %s:%s', (host, port, reason) => {
    expect(classifyDestination(host, port, allowed)).toMatchObject({
      classification: 'blocked_outbound',
      reason,
    });
  });
});

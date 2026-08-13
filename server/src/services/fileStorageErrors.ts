export function getStorageErrorResponse(error: unknown) {
  const err = error as { status?: number; reason?: string; message?: string };
  const rawMessage = err?.message || 'Storage operation failed';
  const providerPermissionDenied =
    /storage\.objects\.(?:create|delete|get|update)/i.test(rawMessage) &&
    /permission|access|forbidden|denied/i.test(rawMessage);
  const reason = providerPermissionDenied
    ? 'storage_provider_permission_denied'
    : err?.reason || 'storage_error';
  const message =
    providerPermissionDenied
      ? 'Central file storage is not writable. Reconnect the configured storage bucket to this deployment and try again.'
      : rawMessage.toLowerCase().includes('error code undefined')
        ? 'File storage is not available. Check the storage provider configuration and try again.'
        : rawMessage;

  // Provider IAM is a service outage, not an authorization failure by the
  // signed-in EPOCH user. A 503 also keeps the client auth layer from retrying.
  const status = providerPermissionDenied
    ? 503
    : err?.status && err.status >= 400
      ? err.status
      : 500;

  return { status, reason, message };
}

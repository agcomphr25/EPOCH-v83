import { describe, expect, it } from 'vitest';

import { getStorageErrorResponse } from '../src/services/fileStorageErrors';

describe('file storage provider errors', () => {
  it('reports provider IAM failures as storage outages instead of user authorization failures', () => {
    const response = getStorageErrorResponse(
      new Error(
        "deployment-service-account does not have storage.objects.create access. Permission 'storage.objects.create' denied",
      ),
    );

    expect(response).toEqual({
      status: 503,
      reason: 'storage_provider_permission_denied',
      message:
        'Central file storage is not writable. Reconnect the configured storage bucket to this deployment and try again.',
    });
  });

  it('preserves true application authorization errors', () => {
    const error = new Error('Upload token signature is invalid.');
    Object.assign(error, { status: 403, reason: 'invalid_upload_token' });

    expect(getStorageErrorResponse(error)).toEqual({
      status: 403,
      reason: 'invalid_upload_token',
      message: 'Upload token signature is invalid.',
    });
  });
});

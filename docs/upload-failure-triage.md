# Upload Failure Triage

## Fast Check

Open:

```text
/api/uploads/diagnostics
```

Expected healthy response:

```json
{
  "ok": true,
  "provider": "replit",
  "canCreateUploadTarget": true
}
```

If the response is `ok: false` with `storage signing unauthorized`, the server cannot create signed object-storage URLs. In that state, any upload flow that depends on presigned URLs can fail before the file is uploaded.

## Current Known Symptom

Order Entry attachment uploads can show:

```text
Failed to sign object URL: storage signing unauthorized (status 401)
```

That means `/api/order-attachments/request-upload-url` failed while asking the configured storage provider for an upload URL.

## Resolution Pattern

1. Confirm `/api/uploads/diagnostics`.
2. If Replit signing is unauthorized, repair the deployment object-storage environment or switch `FILE_STORAGE_PROVIDER=supabase` with complete Supabase storage env vars.
3. For critical workflows, add a server-side multipart fallback so users can still upload while cloud signing is unavailable.
4. Search for other presigned upload flows:

```text
rg -n "request-upload-url|/api/uploads/request-url|complete-upload|uploadURL" client server
```

5. Patch each user-facing upload flow to either:

- use the shared diagnostics/fallback pattern, or
- move fully to server-side upload if cloud object storage is not required for that document class.

## Fixed First

Order attachments now fall back to `/api/order-attachments/local-upload` when object URL signing returns unauthorized/unavailable.

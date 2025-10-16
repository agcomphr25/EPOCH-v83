# Magic Link Authentication System

A secure, passwordless authentication system that allows you to send time-limited, single-use links to customers via email.

## Features

- **Passwordless Authentication**: No passwords to remember or manage
- **Secure**: Cryptographically secure tokens with expiration and one-time use
- **Flexible**: Support for multiple use cases (login, order confirmation, password reset, etc.)
- **Email Integration**: Automatic email delivery via SendGrid
- **Customizable**: Custom email templates and metadata support

## Quick Start

### 1. Send a Magic Link

```typescript
import { sendMagicLink } from '../utils/magicLink';

// Send a login link
const result = await sendMagicLink({
  email: 'customer@example.com',
  purpose: 'login',
  subject: 'Your Login Link',
  buttonText: 'Sign In',
  expiresInMinutes: 30, // Optional, defaults to 30
});

if (result.success) {
  console.log('Magic link sent successfully!');
} else {
  console.error('Failed to send:', result.error);
}
```

### 2. Validate a Magic Link

```typescript
import { validateMagicLink } from '../utils/magicLink';

// When user clicks the link
const result = await validateMagicLink(token, 'login');

if (result.isValid && result.token) {
  // Token is valid - authenticate the user
  const email = result.token.email;
  const metadata = result.token.metadata;

  // Create session, log them in, etc.
} else {
  // Token is invalid or expired
  console.error(result.error);
}
```

## Common Use Cases

### 1. Customer Login

```typescript
await sendMagicLink({
  email: customer.email,
  purpose: 'login',
  metadata: { customerId: customer.id },
  expiresInMinutes: 15,
});
```

### 2. Order Confirmation

```typescript
await sendMagicLink({
  email: customer.email,
  purpose: 'order_confirmation',
  subject: `Confirm Your Order ${orderId}`,
  buttonText: 'Confirm Order',
  metadata: {
    orderId: orderId,
    customerId: customer.id,
    orderTotal: orderTotal,
  },
  expiresInMinutes: 60,
});
```

### 3. Password Reset

```typescript
await sendMagicLink({
  email: user.email,
  purpose: 'password_reset',
  subject: 'Reset Your Password',
  buttonText: 'Reset Password',
  metadata: { userId: user.id },
  expiresInMinutes: 30,
});
```

### 4. Custom Action (e.g., Document Signing)

```typescript
await sendMagicLink({
  email: customer.email,
  purpose: 'customer_action',
  subject: 'Please Sign Your Document',
  message: 'Click the button below to review and sign your document.',
  buttonText: 'Sign Document',
  metadata: {
    documentId: doc.id,
    customerId: customer.id,
  },
  expiresInMinutes: 120, // 2 hours
});
```

## API Endpoints

### POST `/api/magic-link/send`

Send a magic link via email.

**Request Body:**

```json
{
  "email": "customer@example.com",
  "purpose": "login",
  "subject": "Your Login Link",
  "message": "Click below to sign in",
  "buttonText": "Sign In",
  "metadata": { "customerId": "123" },
  "expiresInMinutes": 30
}
```

**Response:**

```json
{
  "success": true,
  "message": "Magic link sent successfully",
  "expiresAt": "2025-10-16T12:30:00Z"
}
```

### GET `/api/magic-link/verify?token=xxx&purpose=login`

Verify and consume a magic link token.

**Response (Success):**

```json
{
  "success": true,
  "message": "Token is valid",
  "email": "customer@example.com",
  "purpose": "login",
  "metadata": { "customerId": "123" }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": "This link has expired"
}
```

### POST `/api/magic-link/generate`

Generate a magic link without sending it (for manual delivery).

**Request Body:**

```json
{
  "email": "customer@example.com",
  "purpose": "login",
  "metadata": { "customerId": "123" },
  "expiresInMinutes": 30
}
```

**Response:**

```json
{
  "success": true,
  "link": "https://your-app.com/api/magic-link/verify?token=xxx&purpose=login",
  "expiresAt": "2025-10-16T12:30:00Z"
}
```

### POST `/api/magic-link/cleanup`

Clean up expired tokens (run periodically).

**Response:**

```json
{
  "success": true,
  "message": "Cleaned up 15 expired tokens",
  "deletedCount": 15
}
```

## Custom Email Templates

You can provide your own email template function:

```typescript
import { sendMagicLink } from '../utils/magicLink';

await sendMagicLink({
  email: customer.email,
  purpose: 'custom_action',
  metadata: { orderId: '12345' },
  customTemplate: (link, data) => ({
    subject: `Order #${data.metadata?.orderId} - Action Required`,
    html: `
      <html>
        <body>
          <h1>Welcome ${data.email}!</h1>
          <p>Click here: <a href="${link}">Take Action</a></p>
        </body>
      </html>
    `,
    text: `Welcome! Click here to continue: ${link}`,
  }),
});
```

## Security Best Practices

1. **Short Expiration Times**: Use 15-30 minutes for sensitive actions
2. **Purpose Validation**: Always validate the purpose when verifying tokens
3. **Metadata Validation**: Validate metadata on the backend, don't trust client data
4. **HTTPS Only**: Magic links should only work over HTTPS in production
5. **Rate Limiting**: Implement rate limiting on link generation endpoints
6. **Logging**: Log all magic link generation and validation attempts

## Database Schema

The system uses a `magic_link_tokens` table:

```typescript
{
  id: number;
  token: string; // Unique cryptographic token
  email: string; // Recipient email
  purpose: string; // 'login', 'order_confirmation', etc.
  metadata: object; // Additional data (customerId, orderId, etc.)
  expiresAt: Date; // Token expiration timestamp
  usedAt: Date | null; // When token was used (null if unused)
  ipAddress: string; // IP that requested the link
  userAgent: string; // User agent that requested the link
  createdAt: Date; // Creation timestamp
}
```

## Error Handling

The system returns clear error messages:

- `"Invalid or expired token"` - Token not found or expired
- `"This link has already been used"` - Token was already consumed
- `"This link has expired"` - Token past expiration time
- `"Invalid token purpose"` - Purpose mismatch
- `"Validation failed"` - Generic validation error

## Cleanup & Maintenance

Run periodic cleanup to remove expired tokens:

```typescript
import { cleanupExpiredMagicLinks } from '../utils/magicLink';

// Run daily or weekly
const deletedCount = await cleanupExpiredMagicLinks();
console.log(`Cleaned up ${deletedCount} expired tokens`);
```

## Integration with Existing Code

### Example: Customer Order Notification

```typescript
import { sendMagicLink } from '../utils/magicLink';

async function notifyCustomerOrderShipped(orderId: string) {
  const order = await storage.getOrderById(orderId);
  const customer = await storage.getCustomerById(order.customerId);

  // Send magic link for order tracking
  await sendMagicLink({
    email: customer.email,
    purpose: 'order_tracking',
    subject: `Your Order ${orderId} Has Shipped!`,
    message: `Track your order and view shipping details.`,
    buttonText: 'Track Order',
    metadata: {
      orderId: orderId,
      customerId: customer.id,
      trackingNumber: order.trackingNumber,
    },
    expiresInMinutes: 720, // 12 hours
  });
}
```

### Example: Frontend Verification Handler

```typescript
// In your React component or route handler
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

function MagicLinkVerification() {
  const [location] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const purpose = params.get('purpose');

    if (!token) {
      setStatus('error');
      return;
    }

    fetch(`/api/magic-link/verify?token=${token}&purpose=${purpose}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setStatus('success');
          setData(result);
          // Handle successful verification
          // e.g., log user in, show order details, etc.
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'loading') return <div>Verifying...</div>;
  if (status === 'error') return <div>Invalid or expired link</div>;

  return <div>Success! Email: {data.email}</div>;
}
```

## Support

For issues or questions about the Magic Link system, please contact the development team.

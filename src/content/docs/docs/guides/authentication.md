---
title: Authentication
description: Optional popup-based authentication for OAuth, OIDC, and custom identity providers.
---

Agentlet includes an optional, popup-based authentication system that integrates with the agentlet panel. It supports OIDC, OAuth2, and custom identity providers through a configurable popup flow and token extraction.

## Basic configuration

```javascript
const agentlet = new AgentletCore({
    auth: {
        enabled: true,
        buttonText: 'Login',
        loginUrl: 'https://your-idp.com/auth',
        popupWidth: 400,
        popupHeight: 600,
        allowedOrigins: ['https://your-idp.com'],

        onSuccess: (result) => {
            console.log('Authentication successful', result);
        },
        onError: (result) => {
            console.error('Authentication failed', result.error);
        },
        onCancel: (result) => {
            console.log('Authentication cancelled', result);
        },
    },
});
```

`onSuccess` receives an `AuthResult`: `{ success: true, token, timestamp, userInfo }`, plus any extra fields the token extractor or message handler attached.

## Custom token extraction

For identity providers that return the token in a non-standard location (URL hash, query string, custom message body), provide a `tokenExtractor`:

```javascript
tokenExtractor: (raw) => {
    if (raw.includes('#access_token=')) {
        const match = raw.match(/access_token=([^&]+)/);
        return match ? match[1] : null;
    }
    return null;
};
```

## Custom message handling

For flows that need full control over the popup's `postMessage` payload, provide a `messageHandler`. It receives the raw message data and the `AuthManager` instance, and returns a result object (or `null`/`undefined` to let the default handling continue):

```javascript
messageHandler: (data, manager) => {
    if (data.type === 'ENTERPRISE_AUTH_SUCCESS') {
        return { success: true, accessToken: data.accessToken, userInfo: data.user };
    }
    if (data.type === 'ENTERPRISE_AUTH_ERROR') {
        return { success: false, error: data.message };
    }
    return null;
};
```

## Programmatic control

```javascript
const auth = window.agentlet.auth;

if (auth.isEnabled()) {
    await auth.startAuthentication();
}

const state = auth.getState();
// { enabled, authenticating, popupOpen }

await auth.logout();

auth.updateConfig({ buttonText: 'New login text', loginUrl: 'https://new-idp.com/auth' });
```

`isEnabled()` and `AuthState.enabled` are not strict booleans: they return the configured `loginUrl` string when authentication is enabled and a login URL is set, not literal `true`.

## Identity provider examples

### Auth0

```javascript
const auth0Config = {
    auth: {
        enabled: true,
        buttonText: 'Login with Auth0',
        loginUrl:
            'https://your-domain.auth0.com/authorize?response_type=token&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&scope=openid profile email',
        popupWidth: 500,
        popupHeight: 700,
        allowedOrigins: ['https://your-domain.auth0.com'],
        tokenExtractor: (raw) => {
            const match = raw.match(/access_token=([^&]+)/);
            return match ? match[1] : null;
        },
        onSuccess: (result) => {
            localStorage.setItem('auth0_token', result.token);
        },
    },
};
```

### Google OAuth

```javascript
const googleConfig = {
    auth: {
        enabled: true,
        buttonText: 'Sign in with Google',
        loginUrl:
            'https://accounts.google.com/oauth/v2/auth?client_id=YOUR_GOOGLE_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code&scope=openid email profile',
        popupWidth: 500,
        popupHeight: 600,
        allowedOrigins: ['https://accounts.google.com'],
        tokenExtractor: (raw) => {
            const match = raw.match(/code=([^&]+)/);
            return match ? match[1] : null;
        },
        onSuccess: async (result) => {
            const tokenResponse = await exchangeCodeForToken(result.token);
            localStorage.setItem('google_token', tokenResponse.access_token);
        },
    },
};
```

## Security considerations

- Always set `allowedOrigins` to the identity provider's origin, so messages from other windows are ignored.
- Validate tokens on your backend before trusting them.
- Prefer HTTPS-only storage for tokens returned by `onSuccess`.

## Troubleshooting

- **Popup blocked**: ensure popups are allowed for your domain.
- **CORS issues**: configure proper CORS headers on your identity provider.
- **Message not received**: check the `allowedOrigins` configuration.
- **Token extraction failed**: verify the `tokenExtractor` function against the actual popup payload.

Inspect the current auth configuration and state from the console:

```javascript
window.agentlet.auth.getState();
window.agentlet.debug?.getConfig().auth; // Only when the core was constructed with debugMode: true
```

Source: agentlet-core docs/authentication.md and src/types/public-api.d.ts at e3f78fa. The source document's `messageHandler` examples called `authManager.handleSuccess()`/`handleError()` methods that are not part of the current `AuthManagerAPI` type; the corrected form here has `messageHandler` return a result object instead, matching the current `AuthManagerConfig['messageHandler']` signature.

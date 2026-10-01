---
title: Environment variables
description: Read and write configuration values scoped to the agentlet.
---

`window.agentlet.env` gives modules a simple key-value store for configuration, backed by browser storage, with change notifications and a proxy for property-style access.

## Configuration on initialization

```javascript
window.agentletConfig = {
    env: {
        API_BASE_URL: 'https://api.example.com',
        API_KEY: 'your-api-key-here',
        ENABLE_DEBUG: 'true',
    },
    // Other AgentletCore configuration...
};
```

Pass `envManager: null` in the `AgentletCore` config to disable environment variables entirely; `window.agentlet.env` is then `null`.

## Runtime access

```javascript
// Through the proxy (property-style access)
const apiUrl = window.agentlet.env.API_BASE_URL;

// Or through the methods directly
const timeout = window.agentlet.env.get('API_TIMEOUT', '5000');
window.agentlet.env.set('FEATURE_FLAG', 'enabled');
```

Property access and the method calls read and write the same underlying store; only variable names that collide with a method name (`get`, `set`, `has`, ...) must go through the method itself.

## Setting variables

```javascript
window.agentlet.env.set('API_KEY', 'new-key');

window.agentlet.env.setMultiple({
    API_URL: 'https://new-api.com',
    VERSION: '2.0.0',
});

// Load from an object; merges over existing values by default
window.agentlet.env.loadFromObject(configObject);

// Replace instead of merge
window.agentlet.env.loadFromObject(configObject, false);
```

## Getting variables

```javascript
const apiUrl = window.agentlet.env.get('API_URL', 'https://default.com');

if (window.agentlet.env.has('API_KEY')) {
    // ...
}

// All variables, sensitive values masked
const allVars = window.agentlet.env.getAll();

// All variables, including sensitive values
const allVarsWithSensitive = window.agentlet.env.getAll(true);
```

## Removing variables

```javascript
window.agentlet.env.remove('OLD_CONFIG'); // Returns whether the key existed
window.agentlet.env.clear();
```

## Change listeners

```javascript
const listener = (key, newValue, oldValue) => {
    console.log(`${key} changed from ${oldValue} to ${newValue}`);
    if (key === 'API_URL') {
        updateApiConfiguration();
    }
};

window.agentlet.env.addChangeListener(listener);
window.agentlet.env.removeChangeListener(listener);
```

## Module integration

```javascript
class MyModule extends window.agentlet.Module {
    async initModule() {
        const env = window.agentlet.env;
        if (!env) return;

        this.config = {
            apiUrl: env.get('MODULE_API_URL', 'https://default.com'),
            retries: parseInt(env.get('MODULE_RETRIES', '3'), 10),
            enabled: env.get('MODULE_ENABLED', 'true') === 'true',
        };

        env.addChangeListener((key) => {
            if (key.startsWith('MODULE_')) {
                this.updateConfiguration();
            }
        });
    }
}
```

## Common patterns

### Feature flags

```javascript
window.agentlet.env.setMultiple({
    FEATURE_NEW_UI: 'true',
    FEATURE_ANALYTICS: 'false',
});

if (window.agentlet.env.get('FEATURE_NEW_UI') === 'true') {
    loadNewUI();
}
```

### Environment-specific configuration

```javascript
const environment = window.location.hostname === 'localhost' ? 'development' : 'production';

const configs = {
    development: { API_URL: 'http://localhost:3000', DEBUG_LEVEL: 'verbose' },
    production: { API_URL: 'https://api.production.com', DEBUG_LEVEL: 'error' },
};

window.agentlet.env.loadFromObject(configs[environment]);
```

### Loading remote configuration

```javascript
async function loadRemoteConfiguration() {
    const response = await fetch('/api/frontend-config');
    const config = await response.json();
    window.agentlet.env.loadFromObject(config);
}
```

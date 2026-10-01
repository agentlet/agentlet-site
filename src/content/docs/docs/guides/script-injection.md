---
title: Script injection and registry
description: How agentlet-core injects code across bookmarklet, extension, and content-script environments, and how registries load without CORS.
---

## The ScriptInjector

`window.agentlet.utils.ScriptInjector` provides a promise-based API for injecting code, functions, or files, with automatic detection of the current execution environment.

```javascript
const injector = window.agentlet.utils.ScriptInjector;

// Inject code
await injector.inject({ code: 'console.log("Hello from injected script!");' });

// Inject a function with arguments
const testFunction = (name, count) => {
    for (let i = 0; i < count; i++) console.log(`Hello ${name}!`);
};
await injector.inject({ func: testFunction, args: ['World', 3] });

// Inject a module
await injector.injectModule({ moduleCode: moduleSource, moduleUrl: 'my-module://example' });
```

`inject(options)` requires one of `code`, `file`, or `func`:

- `code` (string): JavaScript code to inject
- `file` (string): file path to inject, extension environment
- `func` (function) and `args` (array): a function and its arguments
- `tabId` (number): target tab ID, extension environment
- `target` (`'main' | 'isolated'`): execution world
- `allFrames` (boolean): inject into all frames

Static helpers: `ScriptInjector.isExtensionEnvironment()`, `ScriptInjector.isContentScriptEnvironment()`, and `ScriptInjector.createFunctionInjection(func, ...args)`.

### Multi-environment support

The injector supports three execution environments, falling back automatically:

1. **Extension background or popup**: uses `chrome.scripting.executeScript` directly.
2. **Content script**: messages the background script for injection.
3. **Web page or bookmarklet**: falls back to DOM `<script>` tag manipulation.

Running `chrome.scripting.executeScript` where it is available (rather than always manipulating the DOM) gives more reliable execution timing, proper MAIN/ISOLATED world separation, and compatibility with a page's Content Security Policy.

### From a background script or popup

```javascript
const injector = new ScriptInjector();

await injector.inject({
    code: 'alert("Injected from extension!");',
    tabId: currentTabId,
    target: 'main',
});
```

## Registry loading via script injection

Agentlet registries load through `<script>` tag injection instead of `fetch()`, to avoid CORS issues when loading registry configuration from a different domain, and to work reliably behind corporate firewalls and CSP.

### Registry file format

A registry file is a `.js` file that builds a registry object and dispatches it as a custom event, rather than a `.json` file requiring a CORS-compliant server:

```javascript title="agentlets-registry.js"
(function () {
    'use strict';

    const registry = {
        agentlets: [{ name: 'hello-world', url: 'https://example.com/hello-world.js', module: 'HelloWorldModule' }],
    };

    // Dispatched synchronously, in the same task as this script's own
    // execution: ModuleRegistry.loadRegistryScript() attaches its listener
    // before the <script> element is even created, so a setTimeout before
    // dispatching only adds a delay, never reliability. On a page busy
    // enough to delay a queued timeout past ModuleRegistry's own 10-second
    // timeout, that delay can make the registry arrive too late to be seen
    // at all.
    window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: registry }));
})();
```

An entry's `url` can be relative. Since agentlet-core 2.2.0 it resolves against the registry script's own URL, so `"url": "./hello-world.js"` in `https://cdn.example.com/agentlets/agentlets-registry.js` loads `https://cdn.example.com/agentlets/hello-world.js`, whatever page the agentlet runs on. `getRegistryEntries()` returns the resolved URLs. Earlier versions resolve a relative entry URL against the host page, so use absolute URLs there.

Loading proceeds in five steps: `ModuleRegistry` injects a `<script>` tag pointing at the registry URL, sets up a listener for the `agentletRegistryLoaded` event, applies a 10-second timeout to avoid hanging on a failed load, the registry script dispatches the event once loaded, and the event's `detail` is processed the same way a fetched JSON payload would have been.

### Lazy entries

Mark a registry entry `lazy: true` to have `init()`'s eager registry load skip it:

```javascript title="agentlets-registry.js"
const registry = {
    agentlets: [
        { name: 'hello-world', url: 'https://example.com/hello-world.js', module: 'HelloWorldModule' },
        { name: 'heavy-demo', url: 'https://example.com/heavy-demo.js', module: 'HeavyDemoModule', lazy: true },
    ],
};
```

A lazy entry is still listed by `moduleRegistry.getRegistryEntries()` (each entry annotated with `loaded`), so a host can build a "more demos" list from it without downloading every bundle up front. Load one on demand, then activate it, with `moduleRegistry.loadModule(entry)`:

```javascript
const registry = window.agentlet.moduleRegistry;
const entry = registry.getRegistryEntries().find((candidate) => candidate.name === 'heavy-demo');
const instance = await registry.loadModule(entry);
await registry.activateModule(instance);
```

`loadModule()` resolves with the already-registered instance, without reloading, if the entry was already loaded. A lazy entry is not a candidate for the core's own URL-based module detection until it has actually been loaded this way at least once.

### Configuration

```javascript
const agentlet = new AgentletCore({
    registryUrl: 'https://cdn.example.com/agentlets-registry.js',
});
```

Serve `.js` registry files with `Content-Type: application/javascript`. CORS headers are not required for script-tag loading, but may still be useful for other API calls made by the same backend.

### Security considerations

- **Content integrity**: consider `script.integrity` and `script.crossOrigin = 'anonymous'` for registry scripts served from a third-party CDN.
- **Trusted domains**: validate `registryUrl`'s hostname against an allowlist before injecting it.
- **CSP compatibility**: make sure `script-src` in your Content Security Policy allows the registry's domain.

## Migrating from DOM injection

Earlier versions of agentlet-core injected code purely through DOM `<script>` tag manipulation. `ScriptInjector` replaces that with `chrome.scripting.executeScript` where available, keeping the DOM approach only as the web-page fallback described above.

```javascript title="Before"
function loadExternalScript(url) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => console.log('Loaded');
    document.head.appendChild(script);
}
```

```javascript title="After"
async function loadExternalScript(url) {
    const injector = window.agentlet.utils.ScriptInjector;
    await injector.inject({ file: url });
    console.log('Loaded');
}
```

Existing modules that only used DOM injection in a web page environment keep working unchanged: the fallback chain (extension API, then background messaging, then DOM injection) means no breaking change to the public API.

## Troubleshooting

- **"ScriptInjector not available"**: ensure agentlet-core is loaded before using it.
- **Content script injection timeout**: verify the background script is responding and that extension permissions are granted.
- **DOM injection setup failed**: check for Content Security Policy restrictions and that `document.head` is available.

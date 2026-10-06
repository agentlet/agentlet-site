---
title: TypeScript
description: Type declarations for window.agentlet, shipped for both JavaScript and TypeScript agentlets.
---

agentlet-core ships hand-written TypeScript declarations for its public API, so agentlet authors get autocompletion and type checking whether their own agentlet is written in JavaScript or TypeScript.

## What is typed

- The `window.agentlet` object: `utils.Dialog`, `utils.MessageBubble`, `utils.ElementSelector`, `utils.ScreenCapture`, `utils.ScriptInjector`, `utils.PDFProcessor`, `utils.shortcuts`, `utils.zIndex`, `forms.*`, `tables.*`, `ai.*`, `env`, `cookies`, `storage.*`, `modules.*`, `ui.*`, `theme`, `eventBus`, and the rest of the surface built at startup.
- The `Module` base class agentlets extend (`window.agentlet.Module`), including the `initModule`/`activateModule`/`cleanupModule` lifecycle hooks and the optional duck-typed hooks the core looks for (`getPanelTitle`, `showSettings`, `showHelp`, `onLocalStorageChange`, ...).
- The `AgentletCore` constructor configuration object.

The declarations live in `src/types/public-api.d.ts` and are shipped as `dist/agentlet-core.d.ts`, referenced from `package.json`'s `types` field. See [Public API](/docs/reference/public-api/) for the reference built from these declarations.

Agentlets written in plain JavaScript never have to write any TypeScript themselves.

## JavaScript agentlets

### Option 1: a reference directive

Add a triple-slash reference directive at the top of a `.js` file (requires `agentlet-core` to be an installed dependency):

```javascript
/// <reference types="agentlet-core" />

class MyAgentlet extends window.agentlet.Module {
    async initModule() {
        this.log('initializing');
    }

    /**
     * @param {import('agentlet-core').ModuleActivationContext} [context]
     */
    async activateModule(context) {
        window.agentlet.utils.Dialog.info('Hello from my agentlet');
        void context;
    }

    async cleanupModule() {
        this.removeAllStyles();
    }
}

window.agentlet.modules.register(new MyAgentlet({ name: 'my-agentlet', patterns: ['example.com'], matchMode: 'host' }));
```

Editors such as VS Code pick this up automatically and show autocompletion and type errors on `window.agentlet.*`, with no build step required.

### Option 2: `jsconfig.json`

For a whole project of `.js` files, add a `jsconfig.json` next to `package.json`:

```json
{
    "compilerOptions": {
        "checkJs": true,
        "types": ["agentlet-core"]
    }
}
```

This gives every `.js` file in the project the same autocompletion and type checking as the reference-directive form, without needing the directive in each file.

## TypeScript agentlets

Import the types directly:

```typescript
import type { AgentletAPI, ModuleActivationContext } from 'agentlet-core';

function handleActivation(context: ModuleActivationContext): void {
    console.log('activated with', context);
}

const reply: Promise<string> = window.agentlet.ai.sendPrompt('Summarize this page');
```

`window.agentlet` itself is typed globally as soon as any file in the program pulls in `agentlet-core`'s declarations, via the reference directive, the `types` array, or an `import`/`import type`, so `window.agentlet.ai.sendPrompt(...)` above type-checks without an explicit import of `AgentletAPI`.

This resolves correctly with both `"moduleResolution": "bundler"` and `"moduleResolution": "node16"`.

## How the types are maintained

The declarations in `src/types/public-api.d.ts` are hand-written: it ships standalone as `dist/agentlet-core.d.ts`, so it cannot `import` from the rest of `src/` at publish time. Instead, the shared shape types (`ModuleConfig`, `EventBusAPI`, `ThemeManagerAPI`, `ZIndexConstants`, `PanelManagerAPI`, ...) are single-sourced here, and the real runtime classes `import type` them from this file, so both sides describe the same shape instead of being hand-maintained independently. A type-only test asserts bidirectional assignability between each real class and its declaration, so drift between them fails the build.

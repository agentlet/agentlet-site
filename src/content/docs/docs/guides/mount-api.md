---
title: Mount API
description: Attach a UI framework root to a module's panel container.
---

`Module` exposes two lifecycle hooks, `mount()` and `unmount()`, alongside `initModule()` / `activateModule()` / `cleanupModule()`. They give module authors an explicit, imperative place to attach a UI framework root (React, Lit, Vue, or anything else) to the panel, instead of only returning an HTML string from `getContent()`.

## Why it exists

`getContent()` works well for HTML built from a template string, but it cannot host a framework component: there is nowhere to call `createRoot()`, attach a custom element, or clean up a framework instance when the module is replaced. `mount()`/`unmount()` fill that gap while keeping the default, `getContent()`-based behavior unchanged for every module that does not override them.

The core ships no UI framework of its own and never renders agentlet content in a component tree it owns. Each agentlet bundles whatever framework it needs and mounts it directly into the container the core hands it. Because the core stays out of that tree, two agentlets on the same page can use two different, or even two different copies of the same, frameworks without interfering with each other.

## The two hooks

```typescript
/**
 * Render this module's content into `container`. Called by the core
 * whenever this module becomes (or stays) the active module: on init,
 * module switch, URL change, or a manual refresh, see context.trigger.
 *
 * Default implementation: container.innerHTML = this.getContent();
 */
async mount(container: HTMLElement, context: ModuleMountContext): Promise<void>;

/**
 * Tear down what mount() set up (e.g. unmount a framework root). Called
 * by the core before a different module mounts, and by cleanup() if this
 * module is still mounted.
 *
 * The core clears the container's content itself after this resolves, so
 * the default implementation is a no-op.
 */
async unmount(container: HTMLElement): Promise<void>;
```

Both are defined on the `Module` base class, so every module gets them for free. Overriding `mount()` replaces the default `getContent()`-based rendering entirely; overriding `unmount()` is only needed when `mount()` created something that needs explicit teardown.

## The context object

```typescript
interface ModuleMountContext {
    root: ShadowRoot | HTMLElement;
    theme: AgentletTheme;
    eventBus: EventBusAPI;
    api: AgentletAPI;
    trigger: ModuleMountTrigger;
}
```

| Field | Description |
|---|---|
| `root` | The UI mount root: the shadow root when `shadowDom` is enabled (the default), or `document.body` otherwise. Same value as `window.agentlet.ui.root`. See [Shadow DOM](/docs/guides/shadow-dom/). |
| `theme` | The theme at the time of this mount, as returned by `window.agentlet.themeManager.getTheme()`. This is a point-in-time snapshot, not a live reference. See [Reacting to a theme change](#reacting-to-a-theme-change) below. |
| `eventBus` | The shared core event bus, the same instance as `window.agentlet.eventBus`. |
| `api` | The full `window.agentlet` API surface, handed to `mount()` so a module does not need to rely on the global being ready yet. |
| `trigger` | Why this mount or unmount is happening, see below. |

## Lifecycle order

For a module extending `Module`, a full activation-to-cleanup cycle calls the hooks in this order:

1. **`initModule()`**: once, the first time the module is loaded.
2. **`activateModule(context)`**: every time the module becomes the active module, and again on every URL change while it stays active.
3. **`mount(container, context)`**: every time the panel content is (re)rendered for this module: on init, when this module becomes active, on URL changes, and on a manual `refreshContent()`.
4. **`unmount(container)`**: before the next module mounts into the same container, and during `cleanup()` if the module is still mounted at that point.
5. **`cleanupModule(context)`**: when the module is deactivated or destroyed, after `unmount()` has already run.

`mount()`/`unmount()` run once per content update, more often than `activateModule()`/`cleanupModule()`: the same active module gets a fresh `mount()` call (with `trigger: 'urlChange'`) on every URL change even though `activateModule()` also runs for that change, and again on `trigger: 'refresh'` even though neither `activateModule()` nor `cleanupModule()` run at all.

`this.mounted` (boolean) and `this.mountedContainer` (the container element, or `null`) are kept up to date by the core around every `mount()`/`unmount()` call, so an override can check `this.mounted` to decide whether to update an already-mounted root in place instead of re-rendering from scratch.

## State retention across refreshes

Keep any state a module needs to survive a re-render on the module instance itself (`this.someState = ...`), not in the DOM the default `mount()` produces. The default implementation re-renders unconditionally from `getContent()` on every call, so DOM-only state is lost across triggers such as `urlChange` or `refresh` unless the module reads it back out before re-rendering, or overrides `mount()` to update the existing root in place.

## Reacting to a theme change

`window.agentlet.setTheme(config)` merges `config` into the active theme, re-injects the panel's CSS, updates `window.agentlet.theme`, and emits `theme:changed` on the core event bus with a `ThemeChangedEventPayload`: `{ theme, previousTheme }`.

`context.theme` in `mount()` is only a snapshot taken at mount time, so a module mounted with a UI framework root (React, Lit, or any other) needs to subscribe to `theme:changed` to stay in sync with a later change. Subscribe in `mount()` and unsubscribe in `unmount()`, keeping a reference to the event bus on the instance since `unmount()` only receives the container:

```javascript
class ThemedPanelModule extends window.agentlet.Module {
    async mount(container, context) {
        this._eventBus = context.eventBus;
        this._onThemeChanged = ({ theme }) => {
            this._root.render(React.createElement(PanelComponent, { theme }));
        };
        this._eventBus.on('theme:changed', this._onThemeChanged);

        this._root = ReactDOM.createRoot(container);
        this._root.render(React.createElement(PanelComponent, { theme: context.theme }));
    }

    async unmount() {
        this._eventBus.off('theme:changed', this._onThemeChanged);
        this._root?.unmount();
        this._root = null;
    }
}
```

## `injectStyles()` and the UI root

`injectStyles(css)` appends its `<style>` element to the root captured from the most recent `mount()` call (`context.root`) rather than always to `document.head`. In the default `shadowDom: true` mode that is the shadow root, so styles reach content mounted inside it. See [Shadow DOM](/docs/guides/shadow-dom/#consequences-for-agentlet-authors) for the full fallback chain.

## Error handling

If `mount()` throws or rejects, the core catches the error, logs it, and renders the panel's built-in error markup in place of the module's content. The module is not left half-mounted: `this.mounted`/`this.mountedContainer` reflect the attempt, and the next content update still calls `unmount()` on it as usual. If `unmount()` itself throws, the core logs the error and continues; the container's content is cleared by the core regardless.

## `trigger` values

`ModuleMountTrigger` is `'init' | 'moduleChange' | 'urlChange' | 'refresh' | string`:

- **`'init'`**: the core's first content render during startup.
- **`'moduleChange'`**: a different module just became the active module.
- **`'urlChange'`**: the URL changed but the same module is still active.
- **`'refresh'`**: `window.agentlet.refreshContent()` / `ui.refreshContent()` was called explicitly, or an internal refresh with no more specific trigger.

The type allows an arbitrary string too, since a caller can pass any value through to `updateModuleContent(trigger)` directly.

## Code samples

### Vanilla, imperative DOM

```javascript
class VanillaCounterModule extends window.agentlet.Module {
    constructor() {
        super({ name: 'vanilla-counter', patterns: ['*'] });
        this.count = 0;
    }

    async mount(container, context) {
        container.innerHTML = `
            <div class="counter-panel">
                <p>Count: <span data-count>${this.count}</span></p>
                <button data-increment>+1</button>
            </div>
        `;
        const button = container.querySelector('[data-increment]');
        const label = container.querySelector('[data-count]');
        this._onClick = () => {
            this.count += 1;
            label.textContent = String(this.count);
        };
        button.addEventListener('click', this._onClick);
    }

    async unmount(container) {
        container.querySelector('[data-increment]')?.removeEventListener('click', this._onClick);
    }
}
```

See the full runnable version: [`examples/basics/mount-vanilla.html`](https://github.com/agentlet/agentlet-core/blob/main/examples/basics/mount-vanilla.html).

### React, with `createRoot()`/`unmount()`

```javascript
class ReactPanelModule extends window.agentlet.Module {
    constructor() {
        super({ name: 'react-panel', patterns: ['*'] });
        this._root = null;
    }

    async mount(container) {
        this._root = ReactDOM.createRoot(container);
        this._root.render(React.createElement(PanelComponent, { module: this }));
    }

    async unmount() {
        this._root?.unmount();
        this._root = null;
    }
}
```

See [`examples/basics/mount-react.html`](https://github.com/agentlet/agentlet-core/blob/main/examples/basics/mount-react.html), which loads React 18 from a CDN as a UMD build.

### Custom element (Lit)

```javascript
class LitPanelModule extends window.agentlet.Module {
    async mount(container) {
        const element = document.createElement('lit-panel');
        element.module = this;
        container.appendChild(element);
    }

    async unmount(container) {
        container.querySelector('lit-panel')?.remove();
    }
}
```

See [`examples/basics/mount-lit.html`](https://github.com/agentlet/agentlet-core/blob/main/examples/basics/mount-lit.html) for the full Lit custom element.

## Migration note

Existing agentlets that only implement `getContent()` need no change. The default `mount()` still calls `container.innerHTML = this.getContent()`, and the default `unmount()` is a no-op; both are inherited automatically from `Module`.

## TypeScript

```typescript
import type { ModuleMountContext, ModuleMountTrigger } from 'agentlet-core';

class TypedModule extends window.agentlet.Module {
    async mount(container: HTMLElement, context: ModuleMountContext): Promise<void> {
        console.log('mounting, trigger:', context.trigger satisfies ModuleMountTrigger);
        container.innerHTML = this.getContent();
    }
}
```

See [TypeScript](/docs/guides/typescript/) for how these declarations are imported and maintained.

Source: agentlet-core docs/module-mount-api.md and src/types/public-api.d.ts at 4a8aaab.

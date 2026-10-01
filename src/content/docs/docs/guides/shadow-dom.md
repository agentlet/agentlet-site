---
title: Shadow DOM
description: How the agentlet panel isolates its CSS from the host page.
---

By default, the agentlet panel, dialogs, toasts, and other framework UI mount inside an open [shadow root](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot) attached to a dedicated `<div id="agentlet-host">` in `document.body`, instead of being appended to `document.body` directly. This isolates the panel's CSS from the host page's CSS in both directions, without changing any of the public JavaScript API.

See it in practice: [`examples/ui/style-isolation.html`](https://github.com/agentlet/agentlet-core/blob/main/examples/ui/style-isolation.html) loads a page with deliberately hostile CSS and shows the panel rendering unaffected by it, and vice versa.

## What is isolated

- **CSS in both directions.** The host page's stylesheets (resets, generic element selectors like `button` or `h3`, global `font-family` or `color` on `body`) no longer reach into the panel, dialogs, or toasts. Symmetrically, the framework's own stylesheet no longer leaks out into the host page.
- **IDs and classes.** `#agentlet-container`, `#agentlet-toggle`, `.agentlet-dialog-overlay`, and every other framework ID or class live inside the shadow root, so they cannot collide with IDs or classes the host page reuses, and a host page selector targeting them matches nothing.
- **`document.querySelector`/`getElementById` no longer see the UI.** `document.getElementById('agentlet-container')` returns `null`. The panel is only reachable by piercing the shadow root, see [Consequences for agentlet authors](#consequences-for-agentlet-authors).

### Theming through CSS custom properties

Before shadow DOM, a host page could restyle the panel directly:

```css
/* Before: reached into the panel directly, no longer matches anything */
body.theme-vscode #agentlet-container {
    background: #1e1e1e !important;
}
```

Under shadow DOM, page-level rules like this stop matching anything, silently, with no error. Customization now goes through the `--agentlet-*` CSS custom properties, or through the theme API:

```css
/* After: set the same custom properties the panel's own stylesheet reads */
body.theme-vscode {
    --agentlet-background-color: #1e1e1e;
    --agentlet-action-button-background: #3c3c3c;
    --agentlet-action-button-text: #cccccc;
}
```

```javascript
// Or do the same thing from JavaScript at any time
window.agentlet.themeManager.updateTheme({
    backgroundColor: '#1e1e1e',
    actionButtonBackground: '#3c3c3c',
    actionButtonText: '#cccccc',
});
window.agentlet.ui.regenerateStyles();
```

Dialogs (info, fullscreen, wait, ...) are currently painted with inline styles built once from a theme snapshot captured when `AgentletCore` initializes, not from these CSS custom properties, so a theme change made after initialization does not retroactively restyle already-configured dialog colors.

## What is not isolated

- **JavaScript globals.** `window.agentlet`, `window.AgentletCore`, and anything else a module or the host page puts on `window` is shared as before. The shadow root only isolates rendering and CSS, not the JavaScript execution context.
- **Events bubble out, with retargeting.** A click inside the panel still bubbles up through `document`, so page-level listeners keep firing. What changes is `event.target`: once the event crosses the shadow boundary, the platform retargets it to the shadow host (`#agentlet-host`) rather than exposing the real element inside the shadow tree. Use `event.composedPath()[0]` when you need the actual originating element.
- **CSS custom properties still inherit through.** `all: initial` on `:host` resets every inheritable CSS property except custom properties, which are excluded from that reset by the CSS spec. This is why the `--agentlet-*` theme variables, injected into `<head>` on `:root` regardless of `shadowDom`, still cascade into the shadow tree and keep theming working.
- **z-index still competes with the host page.** The shadow host is a normal element in the page's DOM and stacking context; putting the panel in a shadow root does not give it a separate stacking context or exempt it from the host page's own high z-index elements. See [Layering and z-index](/docs/guides/z-index/).
- **`position: fixed` behaves the same.** Elements positioned `fixed` inside the shadow tree are still positioned relative to the viewport (or a transformed or filtered ancestor) exactly as they would be outside a shadow root.

## The `shadowDom` option

```javascript
const agentlet = new AgentletCore({
    shadowDom: true, // default; set to false to opt out
});
```

- `shadowDom: true` (the default): the panel, dialogs, toasts, and other framework UI mount inside `#agentlet-host`'s shadow root, as described above.
- `shadowDom: false`: restores the exact pre-shadow-DOM behavior. Every framework element is appended directly to `document.body`, and the UI stylesheet goes into `<head>` instead of into the shadow root. This is a transition escape hatch for agentlets that depend on reaching into the panel from page-level CSS or `document.querySelector`, and is expected to be removed in a later major version. New agentlets should not rely on it.

## Consequences for agentlet authors

- **Use `window.agentlet.ui.root` / `window.agentlet.ui.query()` / `window.agentlet.ui.queryAll()`** instead of `document.querySelector` / `document.getElementById` / `document.querySelectorAll` to reach framework UI elements. `window.agentlet.ui.root` is the `ShadowRoot` when `shadowDom` is enabled, or `document.body` when it is disabled, so code written against `ui.root`/`ui.query()`/`ui.queryAll()` works unchanged either way.
- **`Module.injectStyles(css)` targets the UI root.** When the module is mounted (see [Mount API](/docs/guides/mount-api/)), `injectStyles()` appends its `<style>` element to the root captured from the mount context, the shadow root in the default `shadowDom: true` mode, so the CSS reaches the module's own content rendered inside it. In `shadowDom: false` mode, and before a module has ever been mounted, it falls back to `document.head`.
- **`document.activeElement` returns `#agentlet-host`**, not the actually focused element, once focus is inside the shadow root. Use `window.agentlet.ui.root.activeElement` to get the real focused element inside the panel or dialog.
- **Keyboard shortcuts already handle this.** The shortcut manager resolves the real event target via `event.composedPath()` rather than `event.target`, so shortcuts keep working the same whether they originate inside the shadow root or on the host page.
- **`PageHighlighter`, `ElementSelector`, and `ScreenCapture` stay in the page DOM by design.** These utilities draw overlays directly on top of host-page elements being selected, highlighted, or captured, so they need to live in the same DOM and stacking context as those elements rather than inside the panel's shadow root.
- **Standalone use of `Dialog`/`MessageBubble` without `AgentletCore`** falls back to mounting in `document.body` when no `window.agentlet.ui.root` exists yet. The shadow root is only used once an `AgentletCore` instance has created one and pointed these shared instances at it.

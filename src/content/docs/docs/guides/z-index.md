---
title: Layering and z-index
description: Keep the agentlet panel and dialogs above the host application's content.
---

Agentlets inject UI elements into existing web applications, which means they need to appear above the host application's content. `window.agentlet.utils.zIndex` helps pick a z-index base that will not collide with the host page.

## Where the panel is mounted

By default, the panel, dialogs, and toasts live inside an open shadow root rather than being appended directly to `document.body`, see [Shadow DOM](/docs/guides/shadow-dom/). This isolates the panel's CSS from the host page, but the shadow host element is still a normal part of the page's DOM and stacking context, so z-index still competes with the host application exactly as described below.

## Constants

`window.agentlet.utils.zIndex.constants` (base `100000` by default) exposes one property per layer, from lowest to highest: `BASE`, `INPUT`, `BUTTON`, `BACKDROP`, `SELECTION_BACKDROP`, `HIGHLIGHT_BACKDROP`, `MODAL_BACKDROP`, `HOVER_HIGHLIGHT`, `ELEMENT_HIGHLIGHT`, `SELECTION_HIGHLIGHT`, `ACTIVE_SELECTION`, `TOOLTIP`, `MESSAGE_BUBBLE`, `NOTIFICATION`, `PANEL`, `PANEL_CONTENT`, `PANEL_HEADER`, `DIALOG`, `DIALOG_OVERLAY`, `INFO_DIALOG`, `INPUT_DIALOG`, `PROGRESS_DIALOG`, `FULLSCREEN_DIALOG`, `LOADING_OVERLAY`, `ERROR_OVERLAY`, `IMAGE_OVERLAY`, and `CRITICAL_OVERLAY`, always the top-most layer.

`MODAL_BACKDROP` and `DIALOG_OVERLAY` are intentionally the same value.

```javascript
const Z = window.agentlet.utils.zIndex.constants;
element.style.zIndex = Z.MESSAGE_BUBBLE;
```

## Building constants for a custom base

```javascript
const Z = window.agentlet.utils.zIndex.createConstants(75000);
element.style.zIndex = Z.PANEL;
element.style.zIndex = Z.DIALOG;
```

`createConstants(base?)` returns a plain object with the same layer names as `constants`, offset from the given base.

## Detecting the host page's z-index usage

```javascript
const result = window.agentlet.utils.zIndex.detect({ excludeAgentlet: true });
// { maxZIndex, maxElement, totalElements, agentletBase, isSafe }

console.log(`Max z-index on the page: ${result.maxZIndex}`);
console.log(`Safe to use the default base: ${result.isSafe}`);
```

`excludeAgentlet` (default behavior scans the whole document) excludes the framework's own elements from the scan.

## Getting a suggested base

```javascript
const suggestion = window.agentlet.utils.zIndex.suggest();
// { current, suggested, detection, recommendation }

console.log(suggestion.recommendation);
if (suggestion.suggested !== suggestion.current) {
    const Z = window.agentlet.utils.zIndex.createConstants(suggestion.suggested);
    // Apply Z to your agentlet's elements
}
```

## Full analysis

```javascript
const analysis = window.agentlet.utils.zIndex.analyze();
// { detection, agentletBase, summary: { totalElements, maxZIndex, agentletRange, status } }

console.log(analysis.summary.status);
```

## Best practices

1. Use `detect()`/`suggest()` for production agentlets targeting unknown applications, rather than a hardcoded base.
2. Use `constants` or `createConstants()` instead of hardcoded numeric values, for maintainability.
3. Respect the hierarchy: do not put a tooltip above a dialog.
4. Test on the target application to catch visual conflicts early.

Source: agentlet-core docs/z-index-usage-guide.md and src/types/public-api.d.ts at e3f78fa. The source document described a richer API (`detect()`/`suggest()` taking selector, range, and margin options; a `ranges`/`layerPreview` breakdown; a `LEGACY_Z_INDEX` mapping) that does not match the current `ZIndexAPI` type, whose `detect()` only takes `excludeAgentlet` and whose `suggest()` takes no arguments. The reference above follows the current type; the richer, options-heavy variant may reflect an earlier or planned implementation.

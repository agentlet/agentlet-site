---
title: Public API
description: Reference for window.agentlet, organized by namespace.
---

This page is a reference for the shape of `window.agentlet`, the `Module` base class, and the `AgentletCore` constructor configuration. It documents only what exists in agentlet-core's hand-written TypeScript declarations (`src/types/public-api.d.ts`) and CLAUDE.md's API quick reference. For narrative walkthroughs with worked examples, see the [Guides](/docs/guides/forms-extraction/) section; for how these types are shipped and consumed, see [TypeScript](/docs/guides/typescript/).

## `window.agentlet.ai`

- **`sendPrompt`**
  ```ts
  (prompt: string, images?: string[], options?: AIPromptOptions) => Promise<string>
  ```
  Resolves to the raw text reply. Throws if no provider is configured.

- **`sendPromptWithPDF`**
  ```ts
  (prompt: string, pdfData: PDFInputData, options?: AISendPromptWithPDFOptions) => Promise<string>
  ```
  Converts the PDF to images internally, then behaves like `sendPrompt`.

- **`convertPDFToImages`**
  ```ts
  (pdfData: PDFInputData, options?: PDFConversionOptions) => Promise<string[]>
  ```
  Base64 data URL images, one per page.

- **`isAvailable`**
  ```ts
  () => boolean
  ```

- **`getStatus`**
  ```ts
  () => AIStatus
  ```
  `AIStatus` is `{ available, currentProvider, availableProviders, pdfSupport, providerStatus }`.

- **`validateAPI`**
  ```ts
  () => Promise<AIValidateAPIResult>
  ```
  Resolves to `{ success: true, message, details }` or `{ success: false, error, details }`.

- **`setProvider`**
  ```ts
  (providerName: string) => void
  ```

- **`getAvailableProviders`**
  ```ts
  () => string[]
  ```

- **`refresh`**
  ```ts
  () => void
  ```
  Call after changing `env` values that affect the provider.

- **`manager`**: `AIManagerAPI`, same as `window.agentlet.aiManager`. Adds `getCurrentProvider()`.

`AIImageInput` is a data URL, an http(s) URL, or a bare base64 string. `PDFInputData` is a `File`, `ArrayBuffer`, `Uint8Array`, or an http(s) URL string. See [AI](/docs/guides/ai/).

## `window.agentlet.forms`

- **`extract`**
  ```ts
  (element: Element, options?: FormExtractionOptions) => FormExtractionResult
  ```

- **`exportForAI`**
  ```ts
  (element: Element, options?: FormExtractionOptions) => AIFormExport
  ```

- **`quickExport`**
  ```ts
  (element: Element) => QuickExportField[]
  ```
  `exportForAI` with hidden/disabled/bounding-box options fixed to `false`.

- **`fill`**
  ```ts
  (parentElement: Element, selectorValues: FormFillSelectorValues, options?: FormFillOptions) => FormFillResult
  ```

- **`fillFromAI`**
  ```ts
  (parentElement: Element, aiFormData: AIFormExport, userValues: Record<string, FormFillValue>, options?: FormFillOptions) => FormFillResult
  ```

- **`fillMultiple`**
  ```ts
  (parentElement: Element, formDataArray: FormFillMultipleEntry[], options?: FormFillOptions) => Promise<FormFillResult[]>
  ```

- **`extractor`**: `FormExtractorAPI`. Direct access to `extractFormStructure`/`exportForAI`/`quickExport`.

- **`filler`**: `FormFillerAPI`. Direct access to `fillForm`/`fillFromAIData`/`fillMultipleForms`.

See [Form extraction](/docs/guides/forms-extraction/), [Form filling](/docs/guides/forms-filling/), [AI-ready forms](/docs/guides/forms-ai-ready/), and [Select options](/docs/guides/forms-select-options/) for the full result shapes and examples.

## `window.agentlet.tables`

- **`extract`**
  ```ts
  (tableElement: HTMLTableElement, options?: TableExtractionOptions) => TableData
  ```

- **`extractAll`**
  ```ts
  (tableElement: HTMLTableElement, options?: TableExtractAllOptions) => Promise<TableAllPagesData>
  ```
  Pagination only runs when `nextButtonSelector` is provided.

- **`download`**
  ```ts
  (tableData: TableData | TableAllPagesData, options?: TableDownloadOptions) => Promise<TableDownloadResult>
  ```

- **`extractAndDownload`**
  ```ts
  (tableElement: HTMLTableElement, options?: TableExtractAndDownloadOptions) => Promise<TableDownloadResult>
  ```

- **`extractor`**: `TableExtractorAPI`. Adds `isExcelExportAvailable()`.

See [Tables and Excel](/docs/guides/tables-and-excel/).

## `window.agentlet.auth`

- **`isEnabled`**
  ```ts
  () => boolean | string
  ```
  May return the configured `loginUrl` string instead of strict `true`.

- **`startAuthentication`**
  ```ts
  () => Promise<void>
  ```

- **`logout`**
  ```ts
  () => Promise<void>
  ```

- **`getState`**
  ```ts
  () => AuthState
  ```
  `AuthState` is `{ enabled, authenticating, popupOpen }`.

- **`getAuthenticatedUser`**
  ```ts
  () => Record<string, unknown> | null
  ```

- **`updateConfig`**
  ```ts
  (config: Partial<AuthManagerConfig>) => void
  ```

`window.agentlet.authManager` exposes the full `AuthManagerAPI`, which adds `createLoginButton()` and `cleanup()`. See [Authentication](/docs/guides/authentication/) for `AuthManagerConfig` and IDP examples.

## `window.agentlet.utils`

### Dialog (`utils.Dialog`)

A singleton instance. `show(type, options, callback)` accepts `type` of `'info'`, `'input'`, `'wait'`, `'progress'`, `'fullscreen'`, or `'command'`, each with its own options interface (`DialogInfoOptions`, `DialogInputOptions`, `DialogWaitOptions`, `DialogProgressOptions`, `DialogFullscreenOptions`, `DialogCommandOptions`).

Convenience wrappers: `showInfo`, `showInput`, `showWait`, `showFullscreen`, `showCommandPrompt`, `showProgress` (returns `this` for chaining), `info`, `success`, `warning`, `error`, `confirm`, `yesNo`, `choice`, `prompt`, `promptPassword`, `promptEmail`, `promptTextarea`, `promptAI`, `commandPrompt`, `quickCommand`, `fullscreen`, `showAIProcessing`, `showLoading`, `showAnalyzing`, `showThinking`, `showProgressBar`, `showProgressWithSteps`, `showBatchProgress`.

Progress control: `updateProgress(percentage, message?)`, `setStep(stepIndex, stepMessage?)`, `completeProgress(message?)`, each returning `this`. `hide(result?)` closes the active dialog; `updateMessage(newMessage)` updates a `'wait'`-type dialog's message only. `setRoot(root)`/`getRoot()` control the mount point; `isActive` reports whether a dialog is open.

Every dialog type's `icon` option (info, wait, fullscreen, progress, command) defaults to its own built-in icon when left out, and accepts `''` or `null` to omit the icon entirely while keeping the rest of the header.

A dialog header's background and text colour follow the theme's `headerBackground`/`headerTextColor` (the same pair the panel header uses) whenever `dialogHeaderBackground`/`dialogHeaderTextColor` are not set explicitly: `ThemeManager.processThemeConfig()` inherits the dialog-specific pair from the panel pair together, never mixed, and derives a readable text colour by luminance if only a background is given. An already-open dialog, and one opened after `setTheme()`, both restyle live: dialog inline styles reference the same `--agentlet-dialog-*` custom properties `setTheme()` updates.

See [Dialogs and shortcuts](/docs/guides/dialogs-and-shortcuts/).

### MessageBubble (`utils.MessageBubble`)

`show(options?)` returns a bubble ID. Convenience methods: `info`, `success`, `warning`, `error`, `custom`, `toast(message, type?, duration?)`, `notify(message, type?, title?)`, `loading(message?, options?)`. Management: `hide(bubbleId)`, `hideAll()`, `getCount()`, `getBubble(bubbleId)`, `exists(bubbleId)`, `updateMessage(bubbleId, newMessage, allowHtml?)`, `updateContainerPosition(position)`, `setRoot(root)`, `init()`, `cleanup()`.

`MessageBubbleOptions`: `message`, `type` (`'info' | 'success' | 'warning' | 'error' | 'custom'`), `title`, `icon`, `duration` (ms, `0` disables auto-hide), `closable`, `allowHtml`, `position` (`'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'`), `style`, `onClick`, `onClose`.

### ElementSelector (`utils.ElementSelector`)

`start(callback, options?)` activates click-to-select mode; `options` accepts `selector` (restricts which elements can be picked) and `message` (overlay instruction text). `stop()` deactivates it. Other members: `isActive`, `getElementFromPoint(x, y)`, `isInternalElement(element)`, `isElementSelectable(element)`, `findSelectableElement(element)`, `selectElement(element)`, `highlightElement(element)`, `hideHighlight()`, `getElementInfo(element)` (returns an `ElementInfo` with tag, classes, text, attributes, position, styles, xpath, CSS selector, and visibility), `getElementAttributes(element)`, `getXPath(element)`, `generateCSSSelector(element)`, `isElementVisible(element)`.

The raw class is exposed as `window.agentlet.ElementSelectorClass` for standalone instantiation.

### ScreenCapture (`utils.ScreenCapture`)

Built on html2canvas. `isScreenCaptureAvailable()`, `ensureHTML2Canvas()`, `capturePage(options?)`, `captureElement(element, options?)`, `captureBySelector(selector, options?)`, `captureViewport(options?)`, `captureRegion(region, options?)` all resolve to an `HTMLCanvasElement`. `captureAsDataURL(target?, options?)` and `captureAsBlob(target?, options?)` return a data URL or a `Blob`. `downloadCapture(target?, options?)` triggers a file download; `copyToClipboard(target?, options?)` copies the capture. `interactiveCapture(options?)` lets the user click-select an element to capture, using `ElementSelector` and `MessageBubble`. Utilities: `canvasToDataURL`, `canvasToBlob`, `isCapturingInProgress()`, `getImageDimensions(dataURL)`, `displayImageInConsole(dataURL, captureType?)`, `createPreview(dataURL, options?)`.

### ScriptInjector (`utils.ScriptInjector`)

`inject(options)` requires one of `code`, `file`, or `func`; also accepts `tabId`, `target` (`'main' | 'isolated'`), `allFrames`, `args`. `injectModule(options)` takes `moduleCode`, `moduleUrl`, `tabId`. `cleanup()` rejects any pending injections. Static: `ScriptInjector.isExtensionEnvironment()`, `isContentScriptEnvironment()`, `createFunctionInjection(func, ...args)`. See [Script injection and registry](/docs/guides/script-injection/).

### PDFProcessor (`utils.PDFProcessor`)

`isPDFJSAvailable()`, `ensurePDFJS()`, `loadPDFJS()`, `convertPDFToImages(pdfData, options?)` (array of base64 data URL images), `fileToArrayBuffer(file)`, `convertFileInputToImages(fileInput, options?)`, `convertPDFFromURL(pdfUrl, options?)`, `displayPDFImagesInConsole(images, pdfName?)`, `createPDFPreviews(images, options?)`, `getCapabilities()` (`PDFCapabilities`: `pdfJSAvailable`, `supportedFormats`, `outputFormats`, `maxRecommendedFileSize`, `maxRecommendedPages`, `features`).

`PDFConversionOptions`: `scale` (default `1.5`), `format`, `quality`, `maxPages`.

### shortcuts (`utils.shortcuts`)

`null` when no shortcut manager was configured. `register(keys, callback, options?)` resolves to `false` (never throws) if the underlying hotkeys library could not be loaded or the arguments are invalid. `options`: `description`, `preventDefault`, `stopPropagation`, `scope`, `allowInInputs`. Other members: `unregister(keys, scope?)`, `setEnabled(enabled)`, `getShortcuts()`, `isRegistered(keys)`, `clear()`, `showHelp()`, `enabled` (a snapshot, not reactive).

`window.agentlet.shortcutManager` exposes the full `ShortcutManagerAPI`, adding `isHotkeysAvailable()`, `ensureHotkeys()`, and `registerDefaultShortcuts(config?)`. See [Dialogs and shortcuts](/docs/guides/dialogs-and-shortcuts/).

### zIndex (`utils.zIndex`)

`detect(options?: { excludeAgentlet?: boolean })`, `suggest()`, `analyze()`, `constants` (the full `ZIndexConstants` layer list), `createConstants(base?)`. See [Layering and z-index](/docs/guides/z-index/).

### PageHighlighter (`utils.PageHighlighter`)

`null` if construction failed. `showOverlay(options?)` returns an overlay control (`update`, `hide`, `destroy`); `hideOverlay(id)`, `destroyOverlay(id)`. `highlight(element, options?)` returns a highlight control, or `null` if `element` cannot be resolved; `repositionHighlight(control)`, `destroyHighlight(id)`. `createTour(steps?)` returns a tour control with `start()`, `next()`, `previous()`, `goTo(stepIndex)`, `showStep()`, `end()`. `scrollTo(target, options?)`, `scrollToTop(options?)`, `scrollToBottom(options?)`, `scrollToAndHighlight(target, options?)` all return a promise. `clearAll()` and `getStats()` round out the API.

`PageHighlighterHighlightOptions.type` is `'border' | 'arrow' | 'sticker' | 'pulse'`; `style` is `'primary' | 'success' | 'warning' | 'danger'`.

## `window.agentlet.env`, `.cookies`, `.storage`

All three are runtime `Proxy` objects that also allow arbitrary property access for variable, cookie, or key names; any name that collides with a method below is shadowed by the method.

**`env`** (`null` if disabled via `envManager: null`): `name()`, `get(key, defaultValue?)`, `set(key, value)`, `has(key)`, `remove(key)`, `clear()`, `getAll(includeSensitive?)`, `setMultiple(variables)`, `loadFromObject(envObject, merge?)`, `addChangeListener(callback)`, `removeChangeListener(callback)`, `createProxy()`. See [Environment variables](/docs/guides/environment-variables/).

**`cookies`**: `get(name, defaultValue?)`, `set(name, value, options?)`, `delete(name, options?)`, `has(name)`, `getAllCookies()`, `clearAll(options?)`, `getMatching(pattern)`, `addChangeListener(callback)`, `removeChangeListener(callback)`, `startMonitoring()`, `stopMonitoring()`, `setPollFrequency(frequency)`, `getStatistics()`, `export(format?, includeSensitive?)` (`'json' | 'netscape' | 'curl'`), `createProxy()`, `cleanup()`.

**`storage.local`** and **`storage.session`** (each a `BoundStorageAPI`): `get(key, defaultValue?)`, `set(key, value)`, `remove(key)`, `has(key)`, `clear()`, `getAll(includeSensitive?)`, `getMatching(pattern)`, `getJSON(key, defaultValue?)`, `setJSON(key, value)`, `setMultiple(items)`, `addChangeListener(callback)`, `removeChangeListener(callback)`, `getStatistics()`, `export(format?, includeSensitive?)` (`'json' | 'csv' | 'tsv'`). `storage.manager` (also `window.agentlet.storageManager`) exposes the same operations with an explicit `storageType` parameter on each call.

## `window.agentlet.Module` and the module lifecycle

`AgentletModule`, exposed as `window.agentlet.Module`, is the base class agentlets extend. There is no `Submodule` base class in the current codebase.

```typescript
class MyAgentlet extends window.agentlet.Module {
    constructor() {
        super({ name: 'my-agentlet', version: '1.0.0', patterns: ['example.com'] });
    }

    async initModule() { /* one-time setup, called once by init() */ }
    async activateModule(context) { /* runs on activation and URL changes */ }
    async mount(container, context) { container.innerHTML = this.getContent(); }
    async unmount(container) { /* tear down what mount() set up */ }
    async cleanupModule(context) { /* runs on deactivation */ }

    getContent() { return '<div>Hello</div>'; }
}
```

`ModuleConfig`: `name`, `version?`, `description?`, `patterns: ModulePatternMatcher | ModulePatternMatcher[]`, `eventBus?`. A `ModulePatternMatcher` is a plain string, matched as a substring, or `{ type: 'includes' | 'exact' | 'regex', value: string }`. As a string, `'*'` alone matches any non-empty URL, and a string containing `*` elsewhere is a simple, unanchored glob where `*` matches any run of characters, for example `'localhost:*/admin'`.

Instance state: `name`, `version`, `description`, `patterns`, `isActive`, `eventBus?`, `mounted` (true between a successful `mount()` and the matching `unmount()`), `mountedContainer`, `performanceMetrics`, `isInitialized?`.

Outer lifecycle entry points, called by the framework: `init()`, `activate(context?)`, `cleanup(context?)`. Override the matching inner hooks instead: `initModule()`, `activateModule(context?)`, `cleanupModule(context?)`. See [Mount API](/docs/guides/mount-api/) for `mount(container, context)` and `unmount(container)`, including the `ModuleMountContext` and `ModuleMountTrigger` shapes.

Other members: `checkPattern(url)`, `getContent()`, `getMetadata()`, `on(event, callback)`, `off(event, callback)`, `emit(event, data?)` (notifies local listeners, then forwards to `this.eventBus` if set), `removeAllEventListeners()`, `injectStyles(css)` (cumulative, appended to a single `<style data-module="...">` element), `removeAllStyles()`, `log(message, ...args)`, `error(message, ...args)`, `warn(message, ...args)`.

Optional duck-typed hooks the core looks for, none required: `getStyles?()` (CSS injected before each mount since 2.2.0, see [Mount API](/docs/guides/mount-api/#getstyles)), `getPanelTitle?()` (labels the panel header instead of `name`), `showSettings?()`, `showHelp?()`, `setSubmoduleChangeCallback?(callback)`, `requiresLocalStorageChangeNotification?`, `onLocalStorageChange?(key, newValue)`.

## `AgentletCoreConfig`

Passed to `new AgentletCore(config)`. Each option is optional; additional keys are also accepted and spread over the defaults (`[key: string]: unknown`).

- **`enablePlugins`**: `boolean`
- **`registryUrl`**: `string`. See [Script injection and registry](/docs/guides/script-injection/).
- **`debugMode`**: `boolean`. Enables `window.agentlet.debug`. Also gates the core's own informational logging: with `debugMode` unset or `false` (the default), agentlet-core writes nothing to the console beyond `console.warn`/`console.error` (never gated); the roughly 40 `console.log` calls the core used to make unconditionally on every `init()` are now routed through an internal logger that only writes when `debugMode` is `true`.
- **`minimizeWithImage`**: `string | null`. Image shown when the panel is minimized.
- **`startMinimized`**: `boolean`
- **`showEnvVarsButton`**, **`showRefreshButton`**, **`showSettingsButton`**, **`showHelpButton`**: `boolean`. Panel header buttons.
- **`envManager`**: `EnvAPI | null`. Pass `null` to disable environment variables entirely.
- **`resizablePanel`**: `boolean`
- **`minimumPanelWidth`**: `number`
- **`shadowDom`**: `boolean`, default `true`. See [Shadow DOM](/docs/guides/shadow-dom/).
- **`quickCommandDialogShortcut`**: `boolean`, default `false`. Enables the `Ctrl`/`Cmd`+`;` shortcut.
- **`quickCommandCallback`**: `(result: unknown) => void | null`
- **`auth`**: `AuthManagerConfig`. See [Authentication](/docs/guides/authentication/).
- **`env`**: `Record<string, string>`. Loaded at startup, merged over any existing values.
- **`theme`**: `string | Partial<AgentletTheme>`
- **`skipRegistryModuleRegistration`**: `boolean`
- **`pdfWorkerUrl`**: `string`. URL of the `pdf.worker.min.mjs` file matching the bundled `pdfjs-dist` version. Always applied when set, in every build (not gated on whether `window.pdfjsLib` looks already configured). Without it, the worker resolves relative to the registry URL when `registryUrl` is set (including a relative one, resolved against the page), or otherwise to `'./pdf.worker.min.mjs'` relative to the page. There is no automatic third-party (CDN) fallback: if no worker is reachable, PDF conversion fails with an error naming this option and `configurePDFWorker()`. The npm package ships the matching worker at `dist/pdf.worker.min.mjs`, next to `dist/agentlet-core.min.js`.

## `window.agentlet.ui`

`show()`, `hide()`, `minimize()`, `maximize()`, `refreshContent()`, `regenerateStyles()`, `resizePanel(size)` (`'small' | 'medium' | 'large' | number`), `getPanelWidth()`, `setPanelWidth(width)`, `query(selector)`, `queryAll(selector)`. DOM references, `null` before `init()` completes: `container`, `content`, `header`, `actions`, `imageOverlay`, `root` (the `ShadowRoot` or `document.body`), `host` (`null` in `shadowDom: false` mode).

## `window.agentlet.theme` and `themeManager`

`theme` is the current `AgentletTheme` snapshot. `window.agentlet.themeManager.getTheme()` returns it fresh; `updateTheme(newThemeConfig)` merges and returns the updated theme; `processThemeConfig(themeConfig)` normalizes a theme config without applying it. See [Shadow DOM](/docs/guides/shadow-dom/#theming-through-css-custom-properties) for the `--agentlet-*` custom property bridge.

**`window.agentlet.setTheme(newThemeConfig)`** merges `newThemeConfig` into the theme defaults, re-injects the panel's CSS, updates `window.agentlet.theme`, and emits `theme:changed` on `window.agentlet.eventBus` with a `ThemeChangedEventPayload` (`{ theme, previousTheme }`). It returns the fully merged `AgentletTheme` now in effect. This is the entry point a theme change goes through; calling `themeManager.updateTheme()` alone does not re-inject styles or notify anything. See [Mount API](/docs/guides/mount-api/#reacting-to-a-theme-change) for subscribing to the change from a mounted module.

## `window.agentlet.eventBus`

`emit(event, data?)`, `on(event, callback)`, `off(event, callback)`, `request(event, data?)` (calls only the first registered listener), `getEvents()`, `getListenerCount(event)`, `clear()`, `clearEvent(event)`. Event names are plain strings; common ones emitted by the framework include `module:registered`, `module:activated`, `module:deactivated`, `module:initialized`, `module:cleaned`, `url:changed`, `core:initialized`, `core:cleanup`, `ui:contentUpdated`, `ui:error`, `ui:stylesRegenerated`, `localStorage:changed`, and `theme:changed` (payload: `ThemeChangedEventPayload`, `{ theme, previousTheme }`, emitted by `agentlet.setTheme()`).

## `window.agentlet.modules`

`get(name)`, `getAll()`, `register(module)`, `unregister(name)`. Backed by the same underlying registry as `moduleManager`/`moduleRegistry` below, so all three agree on every registered module regardless of how it was registered (constructor, `register()`, an eager or lazy registry entry, or `moduleRegistry.loadModule()`).

`window.agentlet.moduleManager` and `window.agentlet.moduleRegistry` expose lower-level equivalents used internally, including `activate(module, context?)`, `getStatistics()`, and `findMatchingModule(url?)`. `moduleRegistry` additionally exposes:

- **`loadModule`**
  ```ts
  (entry: AgentletRegistryEntry) => Promise<AgentletModule>
  ```
  Loads a single registry entry on demand: fetches `entry.url`, reads `window[entry.module]`, instantiates and registers it, the same loading code the eager registry load uses, then resolves with the module instance. Unlike the eager load, this never activates the module, even if its pattern matches the current URL; call `activateModule()` explicitly afterwards. Resolves with the already-registered instance, without reloading, if `entry.name` is already loaded. `AgentletRegistryEntry` is `{ name, url, module, lazy? }`.

- **`getRegistryEntries`**
  ```ts
  () => AgentletRegistryEntryStatus[]
  ```
  Lists every registry entry seen so far, eagerly loaded or `lazy: true`, in the order the registry declared them, each annotated with `loaded: boolean`. Empty when no `registryUrl` was configured, or before the registry has finished loading.

A registry entry's **`lazy`** field (`boolean`, default `false`), set in the registry file itself (see [Script injection and registry](/docs/guides/script-injection/#lazy-entries)), skips that entry in `init()`'s eager registry load. It is still listed by `getRegistryEntries()` (with `loaded: false`), for building a "load more" or launcher-style UI, and can be loaded on demand with `loadModule()`. A lazy entry is not a candidate for URL-based module detection (`findMatchingModule()`, or the automatic re-detection on navigation) until it has actually been loaded.

URL-based re-detection (`checkUrlChange()`, the core's 1-second poll and its `popstate`/`hashchange`/`pushState`/`replaceState` listeners) only re-derives the active module when the URL actually changed, or when nothing is active yet. On a URL change, an already-active module whose own pattern still matches the new URL is left running rather than re-evaluated from scratch, so a module activated explicitly (for example from a launcher-style module offering several choices on the same page) is not silently reverted by the next poll tick.

## `window.agentlet.debug`

Only present when `AgentletCore` was constructed with `debugMode: true`: `getMetrics()`, `getConfig()`, `getStatistics()`, plus direct references `eventBus`, `envManager`, `cookieManager`, `storageManager`.

Source: agentlet-core src/types/public-api.d.ts and CLAUDE.md, API Quick Reference, at 6f24ed2 (agentlet-core 2.2.0).

---
title: The agentlet approach
description: The philosophy behind agentlet and its technical consequences.
---

## Guiding principles

The core philosophy behind agentlet is to offer a flexible framework for fast, sometimes breaking, innovation that augments existing applications with minimal effort. Agentlets are designed as tactical tools: they let teams rapidly improve processes, test ideas, or temporarily enhance applications while waiting for more robust, long-term solutions.

Because they operate directly in the user interface, agentlets are tightly connected to how applications are actually used, making them particularly valuable in professional contexts where understanding user workflows, bottlenecks, and low-value repetitive tasks can unlock meaningful efficiency gains.

Agentlet favors speed over perfection: it is a framework where small, targeted improvements can be deployed quickly, with the understanding that things may occasionally break and will need rapid fixing. When the complexity or weight of a feature grows too large, it is usually a sign that agentlet is no longer the right tool.

Agentlets, whether used as bookmarklets or browser extensions, are not meant to replace deeper system integrations. Instead, they act as a practical overlay, for instance to deliver AI-powered enhancements and productivity gains without requiring backend changes. While they help bridge the gap between ideal architecture and real-world constraints, the most sustainable and robust benefits ultimately come from natively embedding AI features into the core of your application.

## Technical consequences

To apply this approach responsibly, agentlet development follows some key technical principles:

- **Focus on specific needs and pages**: design agentlets for clear, well-identified use cases, tailoring behaviors to specific pages or contexts. Avoid making them overly generic or applying changes globally. The more precise the targeting (for example, matching specific URLs), the more effective and maintainable the augmentation.

- **Respect existing styles**: align the agentlet UI with the host application's look, without polluting or overwriting its CSS.

- **Offer opt-in features**: surface new capabilities via a side panel or on user demand, rather than imposing automatic changes.

- **Assist but do not override**: fill out forms to save time, but never auto-submit. Leave final control to the user. Also preserve original app behavior: trigger the right JavaScript events to integrate cleanly without breaking existing interactions.

- **Keep each agentlet small and leverage APIs**: keep the code of each agentlet minimal. This is about your agentlet, not the agentlet-core bundle, which is large because it includes html2canvas, pdf.js and SheetJS (see [Install](/docs/getting-started/install/#size)). If an agentlet becomes too heavy or complex, rethink whether it still fits within the agentlet approach. When more advanced logic or data operations are needed, rely on existing backend APIs or services. This avoids overloading the front end with complex responsibilities, improves maintainability, and enables sophisticated augmentations without compromising performance or stability.

## Comparison with robots

While agentlets can in some ways be seen as small local robots, the kind used in RPA (robotic process automation), they are not true bots: they fully depend on the context of the user's active tab and cannot autonomously operate or control the browser as a whole. They enhance, but do not replace, the user's interaction.

**Installation and deployment**

| Variant | Rating |
|---|---|
| Robot | Heavy: desktop and backend install |
| Agentlet (bookmarklet) | Light: bookmarklet injection, nothing to install |
| Agentlet extension | Light: browser extension |
| Agentlet native | Light: served by host app, no user install |

**Autonomy**

| Variant | Rating |
|---|---|
| Robot | Fully autonomous, no user needed |
| Agentlet (bookmarklet) | User action required: active tab, click |
| Agentlet extension | Semi-autonomous: limited to browser and user context |
| Agentlet native | Semi-autonomous: runs in page, still user context |

**Security and scope of action**

| Variant | Rating |
|---|---|
| Robot | Full access: OS, files, apps |
| Agentlet (bookmarklet) | Page privileges: same access as the host page, browser only |
| Agentlet extension | Extended permissions via extension APIs, browser limited |
| Agentlet native | Page privileges: same access as the host app, no external access |

**Robustness to UI changes**

| Variant | Rating |
|---|---|
| Robot | Fragile: UI changes often break it |
| Agentlet (bookmarklet) | Can be robust with good selectors and JS |
| Agentlet extension | Same as bookmarklet |
| Agentlet native | Very robust: tight to app code, controlled env |

**Performance**

| Variant | Rating |
|---|---|
| Robot | Often slow: simulates human actions |
| Agentlet (bookmarklet) | Instant: direct DOM manipulation |
| Agentlet extension | Same as bookmarklet |
| Agentlet native | Same as bookmarklet |

**Relies on user context**

| Variant | Rating |
|---|---|
| Robot | Yes |
| Agentlet (bookmarklet) | Yes |
| Agentlet extension | Yes |
| Agentlet native | Yes |

**Interacts with page like a user**

| Variant | Rating |
|---|---|
| Robot | Yes |
| Agentlet (bookmarklet) | Yes |
| Agentlet extension | Yes |
| Agentlet native | Yes |

**Goes beyond current page**

| Variant | Rating |
|---|---|
| Robot | Yes |
| Agentlet (bookmarklet) | No, only within the single page app |
| Agentlet extension | Yes, cross-page within the browser |
| Agentlet native | No, only within the app or page context |

**Goes beyond the browser**

| Variant | Rating |
|---|---|
| Robot | Yes, system-wide |
| Agentlet (bookmarklet) | No |
| Agentlet extension | No |
| Agentlet native | No |

**Interacts with embedded elements**

| Variant | Rating |
|---|---|
| Robot | Limited: surface level only |
| Agentlet (bookmarklet) | Deep: full DOM access and manipulation |
| Agentlet extension | Deep: same, with extension APIs |
| Agentlet native | Deep: full access to app DOM |

## Comparison with userscripts and extensions

Userscripts (Tampermonkey and similar) and hand-written browser extensions solve a similar problem: changing a page you do not own. They are often the simpler choice.

| | Userscript | Hand-written extension | agentlet-core |
|---|---|---|---|
| Install for the user | A userscript manager, then the script | The extension | Nothing for a bookmarklet, or nothing if the app embeds it |
| Runs without a click on matching pages | Yes | Yes | Only when embedded or loaded by an extension. A bookmarklet needs a click |
| Pages with a strict Content Security Policy | Works | Works | A CDN bookmarklet is blocked |
| Panel UI, form, table, screenshot and AI helpers | Write them yourself | Write them yourself | Included |
| Module lifecycle and URL matching, including single page app navigation | Match rules in the script header | Match rules in the manifest | Included |
| Cross-origin requests and background work | `GM_xmlhttpRequest` and storage APIs | Full extension APIs | Same limits as the host page |

Choose a userscript when only you will use the script and you are happy to install a manager. Choose a hand-written extension when you need browser APIs, background work, requests that ignore the page's CORS rules, or a store listing. agentlet-core can still sit inside an extension as the panel and helper layer. Choose agentlet when colleagues should run the tool from a bookmark without installing anything, when the host app can load it directly, or when you want the same panel, helpers and lifecycle across all three ways of shipping it.

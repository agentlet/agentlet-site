---
title: The agentlet approach
description: The philosophy behind agentlet and its technical consequences.
---

## Guiding principles

The core philosophy behind agentlet is to offer a lightweight, flexible framework for fast, sometimes breaking, innovation that augments existing applications with minimal effort. Agentlets are designed as tactical tools: they let teams rapidly improve processes, test ideas, or temporarily enhance applications while waiting for more robust, long-term solutions.

Because they operate directly in the user interface, agentlets are tightly connected to how applications are actually used, making them particularly valuable in professional contexts where understanding user workflows, bottlenecks, and low-value repetitive tasks can unlock meaningful efficiency gains.

Agentlet favors speed over perfection: it is a framework where small, targeted improvements can be deployed quickly, with the understanding that things may occasionally break and will need rapid fixing. When the complexity or weight of a feature grows too large, it is usually a sign that agentlet is no longer the right tool.

Agentlets, whether used as bookmarklets or browser extensions, are not meant to replace deeper system integrations. Instead, they act as a practical overlay, for instance to deliver AI-powered enhancements and productivity gains without requiring backend changes. While they help bridge the gap between ideal architecture and real-world constraints, the most sustainable and robust benefits ultimately come from natively embedding AI features into the core of your application.

## Technical consequences

To apply this approach responsibly, agentlet development follows some key technical principles:

- **Focus on specific needs and pages**: design agentlets for clear, well-identified use cases, tailoring behaviors to specific pages or contexts. Avoid making them overly generic or applying changes globally. The more precise the targeting (for example, matching specific URLs), the more effective and maintainable the augmentation.

- **Respect existing styles**: align the agentlet UI with the host application's look, without polluting or overwriting its CSS.

- **Offer opt-in features**: surface new capabilities via a side panel or on user demand, rather than imposing automatic changes.

- **Assist but do not override**: fill out forms to save time, but never auto-submit. Leave final control to the user. Also preserve original app behavior: trigger the right JavaScript events to integrate cleanly without breaking existing interactions.

- **Stay lightweight and leverage APIs**: keep agentlet code minimal. If it becomes too heavy or complex, rethink whether it still fits within the agentlet approach. When more advanced logic or data operations are needed, rely on existing backend APIs or services. This avoids overloading the front end with complex responsibilities, improves maintainability, and enables sophisticated augmentations without compromising performance or stability.

## Comparison with robotic process automation

While agentlets can in some ways be seen as lightweight local RPA (robotic process automation) tools, they are not true bots: they fully depend on the context of the user's active tab and cannot autonomously operate or control the browser as a whole. They enhance, but do not replace, the user's interaction.

| Aspect | RPA | Agentlet (bookmarklet) | Agentlet extension | Agentlet native |
|---|---|---|---|---|
| Installation and deployment | Heavy: desktop and backend install | Lightweight: bookmarklet injection | Lightweight: browser extension | Lightweight: served by host app, no user install |
| Autonomy | Fully autonomous, no user needed | User action required: active tab, click | Semi-autonomous: limited to browser and user context | Semi-autonomous: runs in page, still user context |
| Security and scope of action | Full access: OS, files, apps | Sandboxed: no external access, browser only | Extended permissions via extension APIs, browser limited | Sandboxed inside app, no external access |
| Robustness to UI changes | Fragile: UI changes often break it | Can be robust with good selectors and JS | Same as bookmarklet | Very robust: tight to app code, controlled env |
| Performance | Often slow: simulates human actions | Instant: direct DOM manipulation | Same as bookmarklet | Same as bookmarklet |
| Relies on user context | Yes | Yes | Yes | Yes |
| Interacts with page like a user | Yes | Yes | Yes | Yes |
| Goes beyond current page | Yes | No, only within the single page app | Yes, cross-page within the browser | No, only within the app or page context |
| Goes beyond the browser | Yes, system-wide | No | No | No |
| Interacts with embedded elements | Limited: surface level only | Deep: full DOM access and manipulation | Deep: same, with extension APIs | Deep: full access to app DOM |

Source: agentlet-core README.md, section "The agentlet approach".

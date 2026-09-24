---
title: Deployment modes
description: Choosing between bookmarklet, browser extension, and native deployment.
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

Agentlet offers three deployment approaches: bookmarklets for instant deployment, browser extensions for enhanced capabilities, and native integration for applications that can embed the framework directly. Each approach delivers the same core augmentation capabilities while adapting to different technical environments and constraints. See [Architecture](/docs/concepts/architecture/) for how each mode works under the hood.

<Tabs>
  <TabItem label="Bookmarklet">
    A bookmark whose URL is `javascript:` code. No installation: the user adds
    it to their bookmarks bar and clicks it on any page.

    - Fastest to deploy: no store review, no packaging.
    - Injected code only lives for the current page session; a full reload
      clears it.
    - Cannot access privileged browser APIs (tabs, storage, `webRequest`).
    - Best for: quick augmentations, prototypes, and single page apps where
      the user re-triggers the bookmarklet after navigation is rare.
  </TabItem>
  <TabItem label="Browser extension">
    A packaged, installed extension with content scripts, background
    scripts, and privileged browser APIs.

    - Persists across browsing sessions and can auto-inject on specific
      sites.
    - Requires packaging, signing, and distribution through an extension
      store, or side-loading in corporate environments.
    - Best for: agentlets that need to run automatically, persist state, or
      go beyond a single tab.
  </TabItem>
  <TabItem label="Native integration">
    The same code that would be injected by a bookmarklet is instead loaded
    directly by the host website, for example via a `<script>` tag in the
    page template.

    - No user installation: the host application serves the bundle itself.
    - Useful where backend deployments are slow but frontend asset updates
      are simple.
    - Best for: graduating a proven bookmarklet-based feature into a
      permanent part of the application's frontend.
  </TabItem>
</Tabs>

## Choosing a mode

Moving from a bookmarklet to an extension is often a natural evolution when the injected code grows beyond the bookmarklet's technical limits, for example needing persistent background behavior, access to browser-level data, automatic injection on specific sites, or a richer user interface. It also means adopting additional tooling, build steps, and maintenance overhead.

Native integration is typically the last step: once a bookmarklet or extension-based agentlet has proven its value, the same code can be loaded directly by the host application's frontend, removing the need for the user to install or trigger anything at all.

Source: agentlet-core README.md, sections "Agentlet" and "Architecture".

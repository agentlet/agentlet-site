---
title: Quick start
description: Build and run a first agentlet in two minutes from npm or a CDN bookmarklet, without cloning anything.
---

This takes about two minutes and needs no clone of the agentlet-core repository. You get a side panel that counts the forms and tables on the page, with a button that downloads the first table as an Excel file.

## As a bookmarklet

1. Create a new bookmark in your browser and paste this single line as its URL. It loads `agentlet-core` from [jsDelivr](https://www.jsdelivr.com/) and registers a small module. It works the same when pasted into the DevTools console.

```text wrap
javascript:(async () => { if (!window.agentlet) { await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/agentlet-core@2/dist/agentlet-core.min.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); await new window.AgentletCore.default().init(); } class PageSummary extends window.agentlet.Module { constructor() { super({ name: 'page-summary', patterns: '*' }); } getContent() { const forms = document.querySelectorAll('form').length; const tables = document.querySelectorAll('table').length; return `<p>This page has ${forms} form(s) and ${tables} table(s).</p> <button onclick="window.agentlet.tables.extractAndDownload(document.querySelector('table'), { filename: 'table.xlsx' })"> Download the first table as Excel </button>`; } } if (!window.agentlet.modules.get('page-summary')) { window.agentlet.modules.register(new PageSummary()); } })();
```

2. Open a page that has a table, for example a Wikipedia list article, and click the bookmark.
3. The side panel opens on the right. Click "Download the first table as Excel".

The readable source of that bookmarklet:

```javascript
(async () => {
    if (!window.agentlet) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/agentlet-core@2/dist/agentlet-core.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        await new window.AgentletCore.default().init();
    }

    class PageSummary extends window.agentlet.Module {
        constructor() {
            super({ name: 'page-summary', patterns: '*' });
        }

        getContent() {
            const forms = document.querySelectorAll('form').length;
            const tables = document.querySelectorAll('table').length;
            return `<p>This page has ${forms} form(s) and ${tables} table(s).</p>
                <button onclick="window.agentlet.tables.extractAndDownload(document.querySelector('table'), { filename: 'table.xlsx' })">
                    Download the first table as Excel
                </button>`;
        }
    }

    if (!window.agentlet.modules.get('page-summary')) {
        window.agentlet.modules.register(new PageSummary());
    }
})();
```

Notes and limits:

- `agentlet-core@2` follows the latest 2.x release. Pin an exact version such as `agentlet-core@2.3.0` if you want reproducible behaviour.
- The bookmarklet loads a script from a CDN, so it needs network access and does not work on pages whose Content Security Policy forbids that. For example, github.com refuses the script (`script-src`), and nothing appears. On such pages, embed the bundle in the app or use a browser extension. See [Deployment modes](/docs/concepts/deployment-modes/).
- A bookmarklet runs only when you click it. It is not re-injected after a page reload.
- In the browser global build, the class is `window.AgentletCore.default`, and `window.agentlet` exists once `init()` has resolved.
- Pass a `filename` to `tables.extractAndDownload()`, as above.

## Limit a module to one site

The examples above use `patterns: '*'`, so the module is active on every page. To run it only on one site, give the host and set `matchMode: 'host'` (in the next release of agentlet-core):

```javascript
super({ name: 'page-summary', patterns: 'example.com', matchMode: 'host' });
```

This matches `example.com` and its subdomains, such as `app.example.com`, and nothing else. Without `matchMode: 'host'`, a string pattern matches any URL that contains it, including `https://evil.test/?q=example.com`. See [matching URLs](/docs/reference/public-api/#matching-urls-with-matchmode) for ports, paths and the other forms.

## From npm, in your own page

```bash
mkdir my-agentlet && cd my-agentlet
npm init -y
npm install agentlet-core
```

Save this as `index.html` in that folder, serve the folder (for example with `python3 -m http.server 8000`) and open `http://localhost:8000`:

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>My first agentlet</title>
</head>
<body>
    <h1>Orders</h1>
    <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Amount</th></tr></thead>
        <tbody>
            <tr><td>1001</td><td>Acme</td><td>120.50</td></tr>
            <tr><td>1002</td><td>Globex</td><td>89.00</td></tr>
        </tbody>
    </table>

    <script src="node_modules/agentlet-core/dist/agentlet-core.min.js"></script>
    <script type="module">
        const core = new window.AgentletCore.default();
        await core.init();

        class OrdersExport extends window.agentlet.Module {
            constructor() {
                super({ name: 'orders-export', patterns: '*' });
            }

            getContent() {
                const rows = document.querySelectorAll('tbody tr').length;
                return `<p>${rows} orders on this page.</p>
                    <button onclick="window.agentlet.tables.extractAndDownload(document.querySelector('table'), { filename: 'orders.xlsx' })">
                        Download as Excel
                    </button>`;
            }
        }

        window.agentlet.modules.register(new OrdersExport());
    </script>
</body>
</html>
```

Here `new window.AgentletCore.default()` is the same class you get from `import AgentletCore from 'agentlet-core'` in a bundler. See [Install](/docs/getting-started/install/) for the ESM and CommonJS import forms, and for the size of the bundle.

## Next steps

- [Quick demo](/docs/getting-started/quick-demo/): run the built-in examples from the core repository.
- [Scaffold an agentlet](/docs/getting-started/scaffold/): generate a project for a real agentlet.
- [Generate with Claude Code](/docs/getting-started/generate-with-claude-code/): have an agentlet drafted from a live page.
- [Forms](/docs/guides/forms-extraction/), [tables and Excel](/docs/guides/tables-and-excel/) and [AI](/docs/guides/ai/): the helpers this panel can call.

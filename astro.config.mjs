import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { startKnownSitesServer } from './scripts/serve-known-sites.mjs';
import { resetMetafiles, writeMetafile } from './scripts/lib/metafile.mjs';
import { AGENTLET_REOPEN_SCRIPT } from './src/scripts/agentlet-inline-snippets.mjs';

/**
 * Dev only: starts the small server that serves the locally built
 * `@agentlet/demos` package (scripts/serve-known-sites.mjs), so the
 * known-sites bookmarklet on /try/known-sites/ can point at
 * http://localhost:4400/ while developing. It is not a route of this dev
 * server on purpose: see the comment at the top of that script.
 */
function knownSitesDevServer() {
  return {
    name: 'agentlet-known-sites-dev',
    apply: 'serve',
    configureServer(server) {
      const demos = startKnownSitesServer();
      server.httpServer?.on('close', () => demos.close());
    },
  };
}

/**
 * Production build only, and only when SBOM_META_DIR is set (the security
 * workflow sets it): records which node_modules packages end up in the
 * client chunks of the site's own pages (Starlight, React islands), for the
 * dependency vulnerability scan. The result is written in the shape of an
 * esbuild metafile (`{ inputs: { "node_modules/<pkg>/<file>": {} } }`) so the
 * shared sbom-from-esbuild action can read it. It goes to
 * SBOM_META_DIR/astro/, outside dist/, so it is never deployed.
 *
 * Packages whose browser code is not a Rollup module but a static file
 * written outside the bundle graph are listed by hand in STATIC_ASSET_PACKAGES
 * (Pagefind writes dist/pagefind/*.js, expressive-code writes
 * dist/_astro/ec.*.js). The site has no framework islands: React only runs
 * at build time and inside the /cdn/v1/ bundles, which the esbuild
 * metafiles cover.
 *
 * Module ids are absolute paths, sometimes with a `?query` suffix or a
 * leading NUL byte (virtual modules). Only ids under this project's
 * node_modules are kept, made relative to the project root.
 */
const STATIC_ASSET_PACKAGES = ['pagefind', 'astro-expressive-code', '@expressive-code/plugin-frames'];

function clientModulesMetafile() {
  const root = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
  const inputs = Object.fromEntries(STATIC_ASSET_PACKAGES.map((name) => [`node_modules/${name}/package.json`, {}]));
  return {
    name: 'agentlet-client-modules-metafile',
    apply: 'build',
    buildStart() {
      if (this.environment?.name === 'client') resetMetafiles('astro');
    },
    generateBundle(_options, bundle) {
      if (this.environment?.name !== 'client') return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of chunk.moduleIds ?? []) {
          const clean = id.replace(/[?#].*$/, '').replace(/\\/g, '/');
          if (!clean.startsWith(`${root}/node_modules/`)) continue;
          inputs[clean.slice(root.length + 1)] = {};
        }
      }
      writeMetafile('astro', 'client-modules', { inputs, outputs: {} });
    },
  };
}

export default defineConfig({
  site: 'https://agentlet.io',
  vite: {
    plugins: [knownSitesDevServer(), ...(process.env.SBOM_META_DIR ? [clientModulesMetafile()] : [])],
  },
  integrations: [
    starlight({
      title: 'agentlet',
      description: 'A side panel for web apps you cannot change: read and fill forms, export tables to Excel, capture the page and call an AI model.',
      logo: {
        light: './src/assets/brand/agentlet-lockup-light.svg',
        dark: './src/assets/brand/agentlet-lockup-dark.svg',
        replacesTitle: true,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/agentlet/agentlet-core' },
      ],
      favicon: '/favicon.svg',
      customCss: [
        '@fontsource/ibm-plex-sans/latin-400.css',
        '@fontsource/ibm-plex-sans/latin-500.css',
        '@fontsource/ibm-plex-sans/latin-600.css',
        '@fontsource/ibm-plex-mono/latin-400.css',
        '@fontsource/ibm-plex-mono/latin-500.css',
        './src/styles/starlight-theme.css',
      ],
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://agentlet.io/brand/agentlet-social-1280x640.png' },
        },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://agentlet.io/brand/agentlet-social-1280x640.png' },
        },
        // Reopens the live demo only if a previous page left it open
        // (sessionStorage flag); downloads nothing otherwise. Tiny and
        // inline on purpose, see src/scripts/agentlet-inline-snippets.mjs.
        // The landing layout injects the exact same script, see
        // src/layouts/LandingLayout.astro.
        { tag: 'script', content: AGENTLET_REOPEN_SCRIPT },
      ],
      plugins: [
        // /try/bookmarklet/ and /try/known-sites/ are plain Astro pages, not
        // part of the docs content collection, so this plugin cannot resolve
        // them as slugs; excluded rather than dropping the links from the
        // docs (docs/live-demo.md, docs/guides/known-sites.md).
        starlightLinksValidator({ exclude: ['/try/bookmarklet/', '/try/known-sites/'] }),
      ],
      sidebar: [
        { label: 'Introduction', slug: 'docs' },
        { label: 'Live demo', slug: 'docs/live-demo' },
        { label: 'Try it on real sites', link: '/try/known-sites/' },
        {
          label: 'Getting started',
          items: [
            { label: 'Quick start', slug: 'docs/getting-started/quick-start' },
            { label: 'Install', slug: 'docs/getting-started/install' },
            { label: 'Quick demo', slug: 'docs/getting-started/quick-demo' },
            { label: 'Scaffold an agentlet', slug: 'docs/getting-started/scaffold' },
            { label: 'Generate with Claude Code', slug: 'docs/getting-started/generate-with-claude-code' },
            { label: 'Manual setup', slug: 'docs/getting-started/manual-setup' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'The agentlet approach', slug: 'docs/concepts/approach' },
            { label: 'Architecture', slug: 'docs/concepts/architecture' },
            { label: 'Deployment modes', slug: 'docs/concepts/deployment-modes' },
            { label: 'Security', slug: 'docs/concepts/security' },
          ],
        },
        {
          label: 'Guides',
          items: [
            {
              label: 'Forms',
              items: [
                { label: 'Extraction', slug: 'docs/guides/forms-extraction' },
                { label: 'Filling', slug: 'docs/guides/forms-filling' },
                { label: 'AI-ready forms', slug: 'docs/guides/forms-ai-ready' },
                { label: 'Select options', slug: 'docs/guides/forms-select-options' },
              ],
            },
            { label: 'Tables and Excel', slug: 'docs/guides/tables-and-excel' },
            { label: 'Move data between apps', slug: 'docs/guides/move-data-between-apps' },
            { label: 'AI', slug: 'docs/guides/ai' },
            { label: 'Authentication', slug: 'docs/guides/authentication' },
            { label: 'Environment variables', slug: 'docs/guides/environment-variables' },
            { label: 'Dialogs and shortcuts', slug: 'docs/guides/dialogs-and-shortcuts' },
            { label: 'Shadow DOM', slug: 'docs/guides/shadow-dom' },
            { label: 'Mount API', slug: 'docs/guides/mount-api' },
            { label: 'TypeScript', slug: 'docs/guides/typescript' },
            { label: 'Script injection and registry', slug: 'docs/guides/script-injection' },
            { label: 'Known-site demos', slug: 'docs/guides/known-sites' },
            { label: 'Layering and z-index', slug: 'docs/guides/z-index' },
          ],
        },
        {
          label: 'Reference',
          items: [{ label: 'Public API', slug: 'docs/reference/public-api' }],
        },
        {
          label: 'Contributing',
          items: [
            { label: 'Commit rules', slug: 'docs/contributing/commit-rules' },
            { label: 'Documentation style', slug: 'docs/contributing/documentation-style' },
          ],
        },
      ],
    }),
  ],
});

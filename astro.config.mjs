import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { AGENTLET_REOPEN_SCRIPT } from './src/scripts/agentlet-inline-snippets.mjs';

export default defineConfig({
  site: 'https://agentlet.io',
  integrations: [
    starlight({
      title: 'agentlet',
      description: 'Augment your web apps, without touching the backend.',
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
      plugins: [starlightLinksValidator()],
      sidebar: [
        { label: 'Introduction', slug: 'docs' },
        { label: 'Live demo', slug: 'docs/live-demo' },
        {
          label: 'Getting started',
          items: [
            { label: 'Install', slug: 'docs/getting-started/install' },
            { label: 'Quick demo', slug: 'docs/getting-started/quick-demo' },
            { label: 'Scaffold an agentlet', slug: 'docs/getting-started/scaffold' },
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
            { label: 'AI', slug: 'docs/guides/ai' },
            { label: 'Authentication', slug: 'docs/guides/authentication' },
            { label: 'Environment variables', slug: 'docs/guides/environment-variables' },
            { label: 'Dialogs and shortcuts', slug: 'docs/guides/dialogs-and-shortcuts' },
            { label: 'Shadow DOM', slug: 'docs/guides/shadow-dom' },
            { label: 'Mount API', slug: 'docs/guides/mount-api' },
            { label: 'TypeScript', slug: 'docs/guides/typescript' },
            { label: 'Script injection and registry', slug: 'docs/guides/script-injection' },
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

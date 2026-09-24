import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://agentlet.io',
  integrations: [
    starlight({
      title: 'agentlet',
      description: 'Augment your web applications without friction.',
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
      ],
      sidebar: [
        {
          label: 'Docs',
          items: [
            { label: 'Introduction', slug: 'docs' },
            { label: 'Getting started', slug: 'docs/getting-started' },
          ],
        },
      ],
    }),
  ],
});

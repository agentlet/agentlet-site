import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://agentlet.io',
  integrations: [
    starlight({
      title: 'agentlet',
      description: 'Augment your web applications without friction.',
      logo: {
        src: './src/assets/agentlet-logo.png',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/agentlet/agentlet-core' },
      ],
      favicon: '/favicon.svg',
      customCss: ['./src/styles/starlight-theme.css'],
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

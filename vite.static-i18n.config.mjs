import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    lib: {
      entry: 'src/siteI18n.ts',
      name: 'BaakioSiteI18n',
      formats: ['iife'],
      fileName: () => 'site-i18n.js',
    },
  },
})

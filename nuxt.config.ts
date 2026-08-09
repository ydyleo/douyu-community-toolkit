export default defineNuxtConfig({
  compatibilityDate: '2026-07-30',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE
        || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:4000' : ''),
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'theme-color', content: '#171410' },
        { name: 'color-scheme', content: 'light' },
      ],
    },
  },
  nitro: {
    compressPublicAssets: true,
    preset: 'static',
    prerender: {
      ignore: ['/api/analytics/userscript-install'],
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
})

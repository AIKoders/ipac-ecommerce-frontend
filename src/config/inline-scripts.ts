/**
 * Scripts that must run before first paint, inlined in <head>. Astro's CSP
 * only hashes the scripts it bundles, so astro.config.ts hashes these by hand:
 * the source here is the single place both the page and the policy read.
 */
export const INLINE_SCRIPTS = {
  /** Marks the document as scripted so reveal-on-scroll can hide its targets without a flash. */
  jsFlag: "document.documentElement.classList.add('js')",
  /**
   * Home only, right before the hero: the full intro plays on the first visit
   * of a session; after that the page is marked so the scene assembles in place.
   */
  heroIntro: "try{sessionStorage.getItem('ipac.intro')?document.documentElement.classList.add('intro-seen'):sessionStorage.setItem('ipac.intro','1')}catch(e){}",
  /** 404 only: one static file answers every unknown URL, so the language is chosen from the address before the page paints. */
  notFoundLocale: "if(location.pathname.split('/')[1]==='es'){document.documentElement.classList.add('is-es');document.documentElement.lang='es'}",
} as const;

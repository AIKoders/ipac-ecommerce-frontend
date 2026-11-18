// KPulse's maintenance windows for the ipac storefront (KPulse → Incidents →
// Maintenance, project ipac, component Storefront): while one runs, every
// on-demand route answers KPulse's maintenance page (503) before anything of
// ours runs; the team passes with the window's bypass link. Prerendered pages
// have no server in front of them, so the layout loads KPulse's page script
// (status.aikoders.us/maintenance.js) with the same project and component.
//
// The state is kept in memory and refreshed every ~20 s, so a request never
// waits on KPulse; with no answer from it, nothing is closed. Staging and
// previews ask for `development`, which production windows never close.
//
// Server-only.

import { KPULSE_ENVIRONMENT as CONFIGURED_ENVIRONMENT, KPULSE_URL } from 'astro:env/server';
import { site } from '@/config/site';
import { createMaintenance } from './maintenance';

export const KPULSE_ENVIRONMENT = CONFIGURED_ENVIRONMENT || (process.env.VERCEL_ENV === 'production' ? 'production' : 'development');

export const maintenance = createMaintenance({
  endpoint: KPULSE_URL,
  project: site.kpulse.project,
  component: site.kpulse.component,
  environment: KPULSE_ENVIRONMENT,
});

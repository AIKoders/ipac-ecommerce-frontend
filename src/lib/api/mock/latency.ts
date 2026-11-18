/**
 * Simulated network time, so loading states are real while the backend is a
 * mock. There is none while the site builds.
 */
export const LATENCY = { read: 90, write: 110, auth: 850, order: 950, form: 600 } as const;

export function wait(ms: number): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

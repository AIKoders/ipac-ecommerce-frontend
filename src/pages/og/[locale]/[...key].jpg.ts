import type { APIRoute, GetStaticPaths } from 'astro';
import { allCards, renderCard, type OgCard } from '@/lib/og';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => (await allCards()).map((card) => ({ params: { locale: card.locale, key: card.key }, props: { card } }));

export const GET: APIRoute = async ({ props }) => {
  const image = await renderCard((props as { card: OgCard }).card);
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } });
};

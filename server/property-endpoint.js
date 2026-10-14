import { loadPublishedConfig, loadDraftConfig } from './city-content.js';
import { staffSession } from './staff-auth.js';
import { handlePropertyRequest } from './property-appraiser.js';

export async function handleCityPropertyRequest(request, env, fetcher = fetch) {
  const preview = new URL(request.url).searchParams.get('contentPreview') === '1';
  if (preview && (await staffSession(request, env))?.role !== 'admin') return Response.json({ error: 'Administrator access is required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const config = preview ? await loadDraftConfig(env) : await loadPublishedConfig(env);
  return handlePropertyRequest(request, fetcher, config.city);
}

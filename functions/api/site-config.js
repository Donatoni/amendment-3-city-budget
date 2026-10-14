import { handleSiteConfig } from '../../server/city-content.js';
export const onRequest = ({ request, env }) => handleSiteConfig(request, env);

import { handleCityMedia } from '../../../server/city-content.js';
export const onRequest = ({ request, env }) => handleCityMedia(request, env);

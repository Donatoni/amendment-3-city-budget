import { handleCityPropertyRequest } from '../../server/property-endpoint.js';
export const onRequest = ({ request, env }) => handleCityPropertyRequest(request, env);

import { handleDashboardRequest } from '../../server/dashboard-api.js';
export const onRequest = ({ request, env }) => handleDashboardRequest(request, env);

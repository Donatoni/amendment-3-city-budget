import { runtimeConfig } from './site-runtime.js';
import { activeRevenues } from './budget-model.js';

export const COST_CENTERS = Object.fromEntries(runtimeConfig().budget.services.map(service => [service.id, service.cuts]));
export const POTENTIAL_REVENUES = activeRevenues();
export const costCenterTotal = serviceId => COST_CENTERS[serviceId].reduce((sum, item) => sum + Math.round(item.savings * 100), 0) / 100;

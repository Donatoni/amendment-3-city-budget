import { runtimeConfig } from './site-runtime.js';
import { SERVICES, REDUCTION_TARGET_M } from './budget.js';

import { COST_CENTERS, POTENTIAL_REVENUES, costCenterTotal } from './cost-center-data.js';
export { COST_CENTERS, POTENTIAL_REVENUES };
export const COST_CENTER_VERSION = runtimeConfig().budget.version;

export const ALL_COST_CENTERS = SERVICES.flatMap(service =>
  COST_CENTERS[service.id].map(item => ({ ...item, serviceId: service.id, serviceName: service.name })));

export function selectedCostCenters(ids) {
  const selected = new Set(ids);
  return ALL_COST_CENTERS.filter(item => selected.has(item.id));
}

export function selectedMillageRate(revenueIds, rate) {
  const selected = new Set(revenueIds).has('millage-rate');
  const value = rate === undefined ? (selected ? 1 : 0) : rate;
  if (!Number.isFinite(value) || value < 0 || value > 1 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-9
    || selected !== (value > 0)) throw new Error('Choose a millage increase from 0 to 1 mill in 0.1-mill steps.');
  return Math.round(value * 10) / 10;
}

export function costCenterPlan(ids, revenueIds = [], millageRate) {
  const items = selectedCostCenters(ids);
  const selectedRevenue = new Set(revenueIds);
  const rate = selectedMillageRate(selectedRevenue, millageRate);
  const revenues = POTENTIAL_REVENUES.filter(item => selectedRevenue.has(item.id)).map(item => item.id === 'millage-rate'
    ? { ...item, amount: Math.round(item.amount * rate * 100) / 100, millageRate: rate, name: `${item.name} (+${rate.toFixed(1)} ${rate === 1 ? 'mill' : 'mills'})` }
    : item);
  const reductionCents = items.reduce((sum, item) => sum + Math.round(item.savings * 100), 0);
  const revenueCents = revenues.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  return {
    items, revenues, millageRate: rate,
    values: SERVICES.map(service => (Math.round(costCenterTotal(service.id) * 100)
      - items.filter(item => item.serviceId === service.id).reduce((sum, item) => sum + Math.round(item.savings * 100), 0)) / 1e8),
    reduction: reductionCents / 100,
    revenue: revenueCents / 100,
    gapClosed: (reductionCents + revenueCents) / 100,
    targetMet: reductionCents + revenueCents >= Math.round(REDUCTION_TARGET_M * 1e8),
  };
}

// Compact display only; calculations and submission thresholds retain cents.

import { runtimeConfig } from './site-runtime.js';

export function budgetModel(config = runtimeConfig()) {
  const services = config.budget.services.map(service => ({ ...service,
    cutExamples: Array.from({ length: 4 }, (_, index) => service.cutExamples?.[index] || "Service impacts depend on the selected choices and city review."),
    proposed: service.cuts.reduce((sum, item) => sum + Math.round(item.savings * 100), 0) / 1e8,
  }));
  return { services, version: config.budget.version, target: config.budget.target,
    total: services.reduce((sum, item) => sum + Math.round(item.proposed * 1e8), 0) / 1e8,
    items: services.flatMap(service => service.cuts.map(item => ({ ...item, serviceId: service.id, serviceName: service.name }))),
    revenues: activeRevenues(config) };
}
// Staff can switch an option off (the millage slider) without losing its settings.
export const activeRevenues = (config = runtimeConfig()) => config.budget.revenues.filter(item => item.enabled !== false);

// Fixed-size share images summarize overflow; every department remains in the
// interactive plan, and grouped rows retain the complete funding totals.
export function budgetDisplayRows(values, config = runtimeConfig(), limit = 5) {
  const rows = budgetModel(config).services.map((service, index) => ({ ...service, value: values[index] }));
  if (rows.length <= limit) return rows;
  const remaining = rows.slice(limit - 1);
  return [...rows.slice(0, limit - 1), {
    id: 'remaining-departments', name: `${remaining.length} more departments`,
    proposed: remaining.reduce((sum, row) => sum + Math.round(row.proposed * 1e8), 0) / 1e8,
    value: remaining.reduce((sum, row) => sum + Math.round(row.value * 1e8), 0) / 1e8,
  }];
}

export function configuredPlan(ids, revenueIds = [], millageRate, config = runtimeConfig()) {
  const model = budgetModel(config);
  const selected = new Set(ids);
  const selectedRevenue = new Set(revenueIds);
  if ([...selectedRevenue].some(id => !model.revenues.some(item => item.id === id))) throw new Error('This revenue option is not available.');
  const value = millageRate === undefined ? (selectedRevenue.has('millage-rate') ? 1 : 0) : millageRate;
  if (!Number.isFinite(value) || value < 0 || value > 1 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-9
    || selectedRevenue.has('millage-rate') !== (value > 0)) throw new Error('Choose a millage increase from 0 to 1 mill in 0.1-mill steps.');
  const rate = Math.round(value * 10) / 10;
  const items = model.items.filter(item => selected.has(item.id));
  const revenues = model.revenues.filter(item => selectedRevenue.has(item.id)).map(item => item.id === 'millage-rate'
    ? { ...item, amount: Math.round(item.amount * rate * 100) / 100, millageRate: rate, name: `${item.name} (+${rate.toFixed(1)} ${rate === 1 ? 'mill' : 'mills'})` } : item);
  const cutCents = items.reduce((sum, item) => sum + Math.round(item.savings * 100), 0);
  const revenueCents = revenues.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  return { items, revenues, millageRate: rate,
    values: model.services.map(service => (Math.round(service.proposed * 1e8) - items.filter(item => item.serviceId === service.id).reduce((sum, item) => sum + Math.round(item.savings * 100), 0)) / 1e8),
    reduction: cutCents / 100, revenue: revenueCents / 100, gapClosed: (cutCents + revenueCents) / 100,
    targetMet: cutCents + revenueCents >= Math.round(model.target * 100) };
}

import { SERVICES, PROPOSED_TOTAL, fmtM } from './budget.js';

const palette = ['#ec8c77', '#4f80ed', '#e6b44d', '#49b4a0', '#a08bd3', '#6ca9ce'];
export const SERVICE_COLORS = SERVICES.map((service, index) => palette[index % palette.length]);

// Keep the original budget as the scale when reducing funding. The striped
// remainder is the reduction, so removed funding never appears reallocated.
// Plans above the baseline expand the scale to keep every segment visible.
export function budgetComposition(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const scale = Math.max(values.reduce((sum, value) => sum + Math.max(0, value), 0), PROPOSED_TOTAL);
  const reduction = Math.max(0, PROPOSED_TOTAL - total);
  return {
    total,
    percentages: values.map(value => scale ? Math.max(0, value) / scale * 100 : 0),
    description: `${SERVICES.map((service, index) => `${service.name}: ${fmtM(values[index])}`).join('; ')}. ${fmtM(reduction)} reduced from the proposed budget.`,
  };
}

import { uiText, uiHTML } from './ui-text.js';
import { escapeText } from './site-runtime.js';
import { SERVICES, fmtUSD } from './budget.js';
import { COST_CENTERS, POTENTIAL_REVENUES, costCenterPlan } from './cost-centers.js';
import { SERVICE_COLORS } from './budget-composition.js';

export function initCostCenterBuilder(container, selected, onChange) {
  SERVICES.forEach((service, index) => {
    const card = document.createElement('article');
    card.className = `svc cost-center-card svc-${service.id}`;
    card.style.setProperty('--service-color', SERVICE_COLORS[index]);
    card.setAttribute('aria-labelledby', `service-title-${service.id}`);
    card.innerHTML = `
      <div class="cost-center-head">
        <div class="svc-identity">
          <span class="mini-icon ${service.tone}"><svg aria-hidden="true"><use href="#icon-${service.icon}"></use></svg></span>
          <div><span class="svc-index">${uiHTML('ui_service_department', { number: String(index + 1).padStart(2, '0') })}</span><h4 class="svc-name" id="service-title-${service.id}">${escapeText(service.name)}</h4></div>
        </div>
        <p class="cost-center-baseline">${uiHTML('ui_service_baseline', { amount: fmtUSD(service.proposed * 1e6) })}</p>
        <div class="cost-center-totals"><div><span>${uiHTML('ui_service_kept')}</span><strong id="amt-${service.id}"></strong></div><div><span>${uiHTML('ui_service_cuts')}</span><strong id="delta-${service.id}"></strong></div></div>
      </div>
      <div class="cost-center-scroll" tabindex="0" role="region" aria-label="${uiHTML('ui_service_choices', { department: service.name })}">
      <fieldset class="cost-center-options"><legend>${uiHTML('ui_service_legend', { department: service.name })}</legend>
        ${COST_CENTERS[service.id].map(item => `
          <label class="cost-choice" for="cut-${item.id}">
            <input type="checkbox" id="cut-${item.id}" value="${item.id}" aria-labelledby="name-${item.id} price-${item.id}" aria-describedby="effect-${item.id}" />
            <span class="cost-choice-copy"><span class="cost-choice-title" id="name-${item.id}">${escapeText(item.name)}</span><span class="cost-choice-impact" id="effect-${item.id}">${escapeText(item.impact)}${item.savings < 0 ? uiHTML('ui_service_negative', { amount: fmtUSD(-item.savings) }) : ''}</span>${item.descriptionStatus === 'draft' ? `<span class="description-draft">${uiHTML('ui_service_draft')}</span>` : ''}</span>
            <span class="cost-choice-price" id="price-${item.id}"><strong>${fmtUSD(item.savings)}</strong><span class="cost-choice-state">${uiHTML('ui_service_select')}</span></span>
          </label>`).join('')}
      </fieldset>
      </div>
      <p class="cost-center-footer" id="count-${service.id}"></p>`;
    container.append(card);
  });
  container.addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) selected.add(event.target.value);
    else selected.delete(event.target.value);
    onChange();
  });
  return function render(plan = costCenterPlan(selected)) {
    SERVICES.forEach((service, index) => {
      const card = container.querySelector(`.svc-${service.id}`);
      const cuts = plan.items.filter(item => item.serviceId === service.id);
      card.classList.toggle('is-cut', cuts.length > 0);
      card.querySelector(`#amt-${service.id}`).textContent = fmtUSD(plan.values[index] * 1e6);
      card.querySelector(`#delta-${service.id}`).textContent = fmtUSD(cuts.reduce((sum, item) => sum + item.savings, 0));
      card.querySelector(`#count-${service.id}`).textContent = cuts.length
        ? uiText('ui_service_count', { count: cuts.length, total: COST_CENTERS[service.id].length })
        : uiText('ui_service_all_kept');
      card.querySelectorAll('input').forEach(input => {
        input.checked = selected.has(input.value);
        input.closest('label').classList.toggle('is-selected', input.checked);
        input.closest('label').querySelector('.cost-choice-state').textContent = uiText(input.checked ? 'ui_service_selected' : 'ui_service_select');
      });
    });
  };
}

export function initRevenueBuilder(container, selected, onChange, adjustment = { millageRate: selected.has('millage-rate') ? 1 : 0 }) {
  // With every option switched off, the whole Potential Revenue section is hidden.
  container.closest('.revenue-section')?.toggleAttribute('hidden', !POTENTIAL_REVENUES.length);
  container.innerHTML = `<fieldset class="cost-center-options"><legend>${uiHTML('ui_revenue_legend')}</legend>${POTENTIAL_REVENUES.map(item => item.id === 'millage-rate' ? `
    <div class="cost-choice millage-choice">
      <div class="cost-choice-copy"><label class="cost-choice-title" for="revenue-millage-rate">${escapeText(item.name)}</label><p class="cost-choice-impact" id="revenue-effect-millage-rate">${uiHTML('ui_revenue_millage_explanation', { amount: fmtUSD(item.amount / 10) })}</p></div>
      <div class="cost-choice-price"><strong id="millage-revenue-amount"></strong><span class="cost-choice-state">${uiHTML('ui_revenue_annual')}</span></div>
      <div class="millage-control"><div class="millage-control-label"><span>${uiHTML('ui_revenue_rate_increase')}</span><output for="revenue-millage-rate" id="millage-rate-value"></output></div><input type="range" id="revenue-millage-rate" min="0" max="1" step="0.1" value="0" aria-describedby="revenue-effect-millage-rate" /><div class="millage-scale" aria-hidden="true"><span>${uiHTML('ui_revenue_no_increase')}</span><span>${uiHTML('ui_revenue_max_increase')}</span></div></div>
    </div>` : `
    <label class="cost-choice" for="revenue-${item.id}">
      <input type="checkbox" id="revenue-${item.id}" value="${item.id}" aria-labelledby="revenue-name-${item.id} revenue-price-${item.id}" aria-describedby="revenue-effect-${item.id}" />
      <span class="cost-choice-copy"><span class="cost-choice-title" id="revenue-name-${item.id}">${escapeText(item.name)}</span><span class="cost-choice-impact" id="revenue-effect-${item.id}">${escapeText(item.description)} <span class="revenue-assumption">${escapeText(item.assumption)}</span></span></span>
      <span class="cost-choice-price" id="revenue-price-${item.id}"><strong>+${fmtUSD(item.amount)}</strong><span class="cost-choice-state">${uiHTML('ui_revenue_select')}</span></span>
    </label>`).join('')}</fieldset>`;
  container.addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) selected.add(event.target.value);
    else selected.delete(event.target.value);
    onChange();
  });
  container.querySelector('#revenue-millage-rate')?.addEventListener('input', event => {
    adjustment.millageRate = Number(event.target.value);
    if (adjustment.millageRate > 0) selected.add('millage-rate');
    else selected.delete('millage-rate');
    onChange();
  });
  return () => {
    const rate = selected.has('millage-rate') ? adjustment.millageRate : 0;
    const slider = container.querySelector('#revenue-millage-rate');
    if (slider) {
    slider.value = String(rate);
    slider.style.setProperty('--range-progress', `${rate * 100}%`);
    slider.setAttribute('aria-valuetext', uiText(rate === 1 ? 'ui_revenue_millage_one' : 'ui_revenue_millage_many', { rate: rate.toFixed(1), amount: fmtUSD(POTENTIAL_REVENUES.find(item => item.id === 'millage-rate').amount * rate) }));
    container.querySelector('#millage-rate-value').textContent = uiText(rate === 1 ? 'ui_revenue_rate_one' : 'ui_revenue_rate_many', { rate: rate.toFixed(1) });
    container.querySelector('#millage-revenue-amount').textContent = `+${fmtUSD(POTENTIAL_REVENUES.find(item => item.id === 'millage-rate').amount * rate)}`;
    container.querySelector('.millage-choice').classList.toggle('is-selected', rate > 0);
    }
    container.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = selected.has(input.value);
      const label = input.closest('label');
      label.classList.toggle('is-selected', input.checked);
      label.querySelector('.cost-choice-state').textContent = uiText(input.checked ? 'ui_revenue_selected' : 'ui_revenue_select');
    });
  };
}

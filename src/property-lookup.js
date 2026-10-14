import { taxMoney } from './tax-comparison.js';
import { runtimeConfig } from './site-runtime.js';
import { DEFAULT_CITY } from './volusia-cities.js';

export function initPropertyLookup({ onSelect, onClear, homeInput, homeSlider }) {
  const city = runtimeConfig()?.city ?? DEFAULT_CITY;
  const form = document.querySelector('#property-search');
  const query = document.querySelector('#property-query');
  const status = document.querySelector('#property-status');
  const results = document.querySelector('#property-results');
  const detail = document.querySelector('#property-detail');
  const source = document.querySelector('#property-source');
  const entryPrompt = document.querySelector('#calc-entry-prompt');
  let controller;
  let version = 0;

  function cancel() {
    version++;
    controller?.abort();
    form.removeAttribute('aria-busy');
    results.removeAttribute('aria-busy');
    form.querySelector('button').textContent = 'Search';
  }
  function resetSearch() {
    cancel();
    query.value = '';
    results.replaceChildren();
    detail.hidden = true;
    detail.replaceChildren();
    status.textContent = '';
  }
  function clearProperty() {
    resetSearch();
    source.hidden = true;
    source.replaceChildren();
    entryPrompt.textContent = 'or try an estimate';
    status.textContent = 'Property cleared. Enter a value or search for another property.';
    onClear?.({ resetValue: true });
    query.focus();
  }
  async function request(payload) {
    cancel();
    const current = version;
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    form.setAttribute('aria-busy', 'true');
    results.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/property${typeof location !== 'undefined' && new URL(location.href).searchParams.get('contentPreview') === '1' ? '?contentPreview=1' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Property search is temporarily unavailable. Use the official search below or enter your value manually.');
      return current === version ? data : null;
    } catch (error) {
      if (current === version) status.textContent = error.name === 'AbortError'
        ? 'The county search took too long. Try again or enter your assessed value manually.'
        : error instanceof SyntaxError ? 'Property search is temporarily unavailable. Use the official search below or enter your value manually.' : error.message;
      return null;
    } finally {
      clearTimeout(timer);
      if (current === version) {
        form.removeAttribute('aria-busy');
        results.removeAttribute('aria-busy');
        form.querySelector('button').textContent = 'Search';
      }
    }
  }
  function addText(parent, tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    parent.append(element);
    return element;
  }
  function addHomesteadStatus(parent, property) {
    const status = addText(parent, 'div', '');
    status.className = `property-homestead ${property.homestead ? 'is-recorded' : 'is-unrecorded'}`;
    const heading = addText(status, 'div', '');
    heading.className = 'property-homestead-heading';
    const icon = addText(heading, 'span', property.homestead ? '✓' : '!');
    icon.className = 'property-homestead-icon';
    icon.setAttribute('aria-hidden', 'true');
    addText(heading, 'span', property.homestead ? 'Homestead recorded' : 'No homestead recorded');
    addText(status, 'p', property.homestead
      ? 'The county lists this property as homesteaded. Amendment 3 eligibility still needs to be confirmed.'
      : 'The county does not currently list homestead for this property. No homestead savings will be applied.');
    const link = addText(status, 'a', 'Check eligibility requirements ↗');
    link.href = 'https://vcpa.vcgov.org/exemption/homestead';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  async function select(key) {
    detail.hidden = true;
    detail.replaceChildren();
    for (const button of results.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
    status.textContent = 'Loading assessed value…';
    const data = await request({ key });
    if (!data) return;
    const property = data.property;
    detail.hidden = false;
    for (const button of results.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.key === key));
    }
    addText(detail, 'span', 'County property record').className = 'property-detail-eyebrow';
    const heading = addText(detail, 'h3', property.address);
    heading.tabIndex = -1;
    const meta = addText(detail, 'div', '');
    meta.className = 'property-detail-meta';
    addText(meta, 'span', `Parcel ${property.parcel}`);
    addText(meta, 'span', `${property.year} ${property.rollStatus} tax roll`);
    if (!property.inCity || (property.city && property.city !== city.name)) {
      addText(detail, 'p', `Tax district: ${property.district}. This record does not list ${city.name} municipal operating taxes. This city-only calculator does not apply to this property.`);
    } else {
      const value = addText(detail, 'div', '');
      value.className = 'property-detail-value';
      addText(value, 'span', 'Assessed value before exemptions');
      addText(value, 'strong', taxMoney(property.assessedValue));
      if (property.cityTax) {
        const tax = addText(detail, 'div', '');
        tax.className = 'property-detail-value';
        addText(tax, 'span', `${property.year} ${city.name} operating tax · county estimate`);
        addText(tax, 'strong', taxMoney(property.cityTax.amount));
        addText(detail, 'p', `City taxable value ${taxMoney(property.cityTax.taxableValue)} × ${property.cityTax.millage} mills ÷ 1,000. ${property.cityTax.rateStatus} rate; not a final tax bill.`);
      } else {
        addText(detail, 'p', 'The county city-tax amount is unavailable. Applying this value will use a clearly labeled modeled estimate.');
      }
      if (property.rollStatus === 'working') addText(detail, 'p', 'Working tax-roll values may change before certification.');
      addHomesteadStatus(detail, property);
      const use = addText(detail, 'button', 'Use this property');
      use.type = 'button';
      use.className = 'btn btn-primary';
      use.addEventListener('click', () => {
        onSelect(property.assessedValue, property);
        source.replaceChildren();
        const header = addText(source, 'div', '');
        header.className = 'property-source-header';
        addText(header, 'span', 'Using county record').className = 'property-source-label';
        const clear = addText(header, 'button', 'Clear property');
        clear.type = 'button';
        clear.className = 'property-clear';
        clear.addEventListener('click', clearProperty);
        addText(source, 'strong', property.address);
        const record = addText(source, 'a', `${property.year} ${property.rollStatus} tax roll · View record ↗`);
        record.href = property.sourceURL;
        record.target = '_blank';
        record.rel = 'noopener noreferrer';
        source.hidden = false;
        entryPrompt.textContent = 'Value from your property record';
        resetSearch();
        homeInput.focus({ preventScroll: true });
      });
    }
    const link = addText(detail, 'a', 'View official property record ↗');
    link.href = property.sourceURL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    status.textContent = 'Property record loaded. Review the details below.';
    heading.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    results.replaceChildren();
    detail.hidden = true;
    status.textContent = 'Searching Volusia County property records…';
    const pending = request({ query: query.value.trim() });
    form.querySelector('button').textContent = 'Searching…';
    const data = await pending;
    if (!data) return;
    status.textContent = data.properties.length
      ? `${data.properties.length}${data.hasMore ? '+' : ''} ${data.properties.length === 1 && !data.hasMore ? 'property' : 'properties'} found. Select a property to review.${data.hasMore ? ' More matches are available; add a street number or parcel ID to narrow your search.' : ''}`
      : 'No matching properties found. Try a street number and street name, or the parcel ID from your tax notice.';
    for (const property of data.properties) {
      const item = document.createElement('li');
      const button = addText(item, 'button', '');
      button.type = 'button';
      button.dataset.key = property.key;
      button.setAttribute('aria-pressed', 'false');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'property-result-icon');
      icon.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#icon-home');
      icon.append(use);
      button.append(icon);
      const copy = addText(button, 'span', '');
      copy.className = 'property-result-copy';
      addText(copy, 'strong', property.address);
      addText(copy, 'span', `Parcel ${property.parcel}`);
      const arrow = addText(button, 'span', '→');
      arrow.className = 'property-result-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => select(property.key));
      results.append(item);
    }
  });
  query.addEventListener('input', () => {
    cancel();
    results.replaceChildren();
    detail.hidden = true;
    status.textContent = '';
  });
  for (const input of [homeInput, homeSlider]) input.addEventListener('input', () => {
    source.hidden = true;
    entryPrompt.textContent = 'or try an estimate';
    onClear?.();
  });
}

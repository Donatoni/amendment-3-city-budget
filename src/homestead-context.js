// County status describes the record, not the owner's future eligibility.
// Manual entries assume eligibility; non-homesteaded records get no homestead savings.
export function renderHomesteadContext(property = null, root = document) {
  const recorded = property?.homestead === true;
  const unrecorded = property?.homestead === false;
  const known = recorded || unrecorded;
  const select = id => root.querySelector(`#${id}`);
  select('calc-eligibility').hidden = !known;
  select('calc-eligibility').dataset.status = recorded ? 'recorded' : unrecorded ? 'unrecorded' : 'unknown';
  select('calc-eligibility-title').textContent = recorded
    ? 'Homestead recorded by the county'
    : unrecorded ? 'No homestead recorded · no savings applied' : '';
  const roll = known ? `The ${property.year} ${property.rollStatus} county tax roll` : '';
  select('calc-eligibility-description').textContent = recorded
    ? `${roll} lists this property as homesteaded. Amendment 3 eligibility still needs to be confirmed.`
    : unrecorded
      ? `${roll} does not list a homestead exemption. No homestead savings are applied below. If your eligibility changes, confirm it with the county. This estimate does not model the non-homestead assessment-cap change.`
      : 'Check your homestead status using the property search, or visit the county records through the link below. Until then, this estimate assumes an eligible homestead.';
  const link = select('calc-record-link');
  link.href = known ? property.sourceURL : 'https://vcpa.vcgov.org/search/real-property';
  link.textContent = known ? 'View official property record ↗' : 'Check county records ↗';
  select('calc-savings-title').textContent = 'Savings & city tax remaining';
  select('calc-savings-condition').textContent = unrecorded
    ? 'No homestead savings without a qualifying exemption'
    : 'If Amendment 3 passes and you qualify';
}

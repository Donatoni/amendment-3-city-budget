// VCPA municipal operating-authority codes; debt and special districts are separate.
// Source: https://vcpa.vcgov.org/files/historical/2025/trim/proposedtaxingauthoritymillagerates2025trim.pdf
// Names also follow the county GIS tax-district list:
// https://maps.vcgov.org/gis/data/TaxDistricts.htm
// Flagler Beach is supported only for parcels in VCPA's Volusia County records.
export const VOLUSIA_CITIES = Object.freeze([
  { name: 'Daytona Beach', authority: 'DAYTONA BEACH', authorityCode: '0210' },
  { name: 'Daytona Beach Shores', authority: 'DAYTONA BEACH SHORES', authorityCode: '0240' },
  { name: 'DeBary', authority: 'DEBARY', authorityCode: '0190' },
  { name: 'DeLand', authority: 'DELAND', authorityCode: '0150' },
  { name: 'Deltona', authority: 'DELTONA', authorityCode: '0130' },
  { name: 'Edgewater', authority: 'EDGEWATER', authorityCode: '0290' },
  { name: 'Flagler Beach', authority: 'FLAGLER BEACH', authorityCode: '0250' },
  { name: 'Holly Hill', authority: 'HOLLY HILL', authorityCode: '0200' },
  { name: 'Lake Helen', authority: 'LAKE HELEN', authorityCode: '0160' },
  { name: 'New Smyrna Beach', authority: 'NEW SMYRNA BEACH', authorityCode: '0270' },
  { name: 'Oak Hill', authority: 'OAK HILL', authorityCode: '0300' },
  { name: 'Orange City', authority: 'ORANGE CITY', authorityCode: '0170' },
  { name: 'Ormond Beach', authority: 'ORMOND BEACH', authorityCode: '0180' },
  { name: 'Pierson', authority: 'PIERSON', authorityCode: '0140' },
  { name: 'Ponce Inlet', authority: 'PONCE INLET', authorityCode: '0260' },
  { name: 'Port Orange', authority: 'PORT ORANGE', authorityCode: '0230' },
  { name: 'South Daytona', authority: 'SOUTH DAYTONA', authorityCode: '0220' },
].map(Object.freeze));

export const DEFAULT_CITY = VOLUSIA_CITIES.find(city => city.name === 'DeLand');

export function getVolusiaCity(value = DEFAULT_CITY) {
  if (typeof value === 'string') return VOLUSIA_CITIES.find(city => city.name === value || city.authority === value) ?? null;
  if (!value || typeof value !== 'object') return null;
  return VOLUSIA_CITIES.find(city => city.name === value.name && city.authority === value.authority) ?? null;
}

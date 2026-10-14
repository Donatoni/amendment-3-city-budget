import { expandCopy } from './site-runtime.js';
import { markdownToText } from './markdown.js';

// Search engines read who publishes the site and its questions and answers.
export function structuredData(config, { title, description, image }) {
  const { city } = config, url = city.url, publisher = `${url}#publisher`;
  const municipality = expandCopy('{{municipality}}', config);
  // Key facts hold the City Clerk address on one line: "street, city, FL 32720".
  const [, street, locality, region, postalCode] = String(city.clerkAddress || '').match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/) || [];
  const address = { '@type': 'PostalAddress', ...(street && { streetAddress: street }), addressLocality: locality || city.name,
    addressRegion: region || (city.state === 'Florida' ? 'FL' : city.state), ...(postalCode && { postalCode }), addressCountry: 'US' };
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'GovernmentOrganization', '@id': publisher, name: municipality, ...(city.cityWebsiteUrl && { url: city.cityWebsiteUrl }),
      ...(city.clerkPhone && { telephone: city.clerkPhone }), address },
    { '@type': 'WebSite', '@id': `${url}#website`, name: city.siteName, url, inLanguage: 'en-US', publisher: { '@id': publisher } },
    { '@type': ['WebPage', 'FAQPage'], '@id': `${url}#webpage`, name: title, url, description, inLanguage: 'en-US',
      primaryImageOfPage: { '@type': 'ImageObject', url: image }, isPartOf: { '@id': `${url}#website` }, publisher: { '@id': publisher },
      spatialCoverage: { '@type': 'Place', name: `${city.name}, ${city.state}` },
      mainEntity: config.faqs.map(item => ({ '@type': 'Question', name: expandCopy(item.question, config), acceptedAnswer: { '@type': 'Answer', text: markdownToText(expandCopy(item.answer, config)) } })) },
  ] };
}

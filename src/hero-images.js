import { expandCopy, escapeText } from './site-runtime.js';

export const isLegacyHeroImage = key => /^home_hero_image_\d+$/.test(key);

// Older drafts use numbered media slots. An explicit array, including an empty
// array, takes precedence so deleting photos cannot resurrect starter images.
export function getHeroImages(config) {
  if (Array.isArray(config.heroImages)) return config.heroImages;
  return Object.entries(config.media || {}).filter(([key, image]) => isLegacyHeroImage(key) && image.url)
    .sort(([a], [b]) => Number(a.split('_').at(-1)) - Number(b.split('_').at(-1)))
    .map(([id, image]) => ({ id, ...image,
      label: config.copy?.[`home_hero_data-hero-label_${63 + Number(id.split('_').at(-1))}`] || image.alt || 'Community photo' }));
}

export function renderHeroImages(document, config) {
  const slideshow = document.querySelector('.hero-slideshow');
  if (!slideshow) return;
  const images = getHeroImages(config).filter(image => image.url);
  const legacyStyles = new Map([...slideshow.querySelectorAll('[data-hero-slide]')]
    .map((slide, index) => [`home_hero_image_${index + 1}`, slide.getAttribute('style') || '']));
  slideshow.innerHTML = images.map((image, index) => {
    const label = escapeText(expandCopy(image.label, config));
    return `<figure class="hero-slide${index === 0 ? ' is-active' : ''}" data-hero-slide data-hero-image-id="${escapeText(image.id)}" data-hero-label="${label}" style="${escapeText(legacyStyles.get(image.id) || '')}" aria-hidden="${index !== 0}"><img ${index === 0 ? 'src' : 'data-src'}="${escapeText(image.url)}" alt="${escapeText(expandCopy(image.alt, config))}" decoding="async" fetchpriority="${index === 0 ? 'high' : 'low'}" /></figure>`;
  }).join('');
  const dots = document.querySelector('.hero-slide-dots');
  if (dots) dots.innerHTML = images.map((image, index) => `<button type="button"${index === 0 ? ' class="is-active" aria-current="true"' : ''} data-hero-slide-to="${index}" aria-label="Show photo ${index + 1}: ${escapeText(expandCopy(image.label || image.alt, config))}"></button>`).join('');
  const label = document.querySelector('#hero-slide-label');
  if (label) label.textContent = images.length ? expandCopy(images[0].label, config) : '';
  const count = document.querySelector('#hero-slide-count');
  if (count) count.textContent = images.length ? `01 / ${String(images.length).padStart(2, '0')}` : '';
  const controls = document.querySelector('.hero-slideshow-controls');
  if (controls) {
    controls.hidden = images.length < 2;
    if (images.length < 2) controls.style.display = 'none';
  }
  slideshow.hidden = images.length === 0;
}

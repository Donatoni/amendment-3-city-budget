import { runtimeConfig } from './site-runtime.js';
// Personalized postcards are rendered at export resolution; the preview and
// downloaded image use the same canvas, including the selected side and style.
import { costCenterPlan } from './cost-centers.js';
import { SERVICES, PROPOSED_TOTAL, fmtM } from './budget.js';

import { paintPostcard, HEADLINES } from './postcard.js';
import { resultURL } from './share-plan.js';
let sealPromise;
let illustrationPromise;
function loadIllustration() {
  return illustrationPromise ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      illustrationPromise = null;
      reject(new Error('The postcard illustration could not load.'));
    };
    image.crossOrigin = 'anonymous';
    image.src = runtimeConfig().city.shareImage;
  });
}
function loadSeal() {
  return sealPromise ??= new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.crossOrigin = 'anonymous';
    image.src = runtimeConfig().city.logo;
  });
}
export async function drawShareCard(canvas, values, options = {}) {
  const { theme = 'daylight', headline = 0, side = 'front' } = options;
  const [seal, illustration] = await Promise.all([
    loadSeal(), side === 'front' ? loadIllustration() : null,
  ]);
  const ctx = canvas.getContext('2d');
  paintPostcard(ctx, values, options, { seal, illustration });
  const total = values.reduce((sum, value) => sum + value, 0);
  const revenue = costCenterPlan([], options.revenues || [], options.millageRate).revenue / 1e6;
  const cut = PROPOSED_TOTAL - total;
  canvas.setAttribute('aria-label', side === 'front'
    ? `${HEADLINES[headline]?.join(' ') || HEADLINES[0].join(' ')} City artwork. Personal ${runtimeConfig().city.name} budget: ${fmtM(total)}, net service cuts ${fmtM(cut)}, potential revenue ${fmtM(revenue)}, gap closed ${fmtM(cut + revenue)}.`
    : `Budget breakdown. ${SERVICES.map((service, i) => `${service.name}: ${fmtM(values[i])}`).join('. ')}. Potential revenue: ${fmtM(revenue)}.`);
}

export function shareURL(values, options = {}) {
  return resultURL(window.location.origin, values, options);
}
export function shareCaption(values, options = {}) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return `${(HEADLINES[options.headline || 0] || HEADLINES[0]).join(" ")} A ${fmtM(total)} city budget with ${fmtM(PROPOSED_TOTAL - total)} in net service cuts and ${fmtM(costCenterPlan([], options.revenues || [], options.millageRate).revenue / 1e6)} in potential revenue. Our city. Built piece by piece. What would your ${runtimeConfig().city.name} look like?\n\n${shareURL(values, options)}`;
}
export async function prepareShareFile(canvas) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png'));
  return new File([blob], `my-${runtimeConfig().city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-postcard.png`, { type: 'image/png' });
}
// File encoding happens during preview rendering, before the share button is
// enabled. Calling navigator.share directly keeps the user's activation intact.
export async function nativeShare(file, values, options = {}) {
  if (!navigator.share) return 'unavailable';
  try {
    const data = { title: `My ${runtimeConfig().city.name} budget`, text: shareCaption(values, options).split('\n\n')[0], url: shareURL(values, options) };
    const withImage = Boolean(file && navigator.canShare?.({ files: [file] }));
    if (withImage) data.files = [file];
    await navigator.share(data);
    return withImage ? 'shared-image' : 'shared-link';
  } catch (error) {
    return error.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}
export async function downloadCard(canvas, suffix = 'postcard', file) {
  // In-app browsers may treat a download link as navigation to its data URL.
  // Keep mobile users on the page and offer a real image if file sharing fails.
  const mobile = /Android|iPhone|iPad|iPod|FBAN|FBAV|Instagram/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (mobile) {
    try {
      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        const image = new File([file], `my-${runtimeConfig().city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}.png`, { type: 'image/png' });
        // Use only the image, so the device can offer Save Image / Save to Files.
        await navigator.share({ files: [image] });
        return 'shared-image';
      }
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
    }
    return 'preview';
  }
  const link = document.createElement('a');
  link.download = `my-${runtimeConfig().city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.append(link);
  link.click();
  link.remove();
  return 'download';
}

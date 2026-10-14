// A deliberately tiny, safe markdown dialect for city staff content. Pure string
// code so it runs the same in browsers, Node and Cloudflare Workers.
// Inline: **bold**, *italic*, [text](url), backslash escapes for \ * [ ] and
// newlines as <br />. Blocks: paragraphs, "- " bullets and "1. " numbers.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// The one HTML escaper for the project; site-runtime.js re-exports it as escapeText.
export const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
// '-' and '.' are escaped only at the start of a line, so text such as
// "2026. Budget adopted" is not read as a numbered list.
const ESCAPABLE = '\\*[]-.';
const BULLET = /^[-*] /;
const NUMBER = /^\d+\. /;

export const escapeMarkdown = text => String(text ?? '').replace(/[\\*[\]]/g, '\\$&');

// Only https, mailto, tel, same-site paths (single leading slash) and anchors.
export function isAllowedMarkdownURL(url) {
  const value = String(url ?? '');
  if (!value || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  return /^(?:https:\/\/[^/]|mailto:.|tel:.|#|\/(?!\/))/i.test(value);
}

const starRun = (src, i, end) => { let j = i; while (j < end && src[j] === '*') j++; return j - i; };
const isEscape = (src, i, end) => src[i] === '\\' && i + 1 < end && ESCAPABLE.includes(src[i + 1]);

// Finds the closing run for a marker of `length` stars. Runs that belong to
// nested emphasis (a lone * inside **, a ** inside *) are skipped over.
function findClose(src, from, end, length) {
  for (let i = from; i < end; i++) {
    if (isEscape(src, i, end)) { i++; continue; }
    if (src[i] !== '*') continue;
    const run = starRun(src, i, end);
    if (run >= length && !(length === 1 && run === 2)) return i + run - length;
    i += run - 1;
  }
  return -1;
}

function parseEmphasis(src, i, end, run, inLink) {
  for (let length = Math.min(run, 3); length > 0; length--) {
    const close = findClose(src, i + length, end, length);
    if (close === -1 || !/[^\s*]/.test(src.slice(i + length, close))) continue;
    const children = parseInline(src, i + length, close, inLink);
    const node = length === 1 ? { type: 'em', children }
      : length === 2 ? { type: 'strong', children }
        : { type: 'strong', children: [{ type: 'em', children }] };
    return { node, end: close + length };
  }
  return null;
}

function parseLink(src, i, end) {
  let depth = 0, j = i;
  for (; j < end; j++) {
    if (isEscape(src, j, end)) { j++; continue; }
    if (src[j] === '[') depth++;
    else if (src[j] === ']' && --depth === 0) break;
  }
  if (j >= end || j === i + 1 || src[j + 1] !== '(') return null;
  const close = src.indexOf(')', j + 2);
  if (close === -1 || close >= end) return null;
  const url = src.slice(j + 2, close).trim();
  if (url.includes('\n')) return null;
  return { node: { type: 'link', url, source: src.slice(i, close + 1), children: parseInline(src, i + 1, j, true) }, end: close + 1 };
}

function parseInline(src, start, end, inLink = false) {
  const nodes = [];
  let text = '';
  const flush = () => { if (text) nodes.push({ type: 'text', value: text }); text = ''; };
  for (let i = start; i < end;) {
    const ch = src[i];
    if (isEscape(src, i, end)) { text += src[i + 1]; i += 2; continue; }
    if (ch === '\n') { flush(); nodes.push({ type: 'br' }); i++; continue; }
    if (ch === '*') {
      const run = starRun(src, i, end);
      const emphasis = parseEmphasis(src, i, end, run, inLink);
      if (emphasis) { flush(); nodes.push(emphasis.node); i = emphasis.end; continue; }
      text += '*'.repeat(run); i += run; continue;
    }
    if (ch === '[' && !inLink) {
      const link = parseLink(src, i, end);
      if (link) { flush(); nodes.push(link.node); i = link.end; continue; }
    }
    text += ch; i++;
  }
  flush();
  return nodes;
}

const normalize = source => String(source ?? '').replace(/\r\n?/g, '\n');

function parseBlocks(source) {
  const blocks = [];
  for (const block of normalize(source).split(/\n(?:[ \t]*\n)+/)) {
    if (!block.trim()) continue;
    const lines = block.trim().split('\n').map(line => line.trim());
    const marker = BULLET.test(lines[0]) ? BULLET : NUMBER.test(lines[0]) ? NUMBER : null;
    if (!marker) { const text = lines.join('\n'); blocks.push({ type: 'paragraph', children: parseInline(text, 0, text.length) }); continue; }
    const items = [];
    for (const line of lines) {
      if (marker.test(line)) items.push(line.replace(marker, ''));
      else items[items.length - 1] += `\n${line}`;
    }
    blocks.push({ type: 'list', ordered: marker === NUMBER, items: items.map(item => parseInline(item, 0, item.length)) });
  }
  return blocks;
}

function linkAttributesFor(url, linkAttributes) {
  const value = typeof linkAttributes === 'function' ? linkAttributes(url) : linkAttributes;
  if (value == null) return /^https:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
  if (typeof value === 'string') return value.trim() ? ` ${value.trim()}` : '';
  return Object.entries(value).map(([name, attr]) => ` ${name}="${escapeHTML(attr)}"`).join('');
}

function renderNodes(nodes, options) {
  return nodes.map(node => {
    if (node.type === 'text') return escapeHTML(node.value);
    if (node.type === 'br') return '<br />';
    if (node.type === 'em') return `<em>${renderNodes(node.children, options)}</em>`;
    if (node.type === 'strong') return `<strong>${renderNodes(node.children, options)}</strong>`;
    const text = renderNodes(node.children, options);
    if (!(options.allowURL || isAllowedMarkdownURL)(node.url)) return options.disallowedLinks === 'source' ? escapeHTML(node.source) : text;
    return `<a href="${escapeHTML(node.url)}"${linkAttributesFor(node.url, options.linkAttributes)}>${text}</a>`;
  }).join('');
}

// linkAttributes: omit for the default (https links open in a new tab), or pass
// a string, an attribute object, or a function of the URL returning either.
// disallowedLinks: 'text' (default) keeps only the link text, 'source' keeps the
// original markdown so nothing is silently dropped in an editor.
export function renderMarkdown(source, { inline = false, linkAttributes, disallowedLinks = 'text', allowURL } = {}) {
  const options = { linkAttributes, disallowedLinks, allowURL };
  if (inline) {
    const text = normalize(source);
    return renderNodes(parseInline(text, 0, text.length), options);
  }
  return parseBlocks(source).map(block => block.type === 'list'
    ? `<${block.ordered ? 'ol' : 'ul'}>${block.items.map(item => `<li>${renderNodes(item, options)}</li>`).join('')}</${block.ordered ? 'ol' : 'ul'}>`
    : `<p>${renderNodes(block.children, options)}</p>`).join('');
}

const nodesToText = nodes => nodes.map(node => node.type === 'text' ? node.value : node.type === 'br' ? ' ' : nodesToText(node.children)).join('');

// Plain text for search engines and JSON-LD: paragraphs joined by a space,
// list items joined by ", ".
export function markdownToText(source) {
  return parseBlocks(source)
    .map(block => block.type === 'list' ? block.items.map(nodesToText).join(', ') : nodesToText(block.children))
    .join(' ').replace(/\s+/g, ' ').trim();
}

const collectLinks = (nodes, urls) => {
  for (const node of nodes) {
    if (node.type === 'link') urls.push(node.url);
    if (node.children) collectLinks(node.children, urls);
  }
  return urls;
};

// Raw URLs of every [text](url) in source order, for validation before saving.
export function markdownLinks(source) {
  const urls = [];
  for (const block of parseBlocks(source)) {
    if (block.type === 'list') block.items.forEach(item => collectLinks(item, urls));
    else collectLinks(block.children, urls);
  }
  return urls;
}

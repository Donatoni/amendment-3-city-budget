// Bridges a contenteditable element and the markdown dialect in markdown.js.
// Works on any DOM node passed in (browser or linkedom), no globals.
import { escapeMarkdown, renderMarkdown, isAllowedMarkdownURL } from './markdown.js';

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'ASIDE', 'MAIN', 'PRE', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'FIGURE', 'FIGCAPTION', 'HR']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
// Block open/close sentinels survive inline serialization so nested blocks can
// be resolved into single line breaks afterwards.
const OPEN = '\u0001';
const CLOSE = '\u0002';

const tagOf = node => node.nodeType === 1 ? String(node.tagName).toUpperCase() : null;
const isList = name => name === 'UL' || name === 'OL';
const EDGES = /^([\s\u0001\u0002]*)([\s\S]*?)([\s\u0001\u0002]*)$/;

// Keeps surrounding whitespace outside the markers and drops markers around
// whitespace-only content so "**bold **" becomes "**bold** ".
function wrap(inner, open, close = open) {
  const [, lead, body, tail] = inner.match(EDGES);
  return body ? `${lead}${open}${body}${close}${tail}` : inner;
}

function serializeNode(node, ctx) {
  if (node.nodeType === 3) return escapeMarkdown(node.data.replace(/\s+/g, ' '));
  const name = tagOf(node);
  if (!name || SKIP_TAGS.has(name)) return '';
  // A key fact chip saves as its {{token}}, never as the value it displays.
  if (node.getAttribute('data-token')) return node.getAttribute('data-token');
  if (name === 'BR') return '\n';
  if (isList(name) && ctx.inList) return '';
  if (BLOCK_TAGS.has(name)) return `${OPEN}${serializeChildren(node, ctx).replace(/\n$/, '')}${CLOSE}`;
  if ((name === 'B' || name === 'STRONG') && !ctx.bold) return wrap(serializeChildren(node, { ...ctx, bold: true }), '**');
  if ((name === 'I' || name === 'EM') && !ctx.italic) return wrap(serializeChildren(node, { ...ctx, italic: true }), '*');
  if (name === 'A' && !ctx.link && node.getAttribute('href')) return wrap(serializeChildren(node, { ...ctx, link: true }), '[', `](${node.getAttribute('href')})`);
  return serializeChildren(node, ctx);
}

const serializeChildren = (node, ctx) => [...node.childNodes].map(child => serializeNode(child, ctx)).join('');

function clean(text) {
  return text
    .replace(/\u0002[ \t]*\u0001/g, '\n')
    .replace(/([^\n\u0001\u0002])\u0001+/g, '$1\n')
    .replace(/\u0002+([^\n\u0001\u0002])/g, '\n$1')
    .replace(/[\u0001\u0002]/g, '')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const hasBlockChildren = node => [...node.childNodes].some(child => BLOCK_TAGS.has(tagOf(child)));

function listItems(list) {
  const items = [];
  for (const child of list.childNodes) {
    const name = tagOf(child);
    if (!name) continue;
    if (isList(name)) { items.push(...listItems(child)); continue; }
    const text = clean(name === 'LI' ? serializeChildren(child, { inList: true }) : serializeNode(child, { inList: true }));
    if (text) items.push(text);
    if (name === 'LI') for (const nested of child.childNodes) if (isList(tagOf(nested))) items.push(...listItems(nested));
  }
  return items;
}

// A paragraph line that looks like "- item" or "2026. Something" would be read
// back as a list; escape the marker so it stays a paragraph.
const escapeListStart = paragraph => paragraph.split('\n').map(line => line.replace(/^([-*]) /, '\\$1 ').replace(/^(\d+)\. /, '$1\\. ')).join('\n');
function blocksOf(node) {
  const blocks = [];
  let pending = '';
  const flush = () => {
    for (const paragraph of clean(pending).split(/\n{2,}/)) if (paragraph) blocks.push(escapeListStart(paragraph));
    pending = '';
  };
  for (const child of node.childNodes) {
    const name = tagOf(child);
    if (isList(name)) {
      flush();
      const items = listItems(child);
      if (items.length) blocks.push(items.map((item, index) => `${name === 'OL' ? `${index + 1}.` : '-'} ${item}`).join('\n'));
    } else if (BLOCK_TAGS.has(name)) {
      flush();
      if (hasBlockChildren(child)) blocks.push(...blocksOf(child));
      else { pending = serializeChildren(child, {}); flush(); }
    } else pending += serializeNode(child, {});
  }
  flush();
  return blocks;
}

// Serializes the children of a contenteditable element into the dialect.
export function htmlToMarkdown(root, { inline = false } = {}) {
  if (!root) return '';
  return inline ? clean(serializeChildren(root, {})) : blocksOf(root).join('\n\n').trim();
}

// HTML to load into the contenteditable: no target/rel on links, and links
// with disallowed URLs stay as their literal markdown text.
export function markdownToEditorHTML(source, { inline = false, tokenChip } = {}) {
  // Links may point at a key fact, such as ({{publicRecordsUrl}}).
  const allowURL = url => isAllowedMarkdownURL(url) || /^(?:tel:)?\{\{\w+\}\}$/.test(url);
  let html = renderMarkdown(source, { inline, linkAttributes: '', disallowedLinks: 'source', allowURL });
  // Show {{tokens}} in text (never inside tags or attributes) as chips.
  if (tokenChip) html = html.split(/(<[^>]*>)/).map(part => (part.startsWith('<') ? part : part.replace(/\{\{\w+(?::\w+)?\}\}/g, tokenChip))).join('');
  return !inline && !html ? '<p><br></p>' : html;
}

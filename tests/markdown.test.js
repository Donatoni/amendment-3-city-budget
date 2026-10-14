import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { escapeMarkdown, renderMarkdown, markdownToText, markdownLinks, isAllowedMarkdownURL } from '../src/markdown.js';
import { htmlToMarkdown, markdownToEditorHTML } from '../src/rich-text.js';

const { document } = parseHTML('<html><body><div id="r"></div></body></html>');
const root = html => { const element = document.querySelector('#r'); element.innerHTML = html; return element; };
const roundTrip = (markdown, inline = false) => htmlToMarkdown(root(markdownToEditorHTML(markdown, { inline })), { inline });
// Only inspects actual tags: escaped text such as &lt;script&gt; is inert.
const assertInert = html => {
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  for (const tag of html.match(/<[^>]*>/g) || []) {
    assert.match(tag, /^<\/?(p|ul|ol|li|strong|em|br|a)\b/, tag);
    assert.doesNotMatch(tag, /javascript:/i, tag);
    assert.doesNotMatch(tag, /\son\w+=/i, tag);
    assert.doesNotMatch(tag, /href="\/\//, tag);
    assert.doesNotMatch(tag, /href="(?!https:|mailto:|tel:|\/|#)/i, tag);
  }
};

test('renders inline syntax and escapes HTML', () => {
  assert.equal(renderMarkdown('Hello **bold** and *italic*'), '<p>Hello <strong>bold</strong> and <em>italic</em></p>');
  assert.equal(renderMarkdown('a\nb'), '<p>a<br />b</p>');
  assert.equal(renderMarkdown('5 < 6 & "quotes" \'single\''), '<p>5 &lt; 6 &amp; &quot;quotes&quot; &#39;single&#39;</p>');
  assert.equal(renderMarkdown('2 \\* 3 \\[x\\] \\\\'), '<p>2 * 3 [x] \\</p>');
  assert.equal(renderMarkdown('**a *b* c**'), '<p><strong>a <em>b</em> c</strong></p>');
  assert.equal(renderMarkdown('***both***'), '<p><strong><em>both</em></strong></p>');
  assert.equal(renderMarkdown('*a **b** c*'), '<p><em>a <strong>b</strong> c</em></p>');
  assert.equal(renderMarkdown('{{city}} keeps *tokens* intact'), '<p>{{city}} keeps <em>tokens</em> intact</p>');
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown('   \n\n  '), '');
});

test('unmatched markers render literally and never leave unclosed tags', () => {
  for (const [source, expected] of [['a * b', 'a * b'], ['**open', '**open'], ['close**', 'close**'], ['****', '****'],
    ['** **', '** **'], ['[text', '[text'], ['[text](', '[text]('], ['text]', 'text]'], ['[](https://a.com)', '[](https://a.com)']]) {
    assert.equal(renderMarkdown(source, { inline: true }), expected);
  }
  for (const source of ['**a *b** c*', '*a **b* c**', '[**x](https://a.com)**', '***a**', '**a***']) {
    const html = renderMarkdown(source);
    const opens = (html.match(/<(strong|em|a)\b/g) || []).length;
    const closes = (html.match(/<\/(strong|em|a)>/g) || []).length;
    assert.equal(opens, closes, source);
  }
});

test('links are allowed only for safe URLs and external links open in a new tab', () => {
  assert.equal(renderMarkdown('[City](https://deland.org/x?a=1&b=2)'),
    '<p><a href="https://deland.org/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">City</a></p>');
  assert.equal(renderMarkdown('[Mail](mailto:hello@example.org)'), '<p><a href="mailto:hello@example.org">Mail</a></p>');
  assert.equal(renderMarkdown('[Call](tel:+13861234567)'), '<p><a href="tel:+13861234567">Call</a></p>');
  assert.equal(renderMarkdown('[Budget](/budget)'), '<p><a href="/budget">Budget</a></p>');
  assert.equal(renderMarkdown('[Top](#top)'), '<p><a href="#top">Top</a></p>');
  assert.equal(renderMarkdown('[**bold** link](https://a.com)'),
    '<p><a href="https://a.com" target="_blank" rel="noopener noreferrer"><strong>bold</strong> link</a></p>');
  assert.equal(renderMarkdown('**[link](https://a.com) bold**'),
    '<p><strong><a href="https://a.com" target="_blank" rel="noopener noreferrer">link</a> bold</strong></p>');
  assert.equal(renderMarkdown('[x](https://a.com)', { linkAttributes: 'class="btn"' }), '<p><a href="https://a.com" class="btn">x</a></p>');
  assert.equal(renderMarkdown('[x](https://a.com)', { linkAttributes: url => ({ 'data-url': url }) }), '<p><a href="https://a.com" data-url="https://a.com">x</a></p>');
  for (const [url, allowed] of [['https://a.com', true], ['HTTPS://A.COM', true], ['mailto:a@b.c', true], ['tel:123', true], ['/path', true], ['#anchor', true],
    ['http://a.com', false], ['//evil.com', false], ['javascript:alert(1)', false], ['data:text/html,x', false], ['foo', false], ['', false],
    ['https://a.com/with space', false], ['https://', false], [' /path', false], ['vbscript:x', false]]) {
    assert.equal(isAllowedMarkdownURL(url), allowed, url);
  }
});

test('XSS payloads produce no executable markup', () => {
  const payloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[x](javascript:alert(1))', '[x](JAVASCRIPT:alert(1))',
    '[x](  javascript:alert(1))', '[x](//evil.com)', '[x](http://a.com)', '[x](data:text/html,<script>alert(1)</script>)',
    '[x](https://a.com/"onmouseover="alert(1))', '[x](https://a.com/\'onmouseover=\'alert(1))', '**<b onclick="x">**', '[<script>](https://a.com)',
    '[x](https://a.com)" onmouseover="x', 'a\u0000b [x](https://a.com/\u0000)'];
  for (const payload of payloads) {
    for (const inline of [false, true]) {
      const html = renderMarkdown(payload, { inline });
      assertInert(html);
      assertInert(markdownToEditorHTML(payload, { inline }));
    }
  }
  assert.equal(renderMarkdown('[x](javascript:evil)', { inline: true }), 'x');
  assert.equal(renderMarkdown('[x](javascript:alert(1))', { inline: true }), 'x)');
  assert.equal(renderMarkdown('[x](http://a.com)', { inline: true }), 'x');
  assert.equal(renderMarkdown('[x](https://a.com/"onmouseover="alert)', { inline: true }),
    '<a href="https://a.com/&quot;onmouseover=&quot;alert" target="_blank" rel="noopener noreferrer">x</a>');
});

test('block mode renders paragraphs and lists', () => {
  assert.equal(renderMarkdown('First\n\nSecond\n\n\n\nThird'), '<p>First</p><p>Second</p><p>Third</p>');
  assert.equal(renderMarkdown('- a\n- **b**\n\n* c'), '<ul><li>a</li><li><strong>b</strong></li></ul><ul><li>c</li></ul>');
  assert.equal(renderMarkdown('1. one\n2. two\n10. ten'), '<ol><li>one</li><li>two</li><li>ten</li></ol>');
  assert.equal(renderMarkdown('- a\n  continued\n- b'), '<ul><li>a<br />continued</li><li>b</li></ul>');
  assert.equal(renderMarkdown('  spaced  \n\n\t- not a list because of the dash?'), '<p>spaced</p><ul><li>not a list because of the dash?</li></ul>');
  assert.equal(renderMarkdown('-no space\n1.no space'), '<p>-no space<br />1.no space</p>');
  assert.equal(renderMarkdown('para\r\n\r\n- item\r\n- item 2'), '<p>para</p><ul><li>item</li><li>item 2</li></ul>');
  assert.equal(renderMarkdown('*italic* paragraph'), '<p><em>italic</em> paragraph</p>');
});

test('inline mode never wraps in paragraphs and keeps blank lines as breaks', () => {
  assert.equal(renderMarkdown('a\n\nb', { inline: true }), 'a<br /><br />b');
  assert.equal(renderMarkdown('- a\n- b', { inline: true }), '- a<br />- b');
  assert.equal(renderMarkdown('**x**', { inline: true }), '<strong>x</strong>');
  assert.equal(renderMarkdown('', { inline: true }), '');
});

test('escapeMarkdown round-trips plain text', () => {
  const samples = ['2 * 3 = 6', '[not a link](x)', 'back\\slash', '**not bold**', 'under_score #hash - dash 1. number', '{{city}}'];
  for (const sample of samples) {
    assert.equal(renderMarkdown(escapeMarkdown(sample), { inline: true }), sample.replace(/[&<>"']/g, ''), sample);
    assert.equal(markdownToText(escapeMarkdown(sample)), sample);
  }
  assert.equal(escapeMarkdown('_ # - 9'), '_ # - 9');
  assert.equal(escapeMarkdown('a\\b*c[d]'), 'a\\\\b\\*c\\[d\\]');
});

test('markdownToText strips markers and joins blocks', () => {
  assert.equal(markdownToText('**Bold** and *italic*\nwith [a link](https://a.com)\n\n- one\n- two\n\nEnd 2 \\* 2'),
    'Bold and italic with a link one, two End 2 * 2');
  assert.equal(markdownToText('[x](javascript:evil)'), 'x');
  assert.equal(markdownToText(''), '');
  assert.equal(markdownToText('  lots   of\n\n\n  space  '), 'lots of space');
});

test('markdownLinks returns raw URLs in order, including disallowed ones', () => {
  assert.deepEqual(markdownLinks('[a](https://a.com) **[b](http://b.com)**\n\n- [c](/c)\n- [d](javascript:x)\n\n1. [**e**](#e)'),
    ['https://a.com', 'http://b.com', '/c', 'javascript:x', '#e']);
  assert.deepEqual(markdownLinks('no links \\[x\\](y) [unclosed(z)'), []);
});

test('markdown round-trips through the editor HTML in block and inline modes', () => {
  const samples = ['Hello **world**', 'Plain text with {{city}} and {{county}} tokens', 'Line one\nline two', 'Click [**here** now](https://a.com) or [email](mailto:a@b.c)',
    '*italic* and **bold** and ***both***', '**bold with *italic* inside**', '2 \\* 3 and \\[brackets\\] and a back\\\\slash', '[**bold link**](/path)',
    'First paragraph\n\nSecond paragraph\n\nThird', '- one\n- **two**\n- three with [link](https://a.com)', '1. first\n2. second\n3. third',
    'Intro\n\n- a\n- b\n\nOutro', 'Price: $5 * 2 is not emphasis'.replace('*', '\\*'), 'Safe & sound <tag> "quotes"'];
  for (const sample of samples) {
    assert.equal(roundTrip(sample), sample, `block: ${sample}`);
    const inlineSample = sample.replace(/\n\n/g, '\n').replace(/^(- |\d\. )/gm, '');
    assert.equal(roundTrip(inlineSample, true), inlineSample, `inline: ${inlineSample}`);
  }
  assert.equal(roundTrip('a\n\nb', true), 'a\n\nb');
});

test('editor HTML drops target and rel and preserves disallowed links as text', () => {
  assert.equal(markdownToEditorHTML('[x](https://a.com)'), '<p><a href="https://a.com">x</a></p>');
  assert.equal(markdownToEditorHTML('[x](http://a.com)', { inline: true }), '[x](http://a.com)');
  assert.equal(markdownToEditorHTML('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(markdownToEditorHTML(''), '<p><br></p>');
  assert.equal(markdownToEditorHTML('', { inline: true }), '');
  assertInert(markdownToEditorHTML('[x](javascript:alert(1)) <script>x</script>'));
});

test('htmlToMarkdown handles browser contenteditable output', () => {
  assert.equal(htmlToMarkdown(root('<div>Hello <b>world</b></div><div><br></div><div>Second&nbsp;para</div>')), 'Hello **world**\n\nSecond para');
  assert.equal(htmlToMarkdown(root('<span style="font-weight:700">x</span>')), 'x');
  assert.equal(htmlToMarkdown(root('<font face="Arial"><u>x</u></font>')), 'x');
  assert.equal(htmlToMarkdown(root('<ul><li>a</li><li><b>b</b></li></ul>')), '- a\n- **b**');
  assert.equal(htmlToMarkdown(root('<ol><li>a</li><li>b</li></ol>')), '1. a\n2. b');
  assert.equal(htmlToMarkdown(root('<p>Hello<br></p>')), 'Hello');
  assert.equal(htmlToMarkdown(root('Hello<br>')), 'Hello');
  assert.equal(htmlToMarkdown(root('<strong>bold </strong>text')), '**bold** text');
  assert.equal(htmlToMarkdown(root('<b> </b>text<i></i>')), 'text');
  assert.equal(htmlToMarkdown(root('<em>  a  </em>')), '*a*');
  assert.equal(htmlToMarkdown(root('<b><i>x</i></b> and <i><b>y</b></i>')), '***x*** and ***y***');
  assert.equal(htmlToMarkdown(root('<b>a <b>nested</b></b>')), '**a nested**');
  assert.equal(htmlToMarkdown(root('<p>a<br>b</p><p>c</p>')), 'a\nb\n\nc');
  assert.equal(htmlToMarkdown(root('<div><div>outer</div><div>inner</div></div>')), 'outer\n\ninner');
  assert.equal(htmlToMarkdown(root('Loose text<div>then block</div>tail')), 'Loose text\n\nthen block\n\ntail');
  assert.equal(htmlToMarkdown(root('<p>Lots   of\t\tspace</p>')), 'Lots of space');
  assert.equal(htmlToMarkdown(root('<p>2 * 3 [x] a\\b</p>')), '2 \\* 3 \\[x\\] a\\\\b');
  assert.equal(htmlToMarkdown(root('<a href="http://a.com?x=1&amp;y=2">raw <b>href</b></a>')), '[raw **href**](http://a.com?x=1&y=2)');
  assert.equal(htmlToMarkdown(root('<a>no href</a> <a href="/p"> spaced </a>')), 'no href [spaced](/p)');
  assert.equal(htmlToMarkdown(root('<p>{{city}} tokens</p>')), '{{city}} tokens');
  assert.equal(htmlToMarkdown(root('<script>alert(1)</script><p>safe</p><style>p{}</style>')), 'safe');
  assert.equal(htmlToMarkdown(root('<p>para</p><ul><li>a<ul><li>nested</li></ul></li></ul><p>after</p>')), 'para\n\n- a\n- nested\n\nafter');
  assert.equal(htmlToMarkdown(root('<p></p><div><br></div>')), '');
  assert.equal(htmlToMarkdown(root('')), '');
  assert.equal(htmlToMarkdown(null), '');
});

test('htmlToMarkdown inline mode flattens blocks into line breaks', () => {
  const inline = html => htmlToMarkdown(root(html), { inline: true });
  assert.equal(inline('<div>Hello <b>world</b></div><div><br></div><div>Second&nbsp;para</div>'), 'Hello **world**\n\nSecond para');
  assert.equal(inline('<div>a</div><div>b</div>'), 'a\nb');
  assert.equal(inline('<ul><li>a</li><li>b</li></ul>'), 'a\nb');
  assert.equal(inline('<p>a<br></p>'), 'a');
  assert.equal(inline('text<div>block</div>tail'), 'text\nblock\ntail');
  assert.equal(inline('<div><div>nested</div></div>'), 'nested');
  assert.equal(inline('a<br><br>b'), 'a\n\nb');
  assert.equal(inline('<b>x</b>'), '**x**');
});

test('paragraphs that start like a list item stay paragraphs, and key fact chips save as their tokens', async () => {
  const { parseHTML } = await import('linkedom');
  const { htmlToMarkdown, markdownToEditorHTML } = await import('../src/rich-text.js');
  const { renderMarkdown } = await import('../src/markdown.js');
  const { document } = parseHTML('<html><body><div id="r"></div></body></html>');
  const root = document.querySelector('#r');
  root.innerHTML = '<p>2026. Budget adopted</p><p>- not a list</p>';
  const markdown = htmlToMarkdown(root);
  assert.equal(renderMarkdown(markdown), '<p>2026. Budget adopted</p><p>- not a list</p>');
  root.innerHTML = markdownToEditorHTML(markdown); assert.equal(htmlToMarkdown(root), markdown);
  const source = 'Call [{{clerkPhone}}]({{clerkPhoneLink}}) or visit the [records page]({{publicRecordsUrl}}). Gap: **{{target:words}}**.';
  root.innerHTML = markdownToEditorHTML(source, { tokenChip: token => `<span data-token="${token}" contenteditable="false">VALUE</span>` });
  assert.equal(root.querySelectorAll('[data-token]').length, 2);
  assert.equal(root.querySelector('a[href="{{publicRecordsUrl}}"]')?.textContent, 'records page');
  assert.equal(htmlToMarkdown(root, { inline: false }), source);
});

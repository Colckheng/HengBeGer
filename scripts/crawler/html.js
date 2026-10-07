const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&middot;': '·',
};

function decode(s) {
  return s.replace(/&[#a-zA-Z0-9]+;/g, (m) => ENTITIES[m] || m);
}

export function stripHtml(html) {
  if (html === null || html === undefined) return '';
  let s = String(html);
  s = s.replace(/<img[^>]*>/g, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '- ');
  s = s.replace(/<\/li>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  s = s.replace(/\s*\\?"\s*class=\\?"wiki-note-text\\?">/g, '');
  s = s.replace(/\s*\[详情\]/g, '');
  s = s.replace(/\r/g, '');
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export function cellText(html) {
  return stripHtml(html)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function table(header, rows) {
  const head = `| ${header.join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

export default { stripHtml, cellText, table };

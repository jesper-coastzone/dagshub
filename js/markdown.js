/**
 * markdown.js — lille, sikker Markdown → HTML til visning af referater og
 * noter fra OneDrive. Alt escapes først; kun http(s)-links tillades.
 * Understøtter overskrifter, afsnit, punkt- og nummerlister, tabeller,
 * fed (**x**), kursiv (*x* eller _x_), `kode`, gennemstreget (~~x~~) og links ([x](https://…)).
 */

import { esc } from './utils.js';

function safeHref(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const h = safeHref(href.replace(/&amp;/g, '&'));
    return h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\s][^_]*)_(?=$|[\s).,:;!?])/g, '$1<em>$2</em>');
  return out;
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(6, h[1].length + 1); // # → h2 (siden har selv h1)
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i += 1; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { html.push('<hr>'); i += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i += 1; }
      html.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        let t = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        const box = /^\[( |x|X)\]\s+/.exec(t);
        if (box) t = `${box[1] === ' ' ? '☐' : '☑'} ${t.slice(box[0].length)}`;
        items.push(`<li>${inline(t)}</li>`);
        i += 1;
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*([-*+]|\d+\.)\s+|\s*\|.*\|\s*$|-{3,}\s*$)/.test(lines[i])) {
      para.push(inline(lines[i]));
      i += 1;
    }
    if (para.length) html.push(`<p>${para.join('<br>')}</p>`);
    else { html.push(`<p>${inline(line)}</p>`); i += 1; }
  }
  return html.join('\n');
}

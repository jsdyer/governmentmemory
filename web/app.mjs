const $ = id => document.getElementById(id);
const normalize = value => value.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
const govAtip = 'https://coolcode.ca/atip/';
const perPage = 12;
let records = [];
let page = 1;

function make(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(label, url) {
  const node = make('a', label);
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

function draft(row) {
  const request = row.type === 'Personal Information Bank' ? 'the following personal information about me' : 'the following records';
  const institution = row.institution.startsWith('Government-wide') ? '[Institution]' : row.institution;
  $('draft-text').value = `To: ${institution}\n\nI am requesting ${request}: [describe the documents or information and the date range].\n\nThe published Info Source inventory references ${row.title} (${row.code}). Please use this reference as a lead when searching for responsive information.\n\nSource: ${row.link}`;
  $('copy-status').textContent = '';
  $('draft').showModal();
  $('draft-text').focus();
}

function card(row) {
  const node = make('article', '', 'card');
  const meta = make('div', '', 'metadata');
  meta.append(make('span', row.code, 'code'), make('span', row.type));
  node.append(meta, make('h2', row.title), make('p', row.description), make('small', row.institution));
  if (row.retention || row.related) {
    const details = make('details');
    details.append(make('summary', 'Retention and related records'));
    if (row.retention) details.append(make('p', row.retention));
    if (row.related) details.append(make('p', 'Related reference: ' + row.related));
    node.append(details);
  }
  const actions = make('div', '', 'actions');
  const outline = make('button', 'Request outline');
  outline.type = 'button';
  outline.addEventListener('click', () => draft(row));
  const topic = row.title.replace(/\s+(?:Personal Information Bank|Class of Record)$/i, '').replace(/\s*\(PPU \d+\)/, '');
  actions.append(link('Official entry ↗', row.link), link('Search completed ATIPs ↗', govAtip + '#' + new URLSearchParams({ q: topic })), outline);
  if (row.modified) node.append(make('p', 'Source page dated ' + row.modified, 'metadata'));
  node.append(actions);
  return node;
}

function draw(move = false) {
  const q = normalize($('query').value);
  const words = q ? q.split(/\s+/) : [];
  const institution = $('institution').value;
  const type = $('type').value;
  let found = records.filter(r => (!institution || r.institution === institution) &&
    (!type || r.type === type) && words.every(word => r.indexed.includes(word)));
  if (q) found = found.sort((a, b) => {
    const score = r => (r.normalCode === q ? 5 : 0) + (r.normalTitle.includes(q) ? 3 : 0) + (r.indexed.includes(q) ? 1 : 0);
    return score(b) - score(a) || a.title.localeCompare(b.title);
  });
  const pages = Math.max(1, Math.ceil(found.length / perPage));
  page = Math.min(pages, Math.max(1, page));
  $('status').textContent = `${found.length.toLocaleString('en-CA')} ${found.length === 1 ? 'description' : 'descriptions'} matched · ${records.length} indexed`;
  const children = found.slice((page - 1) * perPage, page * perPage).map(card);
  if (!children.length) children.push(make('p', 'Try a shorter phrase, a record number or a different institution.', 'empty'));
  $('results').replaceChildren(...children);
  $('pagination').hidden = pages <= 1;
  $('page').textContent = `Page ${page} of ${pages}`;
  $('previous').disabled = page === 1;
  $('next').disabled = page === pages;
  const filters = new URLSearchParams();
  for (const field of ['query', 'institution', 'type']) if ($(field).value) filters.set(field, $(field).value);
  const hash = filters.toString();
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  if (move) $('status').scrollIntoView({ block: 'nearest' });
}

function update() { page = 1; draw(); }

async function init() {
  try {
    const response = await fetch('./records.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    records = data.records.map(r => ({
      ...r,
      normalCode: normalize(r.code),
      normalTitle: normalize(r.title),
      indexed: normalize([r.code, r.title, r.description, r.related, r.retention, r.institution].join(' ')),
    }));
    for (const institution of [...new Set(records.map(x => x.institution))].sort()) {
      const option = make('option', institution);
      option.value = institution;
      $('institution').append(option);
    }
    const saved = new URLSearchParams(location.hash.slice(1));
    for (const field of ['query', 'institution', 'type']) {
      if (saved.has(field)) $(field).value = saved.get(field).slice(0, 160);
    }
    $('built').textContent = 'Index built ' + data.built + '.';
  } catch {
    $('status').textContent = 'The index could not be opened. Follow the official Info Source links below, or reload the page.';
    return;
  }
  $('filters').addEventListener('submit', event => { event.preventDefault(); update(); });
  $('query').addEventListener('input', update);
  for (const field of ['institution', 'type']) $(field).addEventListener('change', update);
  for (const button of document.querySelectorAll('[data-query]')) {
    button.addEventListener('click', () => { $('query').value = button.dataset.query; update(); });
  }
  $('clear').addEventListener('click', () => { $('filters').reset(); update(); $('query').focus(); });
  $('previous').addEventListener('click', () => { page--; draw(true); });
  $('next').addEventListener('click', () => { page++; draw(true); });
  $('close').addEventListener('click', () => $('draft').close());
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('draft-text').value);
      $('copy-status').textContent = 'Outline copied.';
    } catch {
      $('draft-text').focus();
      $('draft-text').select();
      $('copy-status').textContent = 'Outline selected. Copy it with Ctrl+C or Command+C.';
    }
  });
  draw();
}

init();

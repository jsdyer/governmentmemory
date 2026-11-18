import { defaultScope, readReferences, recordKey, referenceNotes, referencesFor, requestOutline, savedReference, standardInventory, storageKey } from './workspace.mjs';

const $ = id => document.getElementById(id);
const normalize = value => value.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
const govAtip = 'https://coolcode.ca/atip/';
const perPage = 12;
let records = [];
let page = 1;
let saved = new Map();
let currentReferences = new Map();
let storageAvailable = true;
let indexReady = false;
let customScope = false;

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

function draft(rows, institution, scope = defaultScope(rows)) {
  $('draft-text').value = requestOutline(rows, institution, scope);
  $('copy-status').textContent = '';
  $('draft').showModal();
  $('draft-text').focus();
}

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = make('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function workspaceRows() {
  return [...saved].map(([key, reference]) => currentReferences.get(key) ?? reference);
}

function selectedRows(rows = workspaceRows()) {
  return referencesFor(rows, $('saved-institution').value, $('include-standard').checked);
}

function drawSelection(resetScope = false) {
  const rows = workspaceRows();
  const recipient = $('saved-institution').value;
  const includeStandard = recipient !== standardInventory && rows.some(row => row.institution === standardInventory);
  if (resetScope) customScope = false;
  $('include-standard-label').hidden = !includeStandard;
  if (!includeStandard || resetScope) $('include-standard').checked = false;
  const draftRows = selectedRows(rows);
  if (!customScope) $('saved-scope').value = defaultScope(draftRows);
  $('draft-saved').disabled = !draftRows.length;
  const label = draftRows.length === 1 ? 'reference' : 'references';
  $('saved-selection').textContent = recipient === standardInventory
    ? `${draftRows.length} ${label} · Fill in the institution that uses these inventories.`
    : `${draftRows.length} ${label} for ${recipient}`;
}

function syncSaveButtons() {
  for (const button of document.querySelectorAll('[data-record-key]')) {
    button.setAttribute('aria-pressed', String(saved.has(button.dataset.recordKey)));
  }
}

function drawWorkspace() {
  $('saved-count').textContent = String(saved.size);
  $('saved-empty').hidden = saved.size > 0;
  $('saved-actions').hidden = saved.size === 0;
  $('saved-storage').textContent = storageAvailable ? 'Saved references stay in this browser.'
    : 'Browser storage is unavailable. Download the reference list to keep it after closing this tab.';
  const entries = [];
  const institutions = new Set();
  for (const [key, reference] of saved) {
    const row = currentReferences.get(key) ?? reference;
    institutions.add(row.institution);
    const item = make('li');
    const ref = make('div');
    ref.append(link(`${row.code} · ${row.title}`, row.link));
    ref.append(make('small', `${row.institution} · ${row.type}`));
    if (indexReady && !currentReferences.has(key)) ref.append(make('small', 'Saved from an earlier index.'));
    const remove = make('button', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${row.code} · ${row.title}`);
    remove.addEventListener('click', () => {
      const position = [...saved.keys()].indexOf(key);
      changeSaved(row, false);
      const buttons = $('saved-records').querySelectorAll('button');
      (buttons[Math.min(position, buttons.length - 1)] ?? $('workspace').querySelector('summary')).focus();
    });
    item.append(ref, remove);
    entries.push(item);
  }
  $('saved-records').replaceChildren(...entries);
  const recipient = $('saved-institution');
  const previous = recipient.value;
  const options = [...institutions].map(name => {
    const option = make('option', name);
    option.value = name;
    return option;
  });
  recipient.replaceChildren(...options);
  if (institutions.has(previous)) recipient.value = previous;
  drawSelection(recipient.value !== previous);
  syncSaveButtons();
}

function changeSaved(row, shouldSave) {
  const key = recordKey(row);
  try {
    if (storageAvailable) saved = readReferences(localStorage.getItem(storageKey));
  } catch { storageAvailable = false; }
  if (shouldSave) saved.set(key, savedReference(row));
  else saved.delete(key);
  try {
    localStorage.setItem(storageKey, JSON.stringify([...saved.values()]));
    storageAvailable = true;
  } catch { storageAvailable = false; }
  drawWorkspace();
  $('save-status').textContent = `${row.code} ${shouldSave ? 'saved' : 'removed'} · ${saved.size} saved`;
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
  outline.addEventListener('click', () => draft([row], row.institution));
  const save = make('button', 'Save record');
  save.type = 'button';
  const key = recordKey(row);
  save.dataset.recordKey = key;
  save.setAttribute('aria-label', `Save record ${row.code} · ${row.title}`);
  save.setAttribute('aria-pressed', String(saved.has(key)));
  save.addEventListener('click', () => changeSaved(row, !saved.has(key)));
  const topic = row.title.replace(/\s+(?:Personal Information Bank|Class of Record)$/i, '').replace(/\s*\(PPU \d+\)/, '');
  actions.append(link('Official entry ↗', row.link), link('Search completed ATIPs ↗', govAtip + '#' + new URLSearchParams({ q: topic })), outline, save);
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
  try { saved = readReferences(localStorage.getItem(storageKey)); } catch { storageAvailable = false; }
  $('saved-institution').addEventListener('change', () => drawSelection(true));
  $('saved-scope').addEventListener('change', () => { customScope = true; });
  $('include-standard').addEventListener('change', () => drawSelection());
  $('draft-saved').addEventListener('click', () => draft(selectedRows(), $('saved-institution').value, $('saved-scope').value));
  $('export-saved').addEventListener('click', () => download('info-source-references.md', referenceNotes(workspaceRows())));
  $('close').addEventListener('click', () => $('draft').close());
  $('draft').addEventListener('close', () => { $('draft-text').value = ''; });
  $('download-draft').addEventListener('click', () => download('info-source-request-outline.txt', $('draft-text').value));
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
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      if (event.storageArea !== localStorage) return;
      saved = readReferences(localStorage.getItem(storageKey));
      storageAvailable = true;
    } catch { return; }
    drawWorkspace();
  });
  drawWorkspace();
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
    currentReferences = new Map(records.map(row => [recordKey(row), row]));
    indexReady = true;
    for (const institution of [...new Set(records.map(x => x.institution))].sort()) {
      const option = make('option', institution);
      option.value = institution;
      $('institution').append(option);
    }
    const saved = new URLSearchParams(location.hash.slice(1));
    for (const field of ['query', 'institution', 'type']) {
      if (saved.has(field)) $(field).value = saved.get(field).slice(0, 160);
    }
    $('built').textContent = data.retrievedAt ? 'Official sources retrieved ' + data.retrievedAt.slice(0, 10) + '.' :
      data.fallback ? 'Using the dated source snapshot from ' + data.built + '.' : 'Index built ' + data.built + '.';
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
  drawWorkspace();
  draw();
}

init();

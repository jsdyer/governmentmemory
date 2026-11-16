import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { defaultScope, readReferences, recordKey, referenceNotes, referencesFor, requestOutline, savedReference, standardInventory } from '../web/workspace.mjs';

const { records } = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
const find = code => records.find(row => row.code === code);
const email = find('SSC WTS 102');
const sscCredentials = find('SSC PCU 607');
const craCredentials = find('CRA PPU 607');
const common = find('PSU 901');
const selected = [email, sscCredentials, craCredentials, common];

test('reference storage retains exact public identifiers and drops duplicate or invalid entries', () => {
  const saved = readReferences(JSON.stringify([email, sscCredentials, email, null, { ...craCredentials, link: 'javascript:alert(1)' }]));
  assert.deepEqual([...saved.keys()], [recordKey(email), recordKey(sscCredentials)]);
  assert.deepEqual(saved.get(recordKey(email)), savedReference(email));
  assert.equal(saved.get(recordKey(email)).description, undefined);
  assert.equal(readReferences('corrupt').size, 0);
  assert.equal(readReferences('{}').size, 0);
});

test('a recipient draft contains matching institution references and includes standard entries only on opt-in', () => {
  const target = 'Shared Services Canada';
  const rows = referencesFor(selected, target);
  assert.deepEqual(rows, [email, sscCredentials]);
  assert.equal(defaultScope(rows), 'records');
  const draft = requestOutline(rows, target, 'records');
  assert.match(draft, /To: Shared Services Canada\nSubject: Request under the Access to Information Act/);
  assert.match(draft, /SSC WTS 102/);
  assert.ok(draft.includes(email.link));
  assert.ok(draft.includes(email.modified));
  assert.ok(!draft.includes(craCredentials.code) && !draft.includes(common.code));
  assert.deepEqual(referencesFor(selected, target, true), [email, sscCredentials, common]);
});

test('personal and government-wide outlines resolve recipient and applicability separately', () => {
  const cra = referencesFor(selected, 'Canada Revenue Agency');
  assert.equal(defaultScope(cra), 'personal');
  const plain = requestOutline(cra, 'Canada Revenue Agency', 'personal');
  assert.match(plain, /Privacy Act/);
  assert.match(plain, /personal information about me/);
  const generic = requestOutline(referencesFor(selected, standardInventory), standardInventory, 'personal');
  assert.match(generic, /^To: \[Institution\]/);
  assert.match(generic, /where your institution applies them/);
  assert.ok(!generic.includes(craCredentials.code));
});

test('Markdown notes group all saved sources and retain clickable official URLs', () => {
  const notes = referenceNotes(selected);
  assert.match(notes, /## Canada Revenue Agency/);
  assert.match(notes, /## Shared Services Canada/);
  assert.match(notes, /## Government-wide standard inventories/);
  for (const row of selected) {
    assert.ok(notes.includes(row.link));
    assert.ok(notes.includes(row.code));
  }
});

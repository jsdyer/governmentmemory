export const standardInventory = 'Government-wide standard inventories';
export const storageKey = 'coolcode-governmentmemory-references-v1';

export const recordKey = row => JSON.stringify([row.institution, row.type, row.code, row.title]);

export function savedReference(row) {
  const { institution, type, code, title, link, modified } = row;
  return { institution, type, code, title, link, modified: modified ?? '' };
}

export function readReferences(value) {
  let rows;
  try { rows = JSON.parse(value ?? '[]'); } catch { return new Map(); }
  if (!Array.isArray(rows)) return new Map();
  const references = new Map();
  for (const row of rows) {
    if (!row || !['institution', 'type', 'code', 'title', 'link'].every(key => typeof row[key] === 'string' && row[key])) continue;
    try {
      const source = new URL(row.link);
      if (source.protocol !== 'https:' || source.hostname !== 'www.canada.ca' || source.username || source.password) continue;
    } catch { continue; }
    const reference = savedReference(row);
    reference.modified = typeof reference.modified === 'string' ? reference.modified : '';
    references.set(recordKey(reference), reference);
  }
  return references;
}

export function referencesFor(rows, institution, includeStandard = false) {
  return rows.filter(row => row.institution === institution || (includeStandard && row.institution === standardInventory));
}

export function defaultScope(rows) {
  return rows.length && rows.every(row => row.type === 'Personal Information Bank') ? 'personal' : 'records';
}

export function requestOutline(rows, institution, scope) {
  const target = institution === standardInventory ? '[Institution]' : institution;
  const personal = scope === 'personal';
  const act = personal ? 'Privacy Act' : 'Access to Information Act';
  const requested = personal ? 'personal information about me' : 'records';
  const output = [
    `To: ${target}`,
    `Subject: Request under the ${act}`,
    '',
    `I am requesting ${requested} relating to [subject] from [start date] to [end date].`,
    'Please search [programs, offices or systems, if known] for [specific documents or information].',
    '',
    'Published Info Source search references:',
  ];
  for (const row of rows) {
    output.push(`- ${row.title} (${row.code})${row.institution === standardInventory ? ' [government-wide standard]' : ''}`, `  Source: ${row.link}`);
    if (row.modified) output.push(`  Source page date: ${row.modified}`);
  }
  if (rows.some(row => row.institution === standardInventory)) {
    output.push('', 'Please use the government-wide references where your institution applies them.');
  }
  output.push('', 'I would prefer [electronic or another format] if available.');
  return output.join('\n');
}

export function referenceNotes(rows) {
  const lines = ['# Saved Info Source references', ''];
  const institutions = [...new Set(rows.map(row => row.institution))].sort((a, b) => a.localeCompare(b));
  for (const institution of institutions) {
    lines.push(`## ${institution}`, '');
    for (const row of referencesFor(rows, institution)) {
      lines.push(`- ${row.code} · ${row.title} (${row.type})`, `  - Official entry: ${row.link}`);
      if (row.modified) lines.push(`  - Source page date: ${row.modified}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

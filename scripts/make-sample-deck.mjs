/**
 * Generate the bundled sample deck (public/sample.apkg) used by the one-click
 * "Try the sample deck" button. Produces a legacy-format .apkg with a handful of
 * Basic (text) cards — the exact subset the importer supports.
 *
 * Run once (and re-run if you change the cards):  node scripts/make-sample-deck.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import initSqlJs from 'sql.js'
import JSZip from 'jszip'

const SEP = '\x1f'

const CARDS = [
  ['What is the capital of France?', 'Paris'],
  ['What is the capital of Japan?', 'Tokyo'],
  ['What is the capital of Australia?', 'Canberra'],
  ['What is the capital of Canada?', 'Ottawa'],
  ['What is the capital of Brazil?', 'Brasília'],
  ['What is the capital of Egypt?', 'Cairo'],
  ['What is the capital of Norway?', 'Oslo'],
  ['What is the capital of South Korea?', 'Seoul'],
  ['What is 7 × 8?', '56'],
  ['What gas do plants absorb from the air?', 'Carbon dioxide (CO₂)'],
]

const MODEL = {
  '1': {
    name: 'Basic',
    flds: [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ],
    tmpls: [
      {
        name: 'Card 1',
        ord: 0,
        qfmt: '{{Front}}',
        afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
    ],
  },
}

const SQL = await initSqlJs({
  wasmBinary: readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')),
})

const db = new SQL.Database()
db.run(`
  CREATE TABLE col (id INTEGER PRIMARY KEY, models TEXT, decks TEXT);
  CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, flds TEXT, tags TEXT);
  CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER);
`)
db.run('INSERT INTO col (id, models, decks) VALUES (1, ?, ?)', [
  JSON.stringify(MODEL),
  JSON.stringify({ '1': { name: 'Sample Deck' } }),
])

CARDS.forEach(([front, back], i) => {
  const noteId = 1000 + i
  db.run('INSERT INTO notes (id, guid, mid, flds, tags) VALUES (?, ?, ?, ?, ?)', [
    noteId,
    `sample-${i}`,
    1,
    [front, back].join(SEP),
    '',
  ])
  db.run('INSERT INTO cards (id, nid, did, ord) VALUES (?, ?, ?, ?)', [
    2000 + i,
    noteId,
    1,
    0,
  ])
})

const dbBytes = db.export()
db.close()

const zip = new JSZip()
zip.file('collection.anki21', dbBytes)
zip.file('media', '{}')
const out = await zip.generateAsync({ type: 'uint8array' })

const dest = resolve('public/sample.apkg')
writeFileSync(dest, out)
console.log(`Wrote ${dest} (${out.length} bytes, ${CARDS.length} cards)`)

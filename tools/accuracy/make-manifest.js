// Builds manifest.csv from the clip file names, so nobody types the transcripts by hand.
// File names: <accent>-<speaker>-q<NN>.<ext>   e.g.  yoruba-ada-q07.m4a   british-tom-q02.mp3
const fs = require('fs');
const path = require('path');

const clipsDir = process.argv[2];
if (!clipsDir) {
    console.error('Usage: node make-manifest.js <clips folder>');
    process.exit(1);
}
const questions = Object.fromEntries(
    fs
        .readFileSync(path.join(__dirname, 'questions.txt'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('|'))
);
const rows = ['file,accent,speaker,text'];
const skipped = [];
for (const file of fs.readdirSync(clipsDir).sort()) {
    const m = /^([a-z0-9_]+)-([a-z0-9_]+)-q(\d+)\.[a-z0-9]+$/i.exec(file);
    if (!m || !questions[m[3].padStart(2, '0')]) {
        if (!file.startsWith('.') && file !== 'manifest.csv') skipped.push(file);
        continue;
    }
    const text = questions[m[3].padStart(2, '0')].replace(/"/g, '""');
    rows.push(`${file},${m[1].toLowerCase()},${m[2].toLowerCase()},"${text}"`);
}
fs.writeFileSync(path.join(clipsDir, 'manifest.csv'), rows.join('\n') + '\n');
console.log(`Wrote ${rows.length - 1} clips to ${path.join(clipsDir, 'manifest.csv')}`);
if (skipped.length) console.log('Skipped (name did not match accent-speaker-qNN.ext):', skipped.join(', '));

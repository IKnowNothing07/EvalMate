// The extension manifest is only for the Chrome build; drop it from the website output and add .nojekyll for GitHub Pages.
import fs from 'node:fs'
fs.rmSync('docs/manifest.json', { force: true }); fs.writeFileSync('docs/.nojekyll', '')
console.log('docs/ ready for GitHub Pages')

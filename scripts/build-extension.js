import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const target = (process.argv[2] || process.env.TARGET_BROWSER || 'chrome').toLowerCase();
const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8'));
const version = pkg.version || '2.0.0';

console.log(`\n📦 Building Pro JSON Viewer v${version} for target: [${target.toUpperCase()}]...`);

// 1. Generate PNG Icons
console.log('🎨 Generating extension icons...');
execSync('node scripts/generate-icons.js', { cwd: rootDir, stdio: 'inherit' });

// 2. Run Vite Build with TARGET_BROWSER env
console.log(`⚡ Running Vite build for ${target}...`);
execSync('npx vite build', {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    TARGET_BROWSER: target
  }
});

// 3. Verify dist/manifest.json
const distManifestPath = path.resolve(rootDir, 'dist/manifest.json');
if (fs.existsSync(distManifestPath)) {
  const distManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf-8'));
  console.log(`✅ Manifest configured for ${target}:`);
  if (target === 'firefox') {
    console.log(`   - Background: scripts -> ${JSON.stringify(distManifest.background?.scripts)}`);
    console.log(`   - Gecko ID: ${distManifest.browser_specific_settings?.gecko?.id}`);
  } else {
    console.log(`   - Background: service_worker -> ${distManifest.background?.service_worker}`);
  }
}

// 4. Create Zip Archive for Target
const zipName = target === 'firefox'
  ? `pro-json-viewer-firefox-v${version}.zip`
  : `pro-json-viewer-v${version}.zip`;

const zipPath = path.resolve(rootDir, zipName);
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log(`🗜️  Packaging ${zipName}...`);
try {
  execSync(`cd dist && zip -r "../${zipName}" ./*`, {
    cwd: rootDir,
    stdio: 'ignore'
  });
  console.log(`🎉 Successfully generated: ${zipName}`);
} catch (err) {
  console.warn(`⚠️  Zip packaging skipped or failed: ${err.message}`);
}

console.log(`\n✨ Build Complete!`);
if (target === 'firefox') {
  console.log(`👉 Firefox Testing: Go to about:debugging#/runtime/this-firefox -> "Load Temporary Add-on…" -> Select "dist/manifest.json"`);
} else {
  console.log(`👉 Chrome/Edge Testing: Go to chrome://extensions -> "Load unpacked" -> Select "dist/" directory`);
}
console.log('');

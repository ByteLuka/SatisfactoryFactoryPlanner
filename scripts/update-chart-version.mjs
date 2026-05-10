import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const version = process.argv[2];
if (!version) {
  console.error('Usage: update-chart-version.mjs <version>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chartPath = path.join(__dirname, '..', 'helm', 'satisfactory-factory-planner', 'Chart.yaml');

let content = fs.readFileSync(chartPath, 'utf8');
content = content.replace(/^version: .+$/m, `version: ${version}`);
content = content.replace(/^appVersion: ".+"$/m, `appVersion: "${version}"`);
fs.writeFileSync(chartPath, content);
console.log(`[update-chart-version] Chart.yaml updated to ${version}`);

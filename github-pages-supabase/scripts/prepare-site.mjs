import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..', '..');
const source = resolve(root, 'study-site');
const overlay = resolve(root, 'github-pages-supabase');
const output = process.env.SITE_OUTPUT ? resolve(process.env.SITE_OUTPUT) : resolve(root, '_site');
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (!url || !anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set as GitHub Actions variables.');
}
if (!existsSync(source)) throw new Error(`Missing website source: ${source}`);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
cpSync(resolve(overlay, 'sync.js'), resolve(output, 'sync.js'));

const scripts = '<script defer src="data.js"></script><script defer src="app.js"></script><script defer src="sync.js"></script>';
const deployedScripts = '<script defer src="data.js"></script><script defer src="app.js"></script><script defer src="supabase-config.js"></script><script defer src="sync.js"></script>';
let html = readFileSync(resolve(output, 'index.html'), 'utf8');
if (!html.includes(scripts)) throw new Error('Could not find the expected script tags in study-site/index.html.');
html = html.replace(scripts, deployedScripts)
  .replaceAll('进度自动保存到研究者电脑', '进度自动保存到研究数据库')
  .replaceAll('保存到研究者电脑', '保存到研究数据库')
  .replaceAll('提交给研究者', '提交给研究数据库')
  .replaceAll('读取服务器进度', '读取数据库进度');
writeFileSync(resolve(output, 'index.html'), html);

writeFileSync(resolve(output, 'supabase-config.js'),
  `window.STUDY_SUPABASE = Object.freeze({ url: ${JSON.stringify(url)}, anonKey: ${JSON.stringify(anonKey)} });\n`);

import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
const production = 'https://wtfyzrqocnmmdgqthhli.supabase.co';
const asset = /\.(?:html|js|css|jpg|jpeg|png|svg|webp|ico|woff2)$/i;
const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]+$/;

function testBackend(value) {
  const url = new URL(value ?? '');
  const hosted = url.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(url.host);
  const local = url.protocol === 'http:' && url.hostname === '127.0.0.1' && Boolean(url.port);
  if ((!hosted && !local) || url.origin === production || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Choose a separate Supabase test project or a loopback Supabase instance.');
  }
  return url;
}

function localAnonKey(key) {
  if (!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(key)) return false;
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role === 'anon';
  } catch {
    return false;
  }
}

export async function buildIntegrationPreview({ backendUrl, publishableKey }) {
  const backend = testBackend(backendUrl);
  const authSource = await readFile(join(source, 'lajembo-auth.js'), 'utf8');
  const productionKey = authSource.match(/key='(sb_publishable_[A-Za-z0-9_-]+)'/)?.[1];
  if (!productionKey) throw new Error('The production website configuration could not be identified.');
  if (typeof publishableKey !== 'string' || publishableKey === productionKey ||
      !(publishableKeyPattern.test(publishableKey) ||
        (backend.protocol === 'http:' && localAnonKey(publishableKey)))) {
    throw new Error('Use only the test project publishable key or the local anon key.');
  }

  const output = await mkdtemp(join(tmpdir(), 'lajembo-integration-preview-'));
  const socket = backend.origin.replace(/^http/, 'ws');
  const policy = `<meta http-equiv="Content-Security-Policy" content="connect-src ${backend.origin} ${socket}; form-action 'self'">`;
  const banner = '<div role="status" style="padding:.5rem;text-align:center;background:#fff1ba;color:#151515">LAJEMBO integration test. Use test accounts only.</div>';
  try {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (!entry.isFile() || !asset.test(entry.name)) continue;
      const input = join(source, entry.name);
      const target = join(output, entry.name);
      if (!/\.(?:html|js|css)$/i.test(entry.name)) {
        await cp(input, target);
        continue;
      }
      let content = (await readFile(input, 'utf8'))
        .replaceAll(production, backend.origin)
        .replaceAll(productionKey, publishableKey);
      if (content.includes(new URL(production).hostname) || content.includes(productionKey)) {
        throw new Error(`Production backend configuration remains in ${entry.name}.`);
      }
      if (/\.html$/i.test(entry.name)) {
        const head = /<head\b[^>]*>/i;
        const body = /<body\b[^>]*>/i;
        if (!head.test(content) || !body.test(content)) {
          throw new Error(`Cannot apply integration-test restrictions to ${entry.name}.`);
        }
        content = content.replace(head, tag => tag + policy).replace(body, tag => tag + banner);
      }
      await writeFile(target, content);
    }
    await cp(join(source, 'vendor'), join(output, 'vendor'), { recursive: true });
    return output;
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = await buildIntegrationPreview({
      backendUrl: process.env.LAJEMBO_TEST_SUPABASE_URL,
      publishableKey: process.env.LAJEMBO_TEST_SUPABASE_PUBLISHABLE_KEY,
    });
    console.log(output);
  } catch (error) {
    console.error(error instanceof TypeError ? 'Provide a valid test Supabase URL.' : error.message);
    process.exitCode = 1;
  }
}

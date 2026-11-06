import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { buildIntegrationPreview } from '../scripts/build-integration-preview.mjs';

const testUrl = 'https://abcdefghijklmnopqrst.supabase.co';
const testKey = 'sb_publishable_integration_fixture';
const productionHost = 'wtfyzrqocnmmdgqthhli.supabase.co';

test('integration preview rewrites all website backend entry points and restricts browser connections', async (t) => {
  const output = await buildIntegrationPreview({ backendUrl: testUrl, publishableKey: testKey });
  t.after(() => rm(output, { recursive: true, force: true }));
  const files = await readdir(output);
  assert.ok(!files.includes('CNAME'));
  assert.ok(!files.includes('.github'));

  for (const file of files.filter(name => /\.(html|js|css)$/.test(name))) {
    const preview = await readFile(join(output, file), 'utf8');
    assert.ok(!preview.includes(productionHost), file);
    if (file.endsWith('.html')) {
      assert.match(preview, /<head[^>]*><meta http-equiv="Content-Security-Policy"/i);
      assert.ok(preview.includes(`connect-src ${testUrl} wss://abcdefghijklmnopqrst.supabase.co;`), file);
      assert.ok(preview.includes('Use test accounts only.'), file);
    }
  }

  for (const file of ['lajembo-auth.js', 'registration.html', 'registration-email.js',
    'provider-registration.js', 'provider-workspace.js', 'exclusive-provider-application.js']) {
    const preview = await readFile(join(output, file), 'utf8');
    assert.ok(preview.includes(testUrl) && preview.includes(testKey), file);
  }
  const original = await readFile(new URL('../lajembo-auth.js', import.meta.url), 'utf8');
  assert.ok(original.includes(productionHost));
});

test('integration preview rejects production, arbitrary hosts and privileged keys', async () => {
  await assert.rejects(buildIntegrationPreview({ backendUrl: `https://${productionHost}`, publishableKey: testKey }), /separate Supabase/);
  await assert.rejects(buildIntegrationPreview({ backendUrl: 'https://abcdefghijklmnopqrst.supabase.co.evil.example', publishableKey: testKey }), /separate Supabase/);
  await assert.rejects(buildIntegrationPreview({ backendUrl: testUrl, publishableKey: 'sb_secret_fixture' }), /only the test project publishable key/);

  const authSource = await readFile(new URL('../lajembo-auth.js', import.meta.url), 'utf8');
  const productionKey = authSource.match(/key='(sb_publishable_[A-Za-z0-9_-]+)'/)[1];
  await assert.rejects(buildIntegrationPreview({ backendUrl: testUrl, publishableKey: productionKey }), /only the test project publishable key/);
});

test('loopback accepts an anon token and rejects a service-role token', async (t) => {
  const token = role => 'fixture.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.fixture';
  const backendUrl = 'http://127.0.0.1:54321';
  await assert.rejects(buildIntegrationPreview({ backendUrl, publishableKey: token('service_role') }), /local anon key/);
  const output = await buildIntegrationPreview({ backendUrl, publishableKey: token('anon') });
  t.after(() => rm(output, { recursive: true, force: true }));
  assert.ok((await readFile(join(output, 'login.html'), 'utf8')).includes('connect-src http://127.0.0.1:54321 ws://127.0.0.1:54321'));
});

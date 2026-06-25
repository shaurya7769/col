const http = require('http');

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

const checkEndpoint = (path, options = {}) => {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ path, status: res.statusCode, data: parsed });
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
};

async function runVerification() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🛹 SKATE CMS FULL SYSTEM VERIFICATION  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  let passed = 0;
  let failed = 0;
  const results = [];

  const test = (label, condition) => {
    if (condition) {
      passed++;
      results.push(`  ✅ ${label}`);
    } else {
      failed++;
      results.push(`  ❌ ${label}`);
    }
  };

  try {
    // 1. Health Check
    console.log('▸ Testing Core Infrastructure...');
    const health = await checkEndpoint('/health');
    test('Health endpoint returns 200', health.status === 200);
    test('Health reports status', !!health.data.status);
    test('Health reports DB state', !!health.data.db);

    // 2. Social Feed (public)
    console.log('▸ Testing Social Feed API...');
    const feed = await checkEndpoint('/api/feed');
    test('Feed returns 200', feed.status === 200);
    test('Feed returns post array', Array.isArray(feed.data.data));
    test('Feed has mock posts', (feed.data.data?.length || 0) >= 2);

    // 3. Auth endpoint exists
    console.log('▸ Testing Auth Endpoints...');
    const authLogin = await checkEndpoint('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    test('Auth login endpoint exists (not 404)', authLogin.status !== 404);

    // 4. Protected routes (should return 401 without token)
    console.log('▸ Testing Route Protection...');
    const batches = await checkEndpoint('/api/batches');
    test('Batches requires auth (401)', batches.status === 401);

    const stats = await checkEndpoint('/api/stats/summary');
    test('Stats requires auth (401)', stats.status === 401);

    // 5. API Status
    console.log('▸ Testing API Status...');
    const apiStatus = await checkEndpoint('/api/status');
    test('API status endpoint returns 200', apiStatus.status === 200);

  } catch (err) {
    failed++;
    results.push(`  ❌ FATAL: ${err.message}`);
  }

  // Print results
  console.log('');
  console.log('─────────────── RESULTS ───────────────');
  results.forEach(r => console.log(r));
  console.log('───────────────────────────────────────');
  console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('');

  if (failed === 0) {
    console.log('✨ ALL SYSTEMS VERIFIED — PRODUCTION READY');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Review above.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runVerification();

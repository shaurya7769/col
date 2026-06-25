/**
 * Comprehensive integration test for Escape Skate Platform API
 * Run: node scripts/test_all.js
 * Requires: DB already setup (setup_sqlite + extend_features + extend_social)
 */
const http = require('http');
const { db } = require('../src/utils/db');

const BASE = 'http://localhost:3099';
const R = (method, path, body, token) => new Promise((resolve, reject) => {
  const url = new URL(path, BASE);
  const opts = {
    method,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  const req = http.request(opts, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
      catch { resolve({ status: res.statusCode, body: data }); }
    });
  });
  req.on('error', reject);
  if (body) req.write(JSON.stringify(body));
  req.end();
});

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    console.log(`  \u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`  \u274c ${name}: ${err.message || err}`);
    failed++;
  });
}

async function main() {
  console.log('\n=== ESCAPE PLATFORM — FULL API TEST SUITE ===\n');

  // ── Health ──
  console.log('[Health]');
  await test('GET /health returns 200', async () => {
    const r = await R('GET', '/health');
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (r.body.status !== 'healthy') throw new Error(`Expected healthy got ${r.body.status}`);
  });

  // ── Auth: Register ──
  console.log('\n[Auth: Register]');
  const testEmail = `test_${Date.now()}@test.com`;
  let tempToken;
  await test('POST /api/auth/register creates account', async () => {
    const r = await R('POST', '/api/auth/register', {
      username: `testuser_${Date.now()}`,
      email: testEmail,
      password: 'TestPass1!',
      skatepark_location: 'Test Park',
    });
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.status !== 'pending_otp') throw new Error(`Expected pending_otp got ${r.body.status}`);
    tempToken = r.body.tempToken;
    if (!tempToken) throw new Error('No tempToken returned');
  });

  // ── Auth: Login ──
  console.log('\n[Auth: Login]');
  await test('POST /api/auth/login with wrong password returns 401', async () => {
    const r = await R('POST', '/api/auth/login', { email: 'admin@escape.app', password: 'wrongpass1!' });
    if (r.status !== 401) throw new Error(`Expected 401 got ${r.status}`);
    if (r.body.success !== false) throw new Error('Expected success=false');
  });

  let adminTempToken;
  await test('POST /api/auth/login with valid creds returns pending_otp', async () => {
    const r = await R('POST', '/api/auth/login', { email: 'admin@escape.app', password: 'CoachPass1!' });
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (r.body.status !== 'pending_otp') throw new Error(`Expected pending_otp got ${r.body.status}`);
    adminTempToken = r.body.tempToken;
    if (!adminTempToken) throw new Error('No tempToken');
  });

  // ── Auth: Verify OTP (using DB to get OTP directly) ──
  console.log('\n[Auth: OTP Verification]');
  let adminToken;
  await test('Verify OTP for admin user via DB-read OTP', async () => {
    const user = db.prepare('SELECT otp, email FROM users WHERE email = ?').get('admin@escape.app');
    if (!user || !user.otp) throw new Error('No OTP found in DB for admin');

    const verify = await R('POST', '/api/auth/verify-otp', { tempToken: adminTempToken, otpCode: user.otp });
    if (verify.status !== 200) throw new Error(`Expected 200 got ${verify.status}: ${JSON.stringify(verify.body)}`);
    if (!verify.body.token) throw new Error('No auth token returned');
    adminToken = verify.body.token;
    if (!verify.body.user) throw new Error('No user returned');
  });

  await test('Verify OTP with wrong code returns 401', async () => {
    const r = await R('POST', '/api/auth/verify-otp', { tempToken: adminTempToken, otpCode: '000000' });
    if (r.status !== 401) throw new Error(`Expected 401 got ${r.status}`);
  });

  // ── Auth: Me ──
  console.log('\n[Auth: Me]');
  await test('GET /api/auth/me with valid token returns user', async () => {
    const r = await R('GET', '/api/auth/me', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (!r.body.user) throw new Error('No user in response');
    if (r.body.user.email !== 'admin@escape.app') throw new Error(`Expected admin@escape.app got ${r.body.user.email}`);
    if (r.body.user.role !== 'admin') throw new Error(`Expected admin role got ${r.body.user.role}`);
  });

  await test('GET /api/auth/me without token returns 401', async () => {
    const r = await R('GET', '/api/auth/me');
    if (r.status !== 401) throw new Error(`Expected 401 got ${r.status}`);
  });

  // ── Skateparks ──
  console.log('\n[Auth: Skateparks]');
  await test('GET /api/auth/skateparks returns list', async () => {
    const r = await R('GET', '/api/auth/skateparks');
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected array');
    if (r.body.data.length < 5) throw new Error('Expected at least 5 skateparks');
  });

  // ── Social Feed (mounted at /api/feed/) ──
  console.log('\n[Social Feed]');
  await test('GET /api/feed/ returns posts', async () => {
    const r = await R('GET', '/api/feed/', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected data array');
  });

  await test('POST /api/feed/ creates new post', async () => {
    const r = await R('POST', '/api/feed/', { caption: 'Test post from API test #skatetest @admin test' }, adminToken);
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.data || !r.body.data.id) throw new Error('No post id returned');
  });

  // ── Hashtags / Trending ──
  console.log('\n[Social: Hashtags]');
  await test('GET /api/feed/hashtags/trending returns list', async () => {
    const r = await R('GET', '/api/feed/hashtags/trending', null, adminToken);
    if (r.status !== 200) throw new Error(`Unexpected ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Post share ──
  await test('POST /api/feed/:id/share shares a post', async () => {
    const posts = await R('GET', '/api/feed/', null, adminToken);
    if (posts.body.data && posts.body.data.length > 0) {
      const postId = posts.body.data[0].id;
      const r = await R('POST', `/api/feed/${postId}/share`, null, adminToken);
      if (r.status !== 200 && r.status !== 201) throw new Error(`Expected 200/201 got ${r.status}: ${JSON.stringify(r.body)}`);
    }
  });

  // ── Progress ──
  console.log('\n[Progress]');
  const studentLogin = await R('POST', '/api/auth/login', { email: 'student@skate.academy', password: 'StudentPass1!' });
  const studentUser = db.prepare('SELECT otp FROM users WHERE email = ?').get('student@skate.academy');
  const studentVerify = await R('POST', '/api/auth/verify-otp', { tempToken: studentLogin.body.tempToken, otpCode: studentUser.otp });
  const studentToken = studentVerify.body.token;

  const today = new Date().toISOString().split('T')[0];

  await test('GET /api/progress/practice-logs returns empty list for new student', async () => {
    const r = await R('GET', '/api/progress/practice-logs', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('POST /api/progress/practice-logs creates log', async () => {
    const r = await R('POST', '/api/progress/practice-logs', {
      date: today,
      duration_minutes: 45,
      mood: 4,
      notes: 'Great session!',
      tricks_practiced: 'ollie,kickflip,boardslide'
    }, studentToken);
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/progress/practice-logs/stats returns stats', async () => {
    const r = await R('GET', '/api/progress/practice-logs/stats', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.data.total_sessions < 1) throw new Error('Expected at least 1 session');
  });

  await test('GET /api/progress/achievements returns list', async () => {
    const r = await R('GET', '/api/progress/achievements', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected array');
  });

  await test('POST /api/progress/goals creates goal', async () => {
    const r = await R('POST', '/api/progress/goals', {
      title: 'Land a kickflip',
      description: 'Consistently land kickflip within 2 weeks',
      target_date: new Date(Date.now() + 14*86400000).toISOString().split('T')[0],
    }, studentToken);
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/progress/goals returns goals', async () => {
    const r = await R('GET', '/api/progress/goals', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected array');
  });

  await test('POST /api/progress/feedback creates coach feedback', async () => {
    const coachLogin = await R('POST', '/api/auth/login', { email: 'alex@skate.academy', password: 'CoachPass1!' });
    const coachUser = db.prepare('SELECT otp FROM users WHERE email = ?').get('alex@skate.academy');
    const coachVerify = await R('POST', '/api/auth/verify-otp', { tempToken: coachLogin.body.tempToken, otpCode: coachUser.otp });
    const coachToken = coachVerify.body.token;
    const r = await R('POST', '/api/progress/feedback', {
      student_id: studentVerify.body.user.id,
      content: 'Great progress on your kickflip!',
      rating: 4
    }, coachToken);
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Leaderboard ──
  console.log('\n[Leaderboard]');
  await test('GET /api/leaderboard returns rankings', async () => {
    const r = await R('GET', '/api/leaderboard?type=tricks', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/leaderboard/my-rank returns rank', async () => {
    const r = await R('GET', '/api/leaderboard/my-rank?type=tricks', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Events ──
  console.log('\n[Events]');
  await test('POST /api/events creates event', async () => {
    const r = await R('POST', '/api/events', {
      title: 'Test Competition',
      description: 'Annual test competition',
      date: new Date(Date.now() + 30*86400000).toISOString(),
      location: 'Test Skatepark',
    }, adminToken);
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/events returns events', async () => {
    const r = await R('GET', '/api/events', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected array');
  });

  // ── Announcements ──
  console.log('\n[Announcements]');
  await test('POST /api/announcements creates announcement', async () => {
    const r = await R('POST', '/api/announcements', {
      title: 'Test Announcement',
      content: 'This is a test announcement',
      target_role: 'all',
    }, adminToken);
    if (r.status !== 201) throw new Error(`Expected 201 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/announcements returns announcements', async () => {
    const r = await R('GET', '/api/announcements', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected array');
  });

  // ── Notifications ──
  console.log('\n[Notifications]');
  await test('GET /api/notifications returns list', async () => {
    const r = await R('GET', '/api/notifications', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/notifications/unread-count returns count', async () => {
    const r = await R('GET', '/api/notifications/unread-count', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Admin ──
  console.log('\n[Admin]');
  await test('GET /api/admin/full-stats returns stats for admin', async () => {
    const r = await R('GET', '/api/admin/full-stats', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/admin/users returns user list', async () => {
    const r = await R('GET', '/api/admin/users', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}`);
    if (!Array.isArray(r.body.data)) throw new Error('Expected array');
  });

  // ── Stats ──
  console.log('\n[Stats]');
  await test('GET /api/stats/ returns stats for student', async () => {
    const r = await R('GET', '/api/stats/', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('GET /api/stats/summary returns detailed stats for student', async () => {
    const r = await R('GET', '/api/stats/summary', null, studentToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Batches ──
  console.log('\n[Batches]');
  await test('GET /api/batches returns batches for coach', async () => {
    const coachLogin = await R('POST', '/api/auth/login', { email: 'alex@skate.academy', password: 'CoachPass1!' });
    const coachUser = db.prepare('SELECT otp FROM users WHERE email = ?').get('alex@skate.academy');
    const coachVerify = await R('POST', '/api/auth/verify-otp', { tempToken: coachLogin.body.tempToken, otpCode: coachUser.otp });
    const coachToken = coachVerify.body.token;
    const r = await R('GET', '/api/batches', null, coachToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Social Profile ──
  console.log('\n[Social]');
  await test('GET /api/social/profile/:username returns profile', async () => {
    const r = await R('GET', '/api/social/profile/admin', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (!r.body.data) throw new Error('Expected data');
  });

  await test('GET /api/social/search finds users', async () => {
    const r = await R('GET', '/api/social/search?q=admin', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Auth: Change Password ──
  console.log('\n[Auth: Change Password]');
  await test('POST /api/auth/change-password with wrong current password returns 401', async () => {
    const r = await R('POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'NewPass1!' }, adminToken);
    if (r.status !== 401) throw new Error(`Expected 401 got ${r.status}`);
  });

  // ── Auth: Forgot / Reset Password ──
  console.log('\n[Auth: Forgot/Reset Password]');
  await test('POST /api/auth/forgot-password sends OTP', async () => {
    const r = await R('POST', '/api/auth/forgot-password', { email: 'admin@escape.app' });
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.status !== 'pending_otp') throw new Error(`Expected pending_otp got ${r.body.status}`);
  });

  // ── Resend OTP ──
  console.log('\n[Auth: Resend OTP]');
  await test('POST /api/auth/resend-otp with invalid token returns 401', async () => {
    const r = await R('POST', '/api/auth/resend-otp', { tempToken: 'invalid-token' });
    if (r.status !== 401) throw new Error(`Expected 401 got ${r.status}`);
  });

  // ── Messages ──
  console.log('\n[Messages]');
  await test('GET /api/messages/conversations returns list', async () => {
    const r = await R('GET', '/api/messages/conversations', null, adminToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Trick Verification ──
  console.log('\n[Trick Verification]');
  await test('GET /api/tricks/pending returns empty or list', async () => {
    const coachLogin = await R('POST', '/api/auth/login', { email: 'alex@skate.academy', password: 'CoachPass1!' });
    const coachUser = db.prepare('SELECT otp FROM users WHERE email = ?').get('alex@skate.academy');
    const coachVerify = await R('POST', '/api/auth/verify-otp', { tempToken: coachLogin.body.tempToken, otpCode: coachUser.otp });
    const coachToken = coachVerify.body.token;
    const r = await R('GET', '/api/tricks/pending', null, coachToken);
    if (r.status !== 200) throw new Error(`Expected 200 got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ── Summary ──
  console.log(`\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
  console.log(`  TOTAL: ${passed + failed} tests`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});

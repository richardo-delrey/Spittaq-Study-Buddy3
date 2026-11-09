const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const PROJECT_ROOT = __dirname;
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const DATA_FILE = path.join(PROJECT_ROOT, 'data', 'study-data.json');
const SUBMISSIONS_DIR = path.join(PROJECT_ROOT, 'data', 'submissions');
const MATERIALS_DIR = path.join(PROJECT_ROOT, 'data', 'materials');
const ACCOUNTS_FILE = path.join(PROJECT_ROOT, 'data', 'accounts.json');
const TEACHER_PUBLIC_ROOT = path.join(PROJECT_ROOT, 'guru');
const PORT = Number(process.env.PORT) || 3000;
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function readData() {
  const contents = fs.readFileSync(DATA_FILE, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(contents);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, '{\n  "users": []\n}\n', 'utf8');
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8').replace(/^\uFEFF/, ''));
  accounts.users ||= [];
  return accounts;
}

function writeAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_FILE, `${JSON.stringify(accounts, null, 2)}\n`, 'utf8');
}

function getSessionUser(request) {
  const cookie = request.headers.cookie || '';
  const token = cookie.split(';').map(item => item.trim()).find(item => item.startsWith('spittaq_session='))?.slice('spittaq_session='.length);
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return readAccounts().users.find(user => user.id === session.userId) || null;
}

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, className: user.className || '' };
}

function setSession(response, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL });
  response.setHeader('Set-Cookie', `spittaq_session=${token}; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=${SESSION_TTL / 1000}`);
}

function clearSession(request, response) {
  const cookie = request.headers.cookie || '';
  const token = cookie.split(';').map(item => item.trim()).find(item => item.startsWith('spittaq_session='))?.slice('spittaq_session='.length);
  if (token) sessions.delete(token);
  response.setHeader('Set-Cookie', 'spittaq_session=; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=0');
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.on('data', chunk => {
      rawBody += chunk;
      if (rawBody.length > 75_000_000) {
        reject(new Error('Payload terlalu besar'));
      }
    });

    request.on('end', () => {
      try {
        resolve(JSON.parse(rawBody || '{}'));
      } catch {
        reject(new Error('JSON tidak valid'));
      }
    });

    request.on('error', reject);
  });
}

function getDashboardSummary(data) {
  const completedTasks = data.tasks.filter(task => task.completed).length;
  const averageProgress = Math.round(
    data.subjects.reduce((total, subject) => total + subject.progress, 0) /
      data.subjects.length,
  );

  return {
    totalTasks: 7 + data.tasks.length,
    tasksToday: data.tasks.length,
    completedTasks: 18 + completedTasks,
    remainingTasks: Math.max(0, 4 - completedTasks),
    urgentTasks: 3,
    progress: averageProgress,
  };
}

function sendStaticFile(request, response, pathname, publicRoot = PUBLIC_ROOT) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = path.resolve(publicRoot, `.${relativePath}`);

  if (
    !filePath.startsWith(`${publicRoot}${path.sep}`) ||
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('File tidak ditemukan');
    return;
  }

  response.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, pathname) {
  const data = readData();
  data.submissions ||= [];
  data.materials ||= [];

  if (request.method === 'GET' && pathname === '/api/auth/me') {
    const user = getSessionUser(request);
    sendJson(response, 200, { user: user ? publicUser(user) : null });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJsonBody(request);
    const role = body.role;
    const username = String(body.username || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!['student', 'teacher'].includes(role)) {
      sendJson(response, 400, { error: 'Jenis akun tidak valid.' });
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      sendJson(response, 400, { error: 'Username harus 3–30 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' });
      return;
    }
    if (name.length < 2 || name.length > 60 || password.length < 8 || password.length > 128) {
      sendJson(response, 400, { error: 'Nama minimal 2 karakter dan kata sandi minimal 8 karakter.' });
      return;
    }
    const accounts = readAccounts();
    if (accounts.users.some(user => user.username === username)) {
      sendJson(response, 409, { error: 'Username sudah digunakan.' });
      return;
    }
    const firstStudentAccount = role === 'student' && !accounts.users.some(item => item.role === 'student');
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
    const user = {
      id: `user-${crypto.randomUUID()}`,
      username,
      name,
      role,
      className: role === 'student' ? String(body.className || '').trim().slice(0, 30) : '',
      passwordSalt: salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    accounts.users.push(user);
    writeAccounts(accounts);
    if (firstStudentAccount) {
      data.tasks.forEach(task => { if (!task.ownerUserId) task.ownerUserId = user.id; });
      data.submissions.forEach(submission => {
        if (!submission.studentUserId) {
          submission.studentUserId = user.id;
          submission.studentName ||= user.name;
        }
      });
      writeData(data);
    }
    setSession(response, user);
    sendJson(response, 201, { user: publicUser(user) });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJsonBody(request);
    const accounts = readAccounts();
    const username = String(body.username || '').trim().toLowerCase();
    const user = accounts.users.find(item => item.username === username && item.role === body.role);
    if (!user || !body.password) {
      sendJson(response, 401, { error: 'Username, kata sandi, atau jenis akun tidak cocok.' });
      return;
    }
    const attemptedHash = await scrypt(String(body.password), user.passwordSalt, 64);
    const savedHash = Buffer.from(user.passwordHash, 'hex');
    if (savedHash.length !== attemptedHash.length || !crypto.timingSafeEqual(savedHash, attemptedHash)) {
      sendJson(response, 401, { error: 'Username, kata sandi, atau jenis akun tidak cocok.' });
      return;
    }
    setSession(response, user);
    sendJson(response, 200, { user: publicUser(user) });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    clearSession(request, response);
    sendJson(response, 200, { ok: true });
    return;
  }

  const user = getSessionUser(request);
  if (!user) {
    sendJson(response, 401, { error: 'Silakan masuk ke akun terlebih dahulu.' });
    return;
  }
  const isTeacher = user.role === 'teacher';
  if ((pathname.startsWith('/api/teacher/') && !isTeacher) || (!pathname.startsWith('/api/teacher/') && isTeacher)) {
    sendJson(response, 403, { error: 'Akun ini tidak memiliki akses ke halaman tersebut.' });
    return;
  }

  if (request.method === 'PATCH' && pathname === '/api/auth/profile') {
    const body = await readJsonBody(request);
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 60) {
      sendJson(response, 400, { error: 'Nama harus berisi 2–60 karakter.' });
      return;
    }
    const accounts = readAccounts();
    const account = accounts.users.find(item => item.id === user.id);
    account.name = name;
    if (user.role === 'student') account.className = String(body.className || '').trim().slice(0, 30);
    writeAccounts(accounts);
    sendJson(response, 200, { user: publicUser(account) });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/materials') {
    const match = String(user.className || '').match(/(?:^|\D)([789])(?:\D|$)/);
    const grade = match ? Number(match[1]) : null;
    const materials = grade ? data.materials.filter(item => item.grade === grade).slice().reverse() : [];
    sendJson(response, 200, { grade, materials });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/teacher/materials') {
    sendJson(response, 200, data.materials.slice().reverse());
    return;
  }

  if (request.method === 'POST' && pathname === '/api/teacher/materials') {
    const body = await readJsonBody(request);
    const grade = Number(body.grade);
    const semester = Number(body.semester);
    const title = String(body.title || '').trim();
    const subject = String(body.subject || '').trim();
    const originalName = path.basename(String(body.fileName || ''));
    const extension = path.extname(originalName).toLowerCase();
    const allowed = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png']);
    if (!title || title.length > 120 || !subject || ![7, 8, 9].includes(grade) || ![1, 2].includes(semester)) {
      sendJson(response, 400, { error: 'Judul, mata pelajaran, kelas, dan semester wajib dipilih.' });
      return;
    }
    if (!allowed.has(extension) || typeof body.fileData !== 'string') {
      sendJson(response, 400, { error: 'Pilih berkas PDF, Word, PowerPoint, atau gambar.' });
      return;
    }
    const fileBuffer = Buffer.from(body.fileData, 'base64');
    if (!fileBuffer.length || fileBuffer.length > 50 * 1024 * 1024) {
      sendJson(response, 400, { error: 'Ukuran berkas harus antara 1 byte dan 50 MB.' });
      return;
    }
    fs.mkdirSync(MATERIALS_DIR, { recursive: true });
    const storedName = `material-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extension}`;
    fs.writeFileSync(path.join(MATERIALS_DIR, storedName), fileBuffer);
    const material = {
      id: `material-${crypto.randomUUID()}`, title, subject, grade, semester,
      note: String(body.note || '').trim().slice(0, 500),
      teacherUserId: user.id, teacherName: user.name, fileName: originalName,
      downloadUrl: `/api/materials/file/${storedName}`, uploadedAt: new Date().toISOString(),
    };
    data.materials.push(material);
    writeData(data);
    sendJson(response, 201, material);
    return;
  }

  const materialDelete = pathname.match(/^\/api\/teacher\/materials\/([\w-]+)$/);
  if (materialDelete && request.method === 'DELETE') {
    const index = data.materials.findIndex(item => item.id === materialDelete[1] && item.teacherUserId === user.id);
    if (index < 0) { sendJson(response, 404, { error: 'Materi tidak ditemukan atau bukan milik akun ini.' }); return; }
    const [removed] = data.materials.splice(index, 1);
    const storedName = path.basename(removed.downloadUrl || '');
    if (storedName) fs.rmSync(path.join(MATERIALS_DIR, storedName), { force: true });
    writeData(data);
    sendJson(response, 200, { ok: true });
    return;
  }

  const materialFile = pathname.match(/^\/api\/(teacher\/)?materials\/file\/([\w.-]+)$/);
  if (materialFile && request.method === 'GET') {
    const isTeacherFile = Boolean(materialFile[1]);
    const storedName = path.basename(materialFile[2]);
    const material = data.materials.find(item => item.downloadUrl.endsWith(`/${storedName}`));
    const classMatch = String(user.className || '').match(/(?:^|\D)([789])(?:\D|$)/);
    const userGrade = classMatch ? Number(classMatch[1]) : null;
    if (!material || (isTeacherFile && !isTeacher) || (!isTeacherFile && (isTeacher || material.grade !== userGrade))) {
      sendJson(response, 404, { error: 'Berkas materi tidak ditemukan.' }); return;
    }
    const filePath = path.join(MATERIALS_DIR, storedName);
    if (!fs.existsSync(filePath)) { sendJson(response, 404, { error: 'Berkas materi tidak ditemukan.' }); return; }
    const extension = path.extname(material.fileName).toLowerCase();
    const materialTypes = {
      '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    response.writeHead(200, { 'Content-Type': materialTypes[extension] || 'application/octet-stream', 'Content-Disposition': `inline; filename="${material.fileName.replace(/["\\]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(filePath).pipe(response);
    return;
  }

  if (request.method === 'GET' && pathname === '/api/submissions') {
    sendJson(response, 200, data.submissions.filter(item => item.studentUserId === user.id).slice().reverse());
    return;
  }

  if (request.method === 'GET' && pathname === '/api/teachers') {
    const teachers = readAccounts().users
      .filter(item => item.role === 'teacher')
      .map(item => ({ id: item.id, name: item.name }));
    sendJson(response, 200, teachers);
    return;
  }

  if (request.method === 'GET' && pathname === '/api/teacher/submissions') {
    sendJson(response, 200, data.submissions.filter(item => item.teacherUserId === user.id).slice().reverse());
    return;
  }

  const submissionRoute = pathname.match(/^\/api\/teacher\/submissions\/([\w-]+)$/);
  if (submissionRoute && request.method === 'PATCH') {
    const submission = data.submissions.find(item => item.id === submissionRoute[1] && item.teacherUserId === user.id);
    if (!submission) {
      sendJson(response, 404, { error: 'Pengumpulan tugas tidak ditemukan' });
      return;
    }
    const body = await readJsonBody(request);
    if (!['Belum dinilai', 'Dinilai'].includes(body.status)) {
      sendJson(response, 400, { error: 'Status penilaian tidak valid' });
      return;
    }
    if (!Number.isInteger(body.score) || body.score < 50 || body.score > 100) {
      sendJson(response, 400, { error: 'Nilai harus berupa angka bulat dari 50 sampai 100.' });
      return;
    }
    submission.status = body.status;
    submission.score = body.score;
    submission.feedback = String(body.feedback || '').trim().slice(0, 1000);
    submission.reviewedAt = new Date().toISOString();
    writeData(data);
    sendJson(response, 200, submission);
    return;
  }

  const submittedFile = pathname.match(/^\/api\/(?:teacher\/submissions|submissions)\/file\/([\w.-]+)$/);
  if (request.method === 'GET' && submittedFile) {
    const submission = data.submissions.find(item => item.downloadUrl.endsWith(`/${submittedFile[1]}`));
    if (!submission || (isTeacher && submission.teacherUserId !== user.id) || (!isTeacher && submission.studentUserId !== user.id)) {
      sendJson(response, 404, { error: 'Berkas tidak ditemukan.' });
      return;
    }
    const safeName = path.basename(submittedFile[1]);
    const filePath = path.join(SUBMISSIONS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      sendJson(response, 404, { error: 'Berkas tidak ditemukan' });
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    });
    fs.createReadStream(filePath).pipe(response);
    return;
  }

  if (request.method === 'POST' && pathname === '/api/submissions') {
    if (isTeacher) {
      sendJson(response, 403, { error: 'Akun guru tidak dapat mengumpulkan tugas sebagai siswa.' });
      return;
    }
    const body = await readJsonBody(request);
    const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png']);
    const originalName = path.basename(String(body.fileName || ''));
    const extension = path.extname(originalName).toLowerCase();
    if (!body.title?.trim() || body.title.trim().length > 120 || !body.subject?.trim()) {
      sendJson(response, 400, { error: 'Nama tugas dan mata pelajaran wajib diisi.' });
      return;
    }
    const targetTeacher = readAccounts().users.find(item => item.id === body.teacherUserId && item.role === 'teacher');
    if (!targetTeacher) {
      sendJson(response, 400, { error: 'Pilih guru tujuan yang valid.' });
      return;
    }
    if (!allowedExtensions.has(extension) || typeof body.fileData !== 'string') {
      sendJson(response, 400, { error: 'Jenis berkas tidak didukung.' });
      return;
    }
    const fileBuffer = Buffer.from(body.fileData, 'base64');
    if (!fileBuffer.length || fileBuffer.length > 50 * 1024 * 1024) {
      sendJson(response, 400, { error: 'Ukuran berkas harus antara 1 byte dan 50 MB.' });
      return;
    }
    fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
    const storedName = `submission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
    fs.writeFileSync(path.join(SUBMISSIONS_DIR, storedName), fileBuffer);
    const submission = {
      id: `submission-${Date.now()}`,
      title: body.title.trim(),
      subject: body.subject.trim(),
      studentUserId: user.id,
      studentName: user.name,
      teacherUserId: targetTeacher.id,
      teacherName: targetTeacher.name,
      note: String(body.note || '').slice(0, 500),
      fileName: originalName,
      downloadUrl: `/api/submissions/file/${storedName}`,
      submittedAt: new Date().toISOString(),
      status: 'Belum dinilai',
      feedback: '',
    };
    data.submissions.push(submission);
    writeData(data);
    sendJson(response, 201, submission);
    return;
  }

  if (request.method === 'GET' && pathname === '/api/dashboard') {
    const studentTasks = data.tasks.filter(task => task.ownerUserId === user.id);
    sendJson(response, 200, {
      tasks: studentTasks,
      subjects: data.subjects,
      summary: getDashboardSummary({ ...data, tasks: studentTasks }),
    });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/tasks') {
    sendJson(response, 200, data.tasks.filter(task => task.ownerUserId === user.id));
    return;
  }

  if (request.method === 'GET' && pathname === '/api/subjects') {
    sendJson(response, 200, data.subjects);
    return;
  }

  if (request.method === 'POST' && pathname === '/api/tasks') {
    const body = await readJsonBody(request);
    const subjectKeys = {
      'Pendidikan Agama Islam': 'other',
      PPKn: 'other',
      'Bahasa Indonesia': 'other',
      Informatika: 'other',
      'Seni Budaya': 'other',
      'Bahasa Jawa': 'other',
      Matematika: 'math',
      IPA: 'ipa',
      'Bahasa Inggris': 'eng',
      IPS: 'ips',
      PJOK: 'pjok',
    };

    if (
      typeof body.title !== 'string' ||
      !body.title.trim() ||
      body.title.trim().length > 120
    ) {
      sendJson(response, 400, {
        error: 'Judul tugas wajib diisi (maksimal 120 karakter)',
      });
      return;
    }

    if (!subjectKeys[body.subject]) {
      sendJson(response, 400, { error: 'Mata pelajaran tidak valid' });
      return;
    }

    if (!['High', 'Medium', 'Low'].includes(body.priority)) {
      sendJson(response, 400, { error: 'Prioritas tidak valid' });
      return;
    }

    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ownerUserId: user.id,
      subject: body.subject,
      subjectKey: subjectKeys[body.subject],
      title: body.title.trim(),
      time: body.time || '09:00 - 10:00',
      priority: body.priority,
      completed: false,
      dueDate: body.dueDate || new Date().toISOString().slice(0, 10),
    };

    data.tasks.push(task);
    writeData(data);
    sendJson(response, 201, task);
    return;
  }

  const taskRoute = pathname.match(/^\/api\/tasks\/([\w-]+)$/);
  if (taskRoute && request.method === 'PATCH') {
    const task = data.tasks.find(item => item.id === taskRoute[1] && item.ownerUserId === user.id);
    if (!task) {
      sendJson(response, 404, { error: 'Tugas tidak ditemukan' });
      return;
    }

    const body = await readJsonBody(request);
    if (typeof body.completed !== 'boolean') {
      sendJson(response, 400, {
        error: 'Field completed harus berupa boolean',
      });
      return;
    }

    task.completed = body.completed;
    writeData(data);
    sendJson(response, 200, task);
    return;
  }

  if (taskRoute && request.method === 'DELETE') {
    const taskIndex = data.tasks.findIndex(item => item.id === taskRoute[1] && item.ownerUserId === user.id);
    if (taskIndex < 0) {
      sendJson(response, 404, { error: 'Tugas tidak ditemukan' });
      return;
    }

    const [removedTask] = data.tasks.splice(taskIndex, 1);
    writeData(data);
    sendJson(response, 200, removedTask);
    return;
  }

  sendJson(response, 404, { error: 'Endpoint tidak ditemukan' });
}

const allowedOrigins = new Set([
  process.env.FRONTEND_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean));

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url.pathname);
      return;
    }

    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method tidak didukung' });
      return;
    }

    const user = getSessionUser(request);
    if (url.pathname === '/guru' || url.pathname === '/guru/') {
      response.writeHead(302, { Location: '/guru/index.html' });
      response.end();
      return;
    }
    if (url.pathname.startsWith('/guru/')) {
      const teacherPath = url.pathname.slice('/guru'.length) || '/index.html';
      if (['/portal.html', '/materi.html'].includes(teacherPath) && user?.role !== 'teacher') {
        if (user?.role === 'student') {
          response.writeHead(302, { Location: '/' });
          response.end();
          return;
        }
        sendStaticFile(request, response, '/index.html', TEACHER_PUBLIC_ROOT);
        return;
      }
      if (teacherPath === '/index.html' && user?.role === 'teacher') {
        response.writeHead(302, { Location: '/guru/portal.html' });
        response.end();
        return;
      }
      if (teacherPath === '/index.html' && user?.role === 'student') {
        response.writeHead(302, { Location: '/' });
        response.end();
        return;
      }
      if (['/portal.html', '/materi.html'].includes(teacherPath) && user?.role === 'student') {
        response.writeHead(302, { Location: '/' });
        response.end();
        return;
      }
      sendStaticFile(request, response, teacherPath, TEACHER_PUBLIC_ROOT);
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/login.html') {
      if (user?.role === 'teacher') {
        response.writeHead(302, { Location: '/guru/portal.html' });
        response.end();
        return;
      }
      if (user?.role === 'student' && url.pathname !== '/login.html') {
        sendStaticFile(request, response, '/index.html');
        return;
      }
      if (user?.role === 'student') {
        response.writeHead(302, { Location: '/' });
        response.end();
        return;
      }
      sendStaticFile(request, response, '/login.html');
      return;
    }
    sendStaticFile(request, response, url.pathname);
  } catch (error) {
    sendJson(response, 400, { error: error.message || 'Permintaan gagal' });
  }
});

server.listen(PORT, () => {
  console.log(`SMPIT At-Taqwa Surabaya berjalan di http://localhost:${PORT}`);
});

const elements = {
  toast: document.querySelector('#toast'),
  taskList: document.querySelector('#tasks'),
  search: document.querySelector('#searchInput'),
  taskFilter: document.querySelector('#taskFilter'),
  dialog: document.querySelector('#taskDialog'),
};

const isLocalFile = window.location.protocol === 'file:';
const priorityClass = { High: 'high', Medium: 'medium', Low: 'low' };
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

let tasks = [];
let searchTerm = '';
let statusFilter = 'all';
const getTodayKey = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};
const today = new Date();
let selectedDate = getTodayKey();
let dateFilterEnabled = false;
let offlineData = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2400);
}

function escapeHTML(value) {
  const replacements = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(value).replace(/[&<>"']/g, character => replacements[character]);
}

function getOfflineData() {
  if (offlineData) return offlineData;

  try {
    offlineData = JSON.parse(localStorage.getItem('spittaq-dashboard-data'));
  } catch {
    offlineData = null;
  }

  if (!offlineData) {
    offlineData = JSON.parse(JSON.stringify(window.dashboardFallbackData));
  }

  return offlineData;
}

function saveOfflineData() {
  try {
    localStorage.setItem('spittaq-dashboard-data', JSON.stringify(offlineData));
  } catch {
    // The dashboard still works for this page session if browser storage is disabled.
  }
}

function getSummary(data) {
  const completedToday = data.tasks.filter(task => task.completed).length;
  const averageProgress = Math.round(
    data.subjects.reduce((total, subject) => total + subject.progress, 0) /
      data.subjects.length,
  );

  return {
    totalTasks: 7 + data.tasks.length,
    tasksToday: data.tasks.length,
    completedTasks: 18 + completedToday,
    remainingTasks: Math.max(0, 4 - completedToday),
    progress: averageProgress,
  };
}

async function apiRequest(url, options = {}) {
  if (isLocalFile) {
    return handleOfflineRequest(url, options);
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'Permintaan gagal');
  }

  return body;
}

function handleOfflineRequest(url, options) {
  const data = getOfflineData();
  const method = options.method || 'GET';
  const taskRoute = url.match(/^\/api\/tasks\/([\w-]+)$/);

  if (url === '/api/dashboard' && method === 'GET') {
    return {
      tasks: data.tasks,
      subjects: data.subjects,
      summary: getSummary(data),
    };
  }

  if (url === '/api/tasks' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const task = {
      id: `local-${Date.now()}`,
      subject: body.subject,
      subjectKey: subjectKeys[body.subject] || 'math',
      title: body.title,
      time: body.time || '09:00 - 10:00',
      priority: body.priority || 'Medium',
      completed: false,
      dueDate: body.dueDate || selectedDate,
    };

    data.tasks.push(task);
    saveOfflineData();
    return task;
  }

  if (taskRoute && method === 'PATCH') {
    const task = data.tasks.find(item => item.id === taskRoute[1]);
    if (!task) throw new Error('Tugas tidak ditemukan');

    task.completed = JSON.parse(options.body || '{}').completed;
    saveOfflineData();
    return task;
  }

  if (taskRoute && method === 'DELETE') {
    data.tasks = data.tasks.filter(item => item.id !== taskRoute[1]);
    saveOfflineData();
    return { ok: true };
  }

  throw new Error('Endpoint tidak tersedia pada mode lokal');
}

function getVisibleTasks() {
  return tasks.filter(task => {
    const searchableText = `${task.title} ${task.subject} ${task.priority}`.toLowerCase();
    const matchesSearch = searchableText.includes(searchTerm);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'done' ? task.completed : !task.completed);
    const matchesDate = !dateFilterEnabled || task.dueDate === selectedDate;

    return matchesSearch && matchesStatus && matchesDate;
  });
}

function renderTasks() {
  const visibleTasks = getVisibleTasks();

  if (visibleTasks.length === 0) {
    elements.taskList.innerHTML =
      '<div class="empty-state">Tidak ada tugas yang cocok. Coba ubah pencarian atau filter.</div>';
    return;
  }

  elements.taskList.innerHTML = visibleTasks
    .map(task => {
      const completedClass = task.completed ? 'task-complete' : '';
      const checked = task.completed ? 'checked' : '';
      const level = priorityClass[task.priority] || 'medium';

      return `
        <div class="task ${completedClass}">
          <input type="checkbox" data-task-id="${escapeHTML(task.id)}" ${checked}
            aria-label="Tandai ${escapeHTML(task.title)} selesai">
          <span class="subject ${escapeHTML(task.subjectKey)}">${escapeHTML(task.subject)}</span>
          <span class="detail" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
          <time>${escapeHTML(task.time)}</time>
          <span class="level ${level}">${escapeHTML(task.priority)}</span>
          <button class="more" type="button" data-delete-id="${escapeHTML(task.id)}"
            aria-label="Hapus ${escapeHTML(task.title)}" title="Hapus tugas">×</button>
        </div>`;
    })
    .join('');

  addTaskRowListeners();
}

function addTaskRowListeners() {
  elements.taskList.querySelectorAll('[data-task-id]').forEach(input => {
    input.addEventListener('change', async () => {
      input.disabled = true;

      try {
        const task = tasks.find(item => item.id === input.dataset.taskId);
        await apiRequest(`/api/tasks/${encodeURIComponent(input.dataset.taskId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ completed: input.checked }),
        });
        if (task) window.spittaqDailyCounters.completed(task, input.checked);
        await loadDashboard();
        showToast(input.checked ? 'Tugas ditandai selesai!' : 'Tugas kembali ke daftar aktif');
      } catch (error) {
        input.checked = !input.checked;
        showToast(error.message);
      }
    });
  });

  elements.taskList.querySelectorAll('[data-delete-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const task = tasks.find(item => item.id === button.dataset.deleteId);
      if (!task || !confirm(`Hapus tugas “${task.title}”?`)) return;

      try {
        await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: 'DELETE',
        });
        window.spittaqDailyCounters.deleted(task);
        await loadDashboard();
        showToast('Tugas berhasil dihapus');
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderSubjects(subjects) {
  subjects = window.spittaqDailyCounters.applySubjects(subjects);
  document.querySelector('#subjects').innerHTML = subjects
    .map(subject => `
      <div class="subject-line">
        <span class="subject-ico">${escapeHTML(subject.icon)}</span>
        <div class="subject-info">
          <div>${escapeHTML(subject.name)}</div>
          <div class="tinybar">
            <i style="width:${Number(subject.progress)}%;background:${escapeHTML(subject.color)}"></i>
          </div>
        </div>
        <span class="percent">${Number(subject.progress)}%</span>
      </div>`)
    .join('');
}

function renderSummary(summary) {
  summary = window.spittaqDailyCounters.summary();
  const stats = document.querySelectorAll('.stat strong');
  if (!stats.length) return;
  stats[0].textContent = summary.totalTasks;
  stats[1].textContent = summary.tasksToday;
  stats[2].textContent = summary.urgentTasks;
  stats[3].textContent = `${summary.progress}%`;
  document.querySelector('.stat .progressbar i').style.width = `${summary.progress}%`;
  document.querySelector('.weekly div:nth-child(1) b').textContent = `✅ ${summary.completedTasks}`;
  document.querySelector('.weekly div:nth-child(2) b').textContent = `◷ ${summary.remainingTasks}`;
  document.querySelector('.weekly div:nth-child(3) b').textContent = `🔺 ${summary.overdueTasks}`;
  document.querySelector('.celebrate b').textContent = `${summary.progress}%`;
  const progressCopy = document.querySelector('#weeklyProgressCopy');
  const progressBar = document.querySelector('#weeklyProgressBar');
  if (progressCopy) {
    progressCopy.textContent = `Kamu sudah menyelesaikan ${summary.progress}% target belajar minggu ini.`;
  }
  if (progressBar) progressBar.style.width = `${summary.progress}%`;
}

async function loadDashboard() {
  try {
    const data = await apiRequest('/api/dashboard');
    tasks = data.tasks;
    renderTasks();
    drawCalendar();
  } catch (error) {
    showToast(`${error.message}. Jalankan backend dengan npm start.`);
  }
}

const calendarLabel = document.querySelector('#monthLabel');
const calendarGrid = document.querySelector('#calendar');
let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);

function updateTasksDateLabel(dateKey = getTodayKey()) {
  const label = document.querySelector('#tasksDateLabel');
  const [year, month, day] = dateKey.split('-').map(Number);
  if (label) label.textContent = new Date(year, month - 1, day, 12).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
updateTasksDateLabel();

function drawCalendar() {
  calendarLabel.textContent = displayedMonth.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

  const firstDay = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + 1,
    0,
  ).getDate();
  const weekdayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  calendarGrid.innerHTML = weekdayNames
    .map(day => `<div class="dow">${day}</div>`)
    .join('');

  for (let blank = 0; blank < firstDay; blank++) {
    calendarGrid.innerHTML += '<div></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = [
      displayedMonth.getFullYear(),
      String(displayedMonth.getMonth() + 1).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-');
    const hasTasks = tasks.some(task => task.dueDate === dateKey);
    const isSelected = dateKey === selectedDate;

    calendarGrid.innerHTML += `
      <button type="button" class="calendar-day ${isSelected ? 'selected' : ''} ${hasTasks ? 'dot' : ''}"
        data-date="${dateKey}" aria-label="Pilih tanggal ${day}">${day}</button>`;
  }

  calendarGrid.querySelectorAll('[data-date]').forEach(button => {
    button.addEventListener('click', () => selectCalendarDate(button.dataset.date));
  });
}

function selectCalendarDate(dateKey) {
  selectedDate = dateKey;
  dateFilterEnabled = true;

  const date = new Date(`${dateKey}T12:00:00`);
  const dateLabel = date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const taskCount = tasks.filter(task => task.dueDate === dateKey).length;

  document.querySelector('.subline').textContent = dateLabel;
  searchTerm = '';
  elements.search.value = '';
  statusFilter = 'all';
  elements.taskFilter.value = 'all';

  renderTasks();
  drawCalendar();
  showToast(`${taskCount} tugas pada ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}`);
}

document.querySelector('#prev').addEventListener('click', () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  drawCalendar();
});

document.querySelector('#next').addEventListener('click', () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  drawCalendar();
});

document.querySelector('#calendarToday').addEventListener('click', () => {
  selectedDate = getTodayKey();
  dateFilterEnabled = false;
  displayedMonth = new Date();
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);
  updateTasksDateLabel(selectedDate);
  renderTasks();
  drawCalendar();
});

setInterval(() => {
  const currentDate = getTodayKey();
  if (!dateFilterEnabled && selectedDate !== currentDate) {
    selectedDate = currentDate;
    displayedMonth = new Date();
    displayedMonth.setDate(1);
    updateTasksDateLabel(currentDate);
    drawCalendar();
  }
}, 60_000);

elements.search.addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLowerCase();
  if (searchTerm && document.body.dataset.page !== 'tasks') {
    window.location.hash = 'tasks';
  }
  renderTasks();
});

elements.taskFilter.addEventListener('change', event => {
  statusFilter = event.target.value;
  renderTasks();
});

document.addEventListener('keydown', event => {
  const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (event.key === '/' && !isTyping) {
    event.preventDefault();
    elements.search.focus();
  }
});

const pageTitles = {
  dashboard: 'Dashboard',
  tasks: 'My Tasks',
  calendar: 'Calendar',
  subjects: 'Subjects',
  materials: 'Materi Belajar',
  progress: 'Progress',
  reminders: 'Reminders',
  goals: 'Goals',
  achievements: 'Achievements',
  submissions: 'Pengumpulan Tugas',
  settings: 'Settings',
};

function showPage(pageId) {
  const page = document.getElementById(`page-${pageId}`);
  if (!page) return;

  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.remove('page-enter');
    view.classList.toggle('is-active', view === page);
  });
  void page.offsetWidth;
  page.classList.add('page-enter');
  document.querySelectorAll('.nav button[data-page]').forEach(button => {
    const isActive = button.dataset.page === pageId;
    button.classList.toggle('active', isActive);
    if (isActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  document.body.dataset.page = pageId;
  document.title = `${pageTitles[pageId]} — SMPIT At-Taqwa Surabaya`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav button[data-page]').forEach(button => {
  button.addEventListener('click', () => {
    const pageId = button.dataset.page;
    if (window.location.hash !== `#${pageId}`) {
      window.location.hash = pageId;
    } else {
      showPage(pageId);
    }
  });
});

window.addEventListener('hashchange', () => {
  const requestedPage = window.location.hash.slice(1) || 'dashboard';
  showPage(requestedPage);
});

showPage(window.location.hash.slice(1) || 'dashboard');

function openTaskDialog() {
  document.querySelector('[name="dueDate"]').value = selectedDate;
  elements.dialog.showModal();
}

document.querySelector('#addTaskButton').addEventListener('click', openTaskDialog);
document.querySelector('#closeTaskDialog').addEventListener('click', () => {
  elements.dialog.close();
});

elements.dialog.addEventListener('click', event => {
  if (event.target === elements.dialog) elements.dialog.close();
});

document.querySelector('#taskForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const taskData = Object.fromEntries(new FormData(form));
  submitButton.disabled = true;

  try {
    const createdTask = await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
    window.spittaqDailyCounters.created(createdTask);
    elements.dialog.close();
    form.reset();
    await loadDashboard();
    showToast('Tugas baru berhasil ditambahkan');
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll('.panelhead a').forEach(link => {
  link.addEventListener('click', () => {
    statusFilter = 'all';
    searchTerm = '';
    elements.taskFilter.value = 'all';
    elements.search.value = '';
    renderTasks();
    showToast('Daftar lengkap ditampilkan');
  });
});

function readPreference(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Preferences remain active until the page is closed if storage is disabled.
  }
}

const darkModeToggle = document.querySelector('#darkModeToggle');
const reminderToggle = document.querySelector('#reminderToggle');
darkModeToggle.checked = readPreference('spittaq-dark-mode', false);
reminderToggle.checked = readPreference('spittaq-reminders', true);
document.body.classList.toggle('theme-dark', darkModeToggle.checked);

darkModeToggle.addEventListener('change', () => {
  document.body.classList.toggle('theme-dark', darkModeToggle.checked);
  savePreference('spittaq-dark-mode', darkModeToggle.checked);
});

reminderToggle.addEventListener('change', () => {
  savePreference('spittaq-reminders', reminderToggle.checked);
  document.querySelector('.iconbtn').classList.toggle('muted', !reminderToggle.checked);
  showToast(reminderToggle.checked ? 'Pengingat diaktifkan' : 'Pengingat dinonaktifkan');
});

document.querySelector('.iconbtn').classList.toggle('muted', !reminderToggle.checked);

window.addEventListener('spittaq:daily-reset', () => loadDashboard());

drawCalendar();
loadDashboard();

(() => {
  let storageKey = 'spittaq-dashboard-24h-counters:anonymous';
  const PERIOD_MS = 24 * 60 * 60 * 1000;
  const todayKey = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const blankState = () => ({
    startedAt: Date.now(), created: 0, dueToday: 0, urgent: 0, completed: 0, overdue: 0,
    subjects: {}, tasks: {},
  });
  let state;

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Counters still work until this page closes. */ }
  }
  function reset() {
    state = blankState();
    save();
    window.dispatchEvent(new CustomEvent('spittaq:daily-reset'));
    scheduleReset();
  }
  function ensureFresh() {
    if (!state || !Number.isFinite(state.startedAt) || Date.now() - state.startedAt >= PERIOD_MS) reset();
  }
  function scheduleReset() {
    clearTimeout(scheduleReset.timer);
    const remaining = Math.max(0, state.startedAt + PERIOD_MS - Date.now());
    scheduleReset.timer = setTimeout(reset, remaining);
  }
  function subjectBucket(name) {
    state.subjects[name] ||= { created: 0, completed: 0 };
    return state.subjects[name];
  }
  function summary() {
    ensureFresh();
    return {
      totalTasks: state.created,
      tasksToday: state.dueToday,
      urgentTasks: state.urgent,
      completedTasks: state.completed,
      remainingTasks: Math.max(0, state.created - state.completed),
      overdueTasks: state.overdue,
      progress: state.created ? Math.round((state.completed / state.created) * 100) : 0,
    };
  }
  function created(task) {
    ensureFresh();
    const id = String(task.id);
    if (state.tasks[id]?.counted) return;
    const dueToday = task.dueDate === todayKey();
    const urgent = task.priority === 'High';
    const overdue = Boolean(task.dueDate && task.dueDate < todayKey());
    state.created += 1;
    if (dueToday) state.dueToday += 1;
    if (urgent) state.urgent += 1;
    if (overdue) state.overdue += 1;
    subjectBucket(task.subject).created += 1;
    state.tasks[id] = { subject: task.subject, dueToday, urgent, overdue, counted: true, completed: false };
    save();
  }
  function completed(task, isCompleted) {
    ensureFresh();
    const id = String(task.id);
    let record = state.tasks[id];
    if (!record) {
      created(task);
      record = state.tasks[id];
    }
    if (record.completed === isCompleted) return;
    record.completed = isCompleted;
    state.completed = Math.max(0, state.completed + (isCompleted ? 1 : -1));
    const bucket = subjectBucket(task.subject);
    bucket.completed = Math.max(0, bucket.completed + (isCompleted ? 1 : -1));
    if (isCompleted && record.overdue) state.overdue = Math.max(0, state.overdue - 1);
    if (!isCompleted && record.overdue) state.overdue += 1;
    save();
  }
  function deleted(task) {
    ensureFresh();
    const id = String(task.id);
    const record = state.tasks[id];
    if (!record) return;
    if (record.counted) {
      state.created = Math.max(0, state.created - 1);
      if (record.dueToday) state.dueToday = Math.max(0, state.dueToday - 1);
      if (record.urgent) state.urgent = Math.max(0, state.urgent - 1);
      if (record.overdue && !record.completed) state.overdue = Math.max(0, state.overdue - 1);
      subjectBucket(record.subject).created = Math.max(0, subjectBucket(record.subject).created - 1);
    }
    if (record.completed) {
      state.completed = Math.max(0, state.completed - 1);
      subjectBucket(record.subject).completed = Math.max(0, subjectBucket(record.subject).completed - 1);
    }
    delete state.tasks[id];
    save();
  }
  function applySubjects(subjects) {
    ensureFresh();
    return subjects.map(subject => {
      const bucket = state.subjects[subject.name] || { created: 0, completed: 0 };
      return { ...subject, progress: bucket.created ? Math.round((bucket.completed / bucket.created) * 100) : 0 };
    });
  }

  try { state = JSON.parse(localStorage.getItem(storageKey)); } catch { state = null; }
  if (!state || !Number.isFinite(state.startedAt) || Date.now() - state.startedAt >= PERIOD_MS) state = blankState();
  save();
  scheduleReset();

  function setUser(userId) {
    storageKey = `spittaq-dashboard-24h-counters:${String(userId || 'anonymous')}`;
    try { state = JSON.parse(localStorage.getItem(storageKey)); } catch { state = null; }
    if (!state || !Number.isFinite(state.startedAt) || Date.now() - state.startedAt >= PERIOD_MS) state = blankState();
    save();
    scheduleReset();
    window.dispatchEvent(new CustomEvent('spittaq:daily-reset'));
  }

  window.spittaqDailyCounters = { summary, created, completed, deleted, applySubjects, setUser };
})();

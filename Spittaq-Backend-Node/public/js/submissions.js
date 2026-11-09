(() => {
  const form = document.querySelector('#submissionForm');
  const list = document.querySelector('#submissionList');
  const message = document.querySelector('#submissionMessage');
  if (!form || !list) return;

  const studentNameField = form.elements.studentName;
  const teacherSelect = form.elements.teacherUserId;
  const profileName = document.querySelector('#profileName');
  if (studentNameField && profileName) studentNameField.value = profileName.textContent.trim();

  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
    return result;
  }

  async function loadTeachers() {
    try {
      const teachers = await request('/api/teachers');
      teacherSelect.innerHTML = '<option value="">Pilih guru tujuan</option>' + teachers
        .map(teacher => `<option value="${escapeText(teacher.id)}">${escapeText(teacher.name)}</option>`).join('');
      if (!teachers.length) teacherSelect.innerHTML = '<option value="">Belum ada akun guru</option>';
    } catch (error) {
      teacherSelect.innerHTML = '<option value="">Daftar guru gagal dimuat</option>';
      message.textContent = error.message;
    }
  }

  function render(records) {
    if (!records.length) {
      list.innerHTML = '<p class="empty-state">Belum ada tugas yang dikumpulkan.</p>';
      return;
    }
    list.innerHTML = records.map(item => `
      <article class="submission-row">
        <div><strong>${escapeText(item.title)}</strong><small>${escapeText(item.subject)} · ${escapeText(item.fileName)} · ${escapeText(new Date(item.submittedAt).toLocaleString('id-ID'))}</small>
        <small>Guru tujuan: ${escapeText(item.teacherName || 'Guru belum ditentukan')}</small>
        ${item.note ? `<small>Catatan: ${escapeText(item.note)}</small>` : ''}</div>
        <span class="submission-status ${item.status === 'Dinilai' ? 'reviewed' : 'pending'}">${item.status === 'Dinilai' ? '✓ Sudah dinilai' : '✕ Belum dinilai'}${item.status === 'Dinilai' && Number.isFinite(Number(item.score)) ? `<small>Nilai: ${escapeText(item.score)} / 100</small>` : ''}${item.feedback ? `<small>${escapeText(item.feedback)}</small>` : ''}</span>
        <a class="submission-download" href="${escapeText(item.downloadUrl)}" target="_blank" rel="noopener">Unduh berkas</a>
      </article>`).join('');
  }

  async function load() {
    try { render(await request('/api/submissions')); }
    catch (error) { list.innerHTML = `<p class="empty-state">${escapeText(error.message)} Jalankan server dengan npm start.</p>`; }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const file = data.get('file');
    if (!file || !file.size) { message.textContent = 'Pilih berkas tugas terlebih dahulu.'; return; }
    if (file.size > 50 * 1024 * 1024) { message.textContent = 'Ukuran berkas maksimal 50 MB.'; return; }

    submit.disabled = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      await request('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          studentName: data.get('studentName'), teacherUserId: data.get('teacherUserId'), title: data.get('title'), subject: data.get('subject'), note: data.get('note'),
          fileName: file.name, fileType: file.type, fileData: btoa(binary),
        }),
      });
      form.reset();
      message.textContent = 'Tugas berhasil dikumpulkan.';
      await load();
    } catch (error) {
      message.textContent = error.message;
    } finally { submit.disabled = false; }
  });

  window.loadSubmissions = load;
  loadTeachers();
  load();
})();

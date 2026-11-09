(() => {
  const form = document.querySelector('#materialForm');
  const list = document.querySelector('#teacherMaterials');
  const message = document.querySelector('#materialMessage');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  const date = value => new Date(value).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
  const subjects = { 'Pendidikan Agama Islam':['☪','religion'], PPKn:['⚑','civics'], 'Bahasa Indonesia':['📖','indonesia'], Informatika:['💻','informatics'], 'Seni Budaya':['🎨','arts'], 'Bahasa Jawa':['🪷','jawa'], Matematika:['∑','math'], IPA:['⚗','science'], 'Bahasa Inggris':['🇬🇧','english'], IPS:['🌍','social'], PJOK:['⚽','sport'] };

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers:{ ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
    return result;
  }

  function render(items) {
    if (!items.length) { list.innerHTML = '<p class="empty">Belum ada materi. Unggah materi pertama menggunakan formulir di atas.</p>'; return; }
    list.innerHTML = items.map(item => {
      const [icon,color]=subjects[item.subject]||['▤','default'];
      const extension=String(item.fileName||'').split('.').pop().toLowerCase();
      const previewUrl=item.downloadUrl.replace('/api/materials/file/', '/api/teacher/materials/file/');
      const thumbnail=['jpg','jpeg','png'].includes(extension)
        ? `<img class="file-thumbnail-image" src="${escape(previewUrl)}" alt="Pratinjau ${escape(item.title)}">`
        : extension==='pdf'
          ? `<iframe class="file-thumbnail-pdf" src="${escape(previewUrl)}#toolbar=0&navpanes=0&scrollbar=0" title="Pratinjau kecil ${escape(item.title)}" tabindex="-1"></iframe><span class="file-thumbnail-type">PDF</span>`
          : `<span class="file-thumbnail-type">${escape(extension.toUpperCase())}</span><small class="file-thumbnail-snippet" data-snippet-id="${escape(item.id)}">${escape(item.note||'Memuat cuplikan...')}</small>`;
      return `<article class="teacher-material-row material-file-row subject-${color}"><button type="button" class="material-file-thumbnail" data-preview-id="${escape(item.id)}" aria-label="Buka pratinjau ${escape(item.title)}">${thumbnail}</button><div class="teacher-material-info material-file-info"><div class="material-meta-tags"><span class="grade-tag">Kelas ${escape(item.grade)}</span><span class="semester-tag">Semester ${Number(item.semester)||1}</span><span class="subject-badge subject-${color}">${icon} ${escape(item.subject)}</span></div><strong>${escape(item.title)}</strong><span>${escape(item.fileName)}</span><small>Diunggah ${escape(date(item.uploadedAt))} oleh ${escape(item.teacherName||'Guru')}</small>${item.note?`<p>${escape(item.note)}</p>`:''}<div class="study-material-actions"><button type="button" class="study-material-preview" data-preview-id="${escape(item.id)}">Buka pratinjau</button><a class="file-link" href="${escape(previewUrl)}" download>Unduh</a></div></div><button type="button" class="delete-material" data-id="${escape(item.id)}" ${item.canDelete?'':'disabled title="Hanya pengunggah yang dapat menghapus materi"'}>Hapus</button></article>`;
    }).join('');
    list.querySelectorAll('[data-preview-id]').forEach(button => button.addEventListener('click', () => {
      const item = items.find(record => record.id === button.dataset.previewId);
      if (item) window.openMaterialPreview({ title:item.title, fileName:item.fileName, url:item.downloadUrl.replace('/api/materials/file/', '/api/teacher/materials/file/') });
    }));
    list.querySelectorAll('[data-snippet-id]').forEach(async element => {
      const item = items.find(record => record.id === element.dataset.snippetId);
      if (!item || !window.loadMaterialSnippet) return;
      try { element.textContent = await window.loadMaterialSnippet(item.downloadUrl.replace('/api/materials/file/', '/api/teacher/materials/file/'), item.fileName) || item.note || 'Pratinjau dokumen'; }
      catch { element.textContent = item.note || 'Klik untuk membuka pratinjau'; }
    });
    list.querySelectorAll('.delete-material:not(:disabled)').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm('Hapus materi ini?')) return;
      button.disabled = true;
      try { await api(`/api/teacher/materials/${encodeURIComponent(button.dataset.id)}`, { method:'DELETE' }); await load(); }
      catch (error) { window.alert(error.message); button.disabled = false; }
    }));
  }

  async function load() {
    list.classList.add('busy');
    try {
      const records = await api('/api/teacher/materials');
      const me = await api('/api/auth/me');
      render(records.map(item => ({ ...item, canDelete:item.teacherUserId === me.user?.id })));
    } catch (error) {
      if (error.message.includes('masuk') || error.message.includes('akses')) { window.location.href = '/guru/'; return; }
      list.innerHTML = `<p class="empty">${escape(error.message)}</p>`;
    } finally { list.classList.remove('busy'); }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const file = form.elements.file.files[0];
    if (!file) { message.textContent = 'Pilih berkas materi terlebih dahulu.'; return; }
    if (file.size > 50 * 1024 * 1024) { message.textContent = 'Ukuran berkas maksimal 50 MB.'; return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    message.textContent = 'Sedang mengunggah materi...';
    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Berkas tidak dapat dibaca.'));
        reader.readAsDataURL(file);
      });
      await api('/api/teacher/materials', { method:'POST', body:JSON.stringify({ title:form.elements.title.value, subject:form.elements.subject.value, grade:form.elements.grade.value, semester:form.elements.semester.value, note:form.elements.note.value, fileName:file.name, fileData }) });
      form.reset();
      message.textContent = 'Materi berhasil diunggah.';
      await load();
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; }
  });

  document.querySelector('#reloadMaterials').addEventListener('click', load);
  document.querySelector('#logoutButton').addEventListener('click', async () => { await api('/api/auth/logout', { method:'POST' }).catch(() => {}); window.location.href = '/guru/'; });
  api('/api/auth/me').then(result => { document.querySelector('#teacherName').textContent = result.user?.name || ''; }).catch(() => {});
  load();
})();

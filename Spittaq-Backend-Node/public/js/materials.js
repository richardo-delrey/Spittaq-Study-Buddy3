(() => {
  const subjectGrid = document.querySelector('#materialsSubjectGrid');
  if (!subjectGrid) return;
  const list = document.querySelector('#studentMaterials');
  const subjectPage = document.querySelector('#materialsSubjectPage');
  const detailPage = document.querySelector('#studentSubjectMaterialsPage');
  const semesterTabs = document.querySelector('#materialsSemesterTabs');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  const formatDate = value => new Date(value).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
  const subjects = {
    'Pendidikan Agama Islam':['☪','religion'], PPKn:['⚑','civics'], 'Bahasa Indonesia':['📖','indonesia'],
    Informatika:['💻','informatics'], 'Seni Budaya':['🎨','arts'], 'Bahasa Jawa':['🪷','jawa'],
    Matematika:['∑','math'], IPA:['⚗','science'], 'Bahasa Inggris':['🇬🇧','english'], IPS:['🌍','social'], PJOK:['⚽','sport'],
  };
  let materials = [];
  let selectedSubject = '';
  let selectedSemester = 1;

  function renderSemesterMaterials() {
    const records = materials.filter(item => item.subject === selectedSubject && Number(item.semester || 1) === selectedSemester);
    if (!records.length) {
      list.innerHTML = `<p class="materials-empty">Belum ada berkas untuk ${escape(selectedSubject)} pada Semester ${selectedSemester}.</p>`;
      return;
    }
    list.innerHTML = records.map(item => {
      const extension = String(item.fileName || '').split('.').pop().toLowerCase();
      const preview = ['jpg','jpeg','png'].includes(extension)
        ? `<img class="file-thumbnail-image" src="${escape(item.downloadUrl)}" alt="Pratinjau ${escape(item.title)}">`
        : extension === 'pdf'
          ? `<iframe class="file-thumbnail-pdf" src="${escape(item.downloadUrl)}#toolbar=0&navpanes=0&scrollbar=0" title="Pratinjau kecil ${escape(item.title)}" tabindex="-1"></iframe><span class="file-thumbnail-type">PDF</span>`
          : `<span class="file-thumbnail-type">${escape(extension.toUpperCase())}</span><small class="file-thumbnail-snippet" data-snippet-id="${escape(item.id)}">${escape(item.note || 'Memuat cuplikan...')}</small>`;
      return `<article class="material-file-row"><button type="button" class="material-file-thumbnail" data-preview-id="${escape(item.id)}" aria-label="Buka pratinjau ${escape(item.title)}">${preview}</button><div class="material-file-info"><strong>${escape(item.title)}</strong><span>${escape(item.fileName)} · ${escape(item.subject)}</span><small>${escape(item.teacherName || 'Guru')} · ${escape(new Date(item.uploadedAt).toLocaleDateString('id-ID'))}</small>${item.note ? `<p>${escape(item.note)}</p>` : ''}<div class="study-material-actions"><button type="button" class="study-material-preview" data-preview-id="${escape(item.id)}">Buka pratinjau</button><a class="study-material-download" href="${escape(item.downloadUrl)}" download>Unduh</a></div></div></article>`;
    }).join('');
    list.querySelectorAll('[data-preview-id]').forEach(button => button.addEventListener('click', () => {
      const item = records.find(record => record.id === button.dataset.previewId);
      if (item) window.openMaterialPreview({ title:item.title, fileName:item.fileName, url:item.downloadUrl });
    }));
    list.querySelectorAll('[data-snippet-id]').forEach(async element => {
      const item = records.find(record => record.id === element.dataset.snippetId);
      if (!item || !window.loadMaterialSnippet) return;
      try { element.textContent = await window.loadMaterialSnippet(item.downloadUrl, item.fileName) || item.note || 'Pratinjau dokumen'; }
      catch { element.textContent = item.note || 'Klik untuk membuka pratinjau'; }
    });
  }

  function openSubject(subject) {
    const [icon, color] = subjects[subject] || ['▤','default'];
    const records = materials.filter(item => item.subject === subject);
    selectedSubject = subject;
    selectedSemester = 1;
    document.querySelector('#selectedMaterialSubject').innerHTML = `<span class="subject-badge subject-${color}">${icon} ${escape(subject)}</span>`;
    subjectPage.hidden = true;
    detailPage.hidden = false;
    semesterTabs.innerHTML = [1,2].map(semester => `<button type="button" role="tab" aria-selected="${semester === selectedSemester}" class="semester-tab ${semester === selectedSemester ? 'active' : ''}" data-semester="${semester}">Semester ${semester}</button>`).join('');
    semesterTabs.querySelectorAll('[data-semester]').forEach(button => button.addEventListener('click', () => {
      selectedSemester = Number(button.dataset.semester);
      semesterTabs.querySelectorAll('[role="tab"]').forEach(tab => { const active = Number(tab.dataset.semester) === selectedSemester; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
      renderSemesterMaterials();
    }));
    renderSemesterMaterials();
    document.querySelector('#backToMaterialsSubjects').focus();
  }

  function renderSubjects() {
    const names = Object.keys(subjects);
    subjectGrid.innerHTML = names.map(name => {
      const [icon, color] = subjects[name];
      return `<button class="materials-subject-box subject-${color}" type="button" data-subject="${escape(name)}"><span class="materials-subject-icon">${icon}</span><strong>${escape(name)}</strong><span class="materials-subject-arrow">›</span></button>`;
    }).join('');
    subjectGrid.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => openSubject(button.dataset.subject)));
  }

  async function load() {
    subjectGrid.innerHTML = '<p class="materials-empty">Memuat mata pelajaran...</p>';
    try {
      const response = await fetch('/api/materials');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Materi gagal dimuat.');
      if (!result.grade) {
        subjectGrid.innerHTML = '<p class="materials-empty">Lengkapi kelas pada menu Pengaturan dengan kelas 7, 8, atau 9 agar materi yang sesuai bisa ditampilkan.</p>';
        return;
      }
      materials = result.materials;
      renderSubjects();
    } catch (error) {
      subjectGrid.innerHTML = `<p class="materials-empty">${escape(error.message)} Pastikan server berjalan.</p>`;
    }
  }
  document.querySelector('#refreshMaterials')?.addEventListener('click', load);
  document.querySelector('#backToMaterialsSubjects')?.addEventListener('click', () => { detailPage.hidden = true; subjectPage.hidden = false; });
  document.querySelector('.nav button[data-page="materials"]')?.addEventListener('click', load);
  load();
})();

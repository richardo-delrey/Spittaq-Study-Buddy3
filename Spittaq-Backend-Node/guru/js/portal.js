(() => {
  const list = document.querySelector('#submissionList');
  const search = document.querySelector('#searchInput');
  const filter = document.querySelector('#statusFilter');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  let records = [];

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
    return result;
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const status = filter.value;
    const visible = records.filter(item => {
      const currentStatus = item.status === 'Dinilai' ? 'Dinilai' : 'Belum dinilai';
      const matchesStatus = status === 'all' || currentStatus === status;
      const text = `${item.studentName || 'Siswa'} ${item.title} ${item.subject} ${item.fileName}`.toLowerCase();
      return matchesStatus && text.includes(query);
    });
    document.querySelector('#totalCount').textContent = records.length;
    document.querySelector('#pendingCount').textContent = records.filter(item => item.status !== 'Dinilai').length;
    document.querySelector('#reviewedCount').textContent = records.filter(item => item.status === 'Dinilai').length;
    if (!visible.length) { list.innerHTML = '<p class="empty">Tidak ada tugas yang cocok. Pengumpulan baru dari siswa akan muncul di sini.</p>'; return; }
    list.innerHTML = visible.map(item => {
      const isReviewed = item.status === 'Dinilai';
      const statusLabel = isReviewed ? '✓ Sudah dinilai' : '✕ Belum dinilai';
      const score = Math.min(100, Math.max(50, Number(item.score) || 50));
      return `
      <article class="submission-card" data-id="${escape(item.id)}">
        <div class="submission-info">
          <div class="submission-head"><div><h3>${escape(item.title)}</h3><p class="meta"><strong>${escape(item.studentName || 'Siswa')}</strong> · ${escape(item.subject)} · ${escape(new Date(item.submittedAt).toLocaleString('id-ID'))}</p></div><span class="status" data-status="${isReviewed ? 'Dinilai' : 'Belum dinilai'}">${statusLabel}</span></div>
          ${item.note ? `<p class="note">Catatan siswa: ${escape(item.note)}</p>` : ''}
          <a class="file-link" href="${escape(item.downloadUrl.replace('/api/submissions/file/', '/api/teacher/submissions/file/'))}" target="_blank" rel="noopener">⬇ Unduh ${escape(item.fileName)}</a>
          ${isReviewed && Number.isFinite(Number(item.score)) ? `<p class="score-result">Nilai: <strong>${escape(item.score)}</strong> / 100</p>` : ''}
          ${item.feedback ? `<p class="feedback-view"><strong>Umpan balik terakhir:</strong> ${escape(item.feedback)}</p>` : ''}
        </div>
        <form class="review-form" data-id="${escape(item.id)}">
          <div class="score-field"><label>Nilai (50–100)</label><div class="score-value-box"><output data-score-output>${score}</output><span>/ 100</span></div><input type="range" name="score" min="50" max="100" step="1" value="${score}" aria-label="Nilai dari 50 sampai 100"><div class="range-labels"><span>50</span><span>100</span></div></div>
          <label>Status penilaian<select name="status"><option value="Belum dinilai" ${!isReviewed?'selected':''}>✕ Belum dinilai</option><option value="Dinilai" ${isReviewed?'selected':''}>✓ Sudah dinilai</option></select></label>
          <label>Catatan untuk siswa</label><textarea name="feedback" maxlength="1000" placeholder="Tulis umpan balik...">${escape(item.feedback || '')}</textarea><button class="action-button" type="submit">Simpan penilaian</button>
        </form>
      </article>`;
    }).join('');
    list.querySelectorAll('.review-form').forEach(form => {
      form.elements.score.addEventListener('input', () => { form.querySelector('[data-score-output]').value = form.elements.score.value; });
      form.addEventListener('submit', saveReview);
    });
  }

  async function load() {
    list.classList.add('busy');
    try { records = await api('/api/teacher/submissions'); render(); }
    catch (error) {
      if (error.message.includes('masuk') || error.message.includes('akses')) { window.location.href = '/guru/'; return; }
      list.innerHTML = `<p class="empty">${escape(error.message)} Pastikan server website berjalan dengan npm start.</p>`;
    }
    finally { list.classList.remove('busy'); }
  }

  async function saveReview(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await api(`/api/teacher/submissions/${encodeURIComponent(form.dataset.id)}`, { method:'PATCH', body:JSON.stringify({ status:form.elements.status.value, score:Number(form.elements.score.value), feedback:form.elements.feedback.value }) });
      await load();
    } catch (error) { window.alert(error.message); }
    finally { button.disabled = false; }
  }

  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  document.querySelector('#refreshButton').addEventListener('click', load);
  document.querySelector('#logoutButton').addEventListener('click', async () => {
    await api('/api/auth/logout', { method:'POST' }).catch(() => {});
    window.location.href = '/guru/';
  });
  api('/api/auth/me').then(result => { document.querySelector('#teacherName').textContent = result.user?.name || ''; }).catch(() => {});
  load();
  window.setInterval(load, 20000);
})();

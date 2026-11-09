(() => {
  const profileForm = document.querySelector('#profileForm');
  const logoutButton = document.querySelector('#logoutButton');
  const nameField = profileForm?.elements.name;
  const classField = profileForm?.elements.className;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan akun gagal.');
    return result;
  }

  function display(user) {
    document.querySelector('#profileName').textContent = user.name;
    document.querySelector('#welcomeName').textContent = user.name;
    document.querySelector('#profileClass').textContent = user.className || 'Siswa';
    if (nameField) nameField.value = user.name;
    if (classField) classField.value = user.className || '';
    try {
      localStorage.setItem('spittaq-profile-name', user.name);
      localStorage.setItem('spittaq-profile-class', user.className || 'Siswa');
      localStorage.setItem('spittaq-current-user-id', user.id);
    } catch { /* Account data remains available from the session. */ }
    window.spittaqDailyCounters?.setUser(user.id);
    window.dispatchEvent(new CustomEvent('spittaq:account-changed', { detail: { userId: user.id } }));
    const submissionName = document.querySelector('#submissionForm [name="studentName"]');
    if (submissionName) submissionName.value = user.name;
  }

  api('/api/auth/me').then(({ user }) => {
    if (!user || user.role !== 'student') { window.location.replace('/login.html'); return; }
    display(user);
  }).catch(() => window.location.replace('/login.html'));

  profileForm?.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const { user } = await api('/api/auth/profile', { method:'PATCH', body:JSON.stringify({ name:nameField.value, className:classField.value }) });
      display(user);
      document.querySelector('#profileMenu').hidden = true;
      const toast = document.querySelector('#toast');
      if (toast) { toast.textContent = 'Profil akun berhasil diperbarui'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }
    } catch (error) { window.alert(error.message); }
  }, true);

  logoutButton?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method:'POST' }).catch(() => {});
    window.location.replace('/login.html');
  });
})();

(() => {
  const role = document.body.dataset.role;
  const form = document.querySelector('#authForm');
  const nameField = document.querySelector('#nameField');
  const classField = document.querySelector('#classField');
  const title = document.querySelector('#formTitle');
  const button = document.querySelector('#submitButton');
  const switchMode = document.querySelector('#switchMode');
  const switchText = document.querySelector('#switchText');
  const message = document.querySelector('#message');
  const student = role === 'student';
  let registering = false;
  const destination = student ? '/' : '/guru/portal.html';

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type':'application/json', ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan gagal.');
    return result;
  }

  function renderMode() {
    nameField.hidden = !registering;
    nameField.querySelector('input').required = registering;
    classField.hidden = !registering || !student;
    classField.querySelector('input').required = registering && student;
    title.textContent = registering ? `Buat akun ${student ? 'siswa' : 'guru'}` : `Masuk ke ${student ? 'Study Buddy' : 'Portal Guru'}`;
    button.textContent = registering ? 'Buat akun' : 'Masuk';
    switchText.textContent = registering ? 'Sudah punya akun?' : 'Belum punya akun?';
    switchMode.textContent = registering ? 'Masuk' : `Daftar akun ${student ? 'siswa' : 'guru'}`;
    form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  }

  switchMode.addEventListener('click', () => { registering = !registering; message.textContent = ''; renderMode(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    button.disabled = true;
    const body = Object.fromEntries(new FormData(form));
    body.role = role;
    try {
      await request(registering ? '/api/auth/register' : '/api/auth/login', { method:'POST', body:JSON.stringify(body) });
      window.location.replace(destination);
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });

  request('/api/auth/me').then(({ user }) => {
    if (user?.role === role) window.location.replace(destination);
  }).catch(() => {});
  renderMode();
})();

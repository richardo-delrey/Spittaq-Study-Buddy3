(() => {
  const notificationButton = document.querySelector('#notificationButton');
  const notificationMenu = document.querySelector('#notificationMenu');
  const profileButton = document.querySelector('#profileButton');
  const profileMenu = document.querySelector('#profileMenu');
  const badge = notificationButton?.querySelector('.badge');
  const notificationItems = document.querySelector('#notificationItems');
  const markRead = document.querySelector('#markNotificationsRead');
  const profileForm = document.querySelector('#profileForm');
  if (!notificationButton || !profileButton) return;

  const getStored = (key, fallback) => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const saveStored = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* Keep the current tab interactive if storage is unavailable. */ }
  };
  const showMenu = (button, menu, visible) => {
    menu.hidden = !visible;
    button.setAttribute('aria-expanded', String(visible));
  };
  const closeMenus = () => {
    showMenu(notificationButton, notificationMenu, false);
    showMenu(profileButton, profileMenu, false);
  };

  const profileName = document.querySelector('#profileName');
  const profileClass = document.querySelector('#profileClass');
  const welcomeName = document.querySelector('#welcomeName');
  const savedName = getStored('spittaq-profile-name', 'Allan');
  const savedClass = getStored('spittaq-profile-class', 'Kelas 9A');
  profileName.textContent = savedName;
  profileClass.textContent = savedClass;
  if (welcomeName) welcomeName.textContent = savedName;
  profileForm.elements.name.value = savedName;
  profileForm.elements.className.value = savedClass;

  const isRead = getStored('spittaq-notifications-read', 'false') === 'true';
  if (isRead) {
    badge.textContent = '0';
    badge.hidden = true;
    notificationItems.innerHTML = '<p>Semua notifikasi sudah dibaca.</p>';
  }

  notificationButton.addEventListener('click', () => {
    const opening = notificationMenu.hidden;
    closeMenus();
    showMenu(notificationButton, notificationMenu, opening);
  });
  profileButton.addEventListener('click', () => {
    const opening = profileMenu.hidden;
    closeMenus();
    showMenu(profileButton, profileMenu, opening);
  });
  markRead.addEventListener('click', () => {
    saveStored('spittaq-notifications-read', 'true');
    badge.textContent = '0';
    badge.hidden = true;
    notificationItems.innerHTML = '<p>Semua notifikasi sudah dibaca.</p>';
    markRead.textContent = 'Selesai';
  });
  document.querySelector('#openReminders').addEventListener('click', () => {
    closeMenus();
    const remindersButton = [...document.querySelectorAll('.nav button')]
      .find(button => /reminder/i.test(button.textContent));
    remindersButton?.click();
  });
  profileForm.addEventListener('submit', event => {
    event.preventDefault();
    const name = profileForm.elements.name.value.trim() || 'Allan';
    const className = profileForm.elements.className.value.trim() || 'Kelas 9A';
    saveStored('spittaq-profile-name', name);
    saveStored('spittaq-profile-class', className);
    profileName.textContent = name;
    profileClass.textContent = className;
    if (welcomeName) welcomeName.textContent = name;
    closeMenus();
    document.querySelector('#toast')?.classList.add('show');
    const toast = document.querySelector('#toast');
    if (toast) {
      toast.textContent = 'Profil berhasil diperbarui';
      clearTimeout(window.profileToastTimer);
      window.profileToastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.topright')) closeMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
  });
})();

# Backend Node.js Spittaq Study Buddy

Paket ini berisi server Node.js, website siswa, portal guru, dan salinan data saat paket dibuat. Kedua portal berjalan dari server yang sama dan memakai data di folder `data/`.

Paket bersih ini tidak berisi akun, tugas, pengumpulan, materi, atau berkas unggahan lama. Akun siswa dan guru perlu dibuat kembali setelah deploy; daftar 11 mata pelajaran tetap tersedia.

## Menjalankan di Windows

1. Ekstrak ZIP.
2. Pasang Node.js 18 atau lebih baru.
3. Buka terminal pada folder `Spittaq-Backend-Node`.
4. Jalankan `npm start`, atau klik dua kali `start-server.bat`.
5. Buka `http://localhost:3000` untuk siswa dan `http://localhost:3000/guru/` untuk guru.

## Deploy ke layanan yang mendukung Node.js

Gunakan folder ini sebagai root proyek. Build command dapat dikosongkan; start command: `npm start` (atau `node server.js`). Atur variabel `PORT` sesuai layanan hosting jika diperlukan.

Data akun, tugas, dan riwayat berada di `data/`. Jika layanan hosting menggunakan filesystem sementara, pasang persistent disk/volume untuk folder `data`; tanpa penyimpanan persisten, data dapat hilang ketika layanan dimulai ulang atau deploy ulang.

Berkas unggahan menerima batas hingga 50 MB pada backend ini. Hosting serverless seperti Netlify Drop tidak menjalankan server Node.js ini sebagai proses biasa; deploy paket ini ke layanan hosting Node.js, atau migrasikan API ke Functions dan penyimpanan persisten.

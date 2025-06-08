# Trello-Google Calendar Integration API

Aplikasi berbasis Node.js yang dirancang untuk menghubungkan papan Trello dengan Google Calendar secara mulus, memungkinkan pengguna untuk menyinkronkan kartu Trello dengan acara Google Calendar. API ini menjembatani manajemen proyek di Trello dengan penjadwalan di Google Calendar, mendukung pengelolaan tugas yang efisien melalui autentikasi aman dan sinkronisasi data.

## Tujuan

Tujuan utama proyek ini adalah meningkatkan produktivitas dengan mengintegrasikan dua alat canggih:
- **Trello**: Alat manajemen proyek visual untuk mengatur tugas dan alur kerja.
- **Google Calendar**: Alat penjadwalan untuk mengelola acara dan tenggat waktu.

Dengan menyinkronkan kartu Trello (tugas) dengan acara Google Calendar, pengguna dapat memvisualisasikan tugas di kalender, memastikan manajemen waktu dan pelacakan tenggat waktu yang lebih baik. API ini ideal untuk pengembang, tim, atau individu yang ingin mengotomatiskan alur kerja dan menyederhanakan penjadwalan tugas.

## Fitur

- **Autentikasi**: Autentikasi OAuth2 yang aman untuk layanan Trello dan Google  Calendar.
- **Manajemen Trello**: Membuat, mengambil, memperbarui, dan mengarsipkan papan, daftar, dan kartu Trello.
- **Integrasi Google Calendar**: Membuat, mengambil, memperbarui, dan menghapus acara Google Calendar.
- **Sinkronisasi**: Menyinkronkan kartu Trello (dengan atau tanpa tenggat waktu) ke Google Calendar sebagai acara.
- **Dokumentasi API**: Katalog API yang komprehensif dengan antarmuka dokumentasi yang ramah pengguna.

## Prasyarat

Sebelum menyiapkan dan menggunakan API, pastikan Anda memiliki:
- **Node.js** (versi 16 atau lebih tinggi)
- **Kunci API Trello**: Dapatkan dari [Trello Developer Portal](https://trello.com/app-key).
- **Kredensial Google API**: Buat proyek di [Google Cloud Console](https://console.cloud.google.com/) dan aktifkan Google Calendar API.
- **Variabel Lingkungan**: Konfigurasikan file `.env` di direktori utama proyek dengan isi berikut:

```env
SESSION_SECRET=rahasia-sesi-anda
TRELLO_API_KEY=kunci-api-trello-anda
GOOGLE_CLIENT_ID=id-klien-google-anda
GOOGLE_CLIENT_SECRET=rahasia-klien-google-anda
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
JWT_SECRET=rahasia-jwt-anda
```

## Instalasi

1. **Kloning Repositori**:
   ```bash
   git clone https://github.com/Djatiaja/Intero.git
   cd trello-google-calendar-integration
   ```

2. **Instal Dependensi**:
   ```bash
   npm install
   ```

3. **Siapkan Variabel Lingkungan**:
   Buat file `.env` di direktori utama proyek dan tambahkan variabel lingkungan seperti di atas.

4. **Jalankan Aplikasi**:
   ```bash
   npm run dev
   ```
   Server akan berjalan di `http://localhost:3000`.

## Penggunaan

### Langkah 1: Autentikasi

Untuk menggunakan API, lakukan autentikasi dengan layanan Trello dan Google untuk mendapatkan token JWT.

1. **Memulai Autentikasi Google**:
   - Kunjungi `http://localhost:3000/auth/google`.
   - Anda akan diarahkan ke layar persetujuan OAuth Google. Berikan izin yang diperlukan.
   - Setelah autentikasi berhasil, Anda akan diarahkan ke autentikasi Trello.

2. **Memulai Autentikasi Trello**:
   - Pada halaman otorisasi Trello, berikan akses ke akun Trello Anda.
   - Setelah selesai, Anda akan diarahkan ke `/auth-success`, di mana token JWT akan ditampilkan.

3. **Simpan Token JWT**:
   - Salin token JWT dari halaman `/auth-success`. Token ini diperlukan untuk permintaan API yang diautentikasi.
   - Sertakan token dalam header `Authorization` untuk permintaan:
     ```
     Authorization: Bearer <token-jwt-anda>
     ```

### Langkah 2: Menggunakan API

Gunakan alat seperti Postman, cURL, atau klien HTTP lainnya untuk berinteraksi dengan API. URL dasar adalah:
```
http://localhost:3000/api
```

- **Lihat Dokumentasi API**:
  Akses dokumentasi API interaktif di `http://localhost:3000/api/docs` untuk daftar lengkap endpoint dan petunjuk penggunaan.

- **Periksa Status Autentikasi**:
  ```bash
  curl http://localhost:3000/api/auth/status
  ```
  Ini mengembalikan status autentikasi saat ini untuk Google dan Trello.

## Endpoint Utama

### 1. Alur Autentikasi

- **GET /auth/google**
  - **Deskripsi**: Memulai autentikasi OAuth Google.
  - **Parameter**:
    - `userId` (query, opsional): Mengaitkan ID pengguna dengan sesi.
  - **Respons**:
    - `302`: Mengarahkan ke URL otorisasi Google.
    - `500`: Gagal menghasilkan URL otorisasi Google.
  - **Contoh**:
    ```bash
    curl http://localhost:3000/auth/google
    ```

- **GET /auth/google/callback**
  - **Deskripsi**: Menangani callback OAuth Google dan mengarahkan ke autentikasi Trello.
  - **Parameter**:
    - `code` (query, wajib): Kode otorisasi dari Google OAuth.
  - **Respons**:
    - `302`: Mengarahkan ke autentikasi Trello.
    - `400`: Kode tidak disediakan.
    - `500`: Gagal mengambil token akses Google.

- **GET /auth/trello**
  - **Deskripsi**: Memulai autentikasi Trello.
  - **Respons**:
    - `302`: Mengarahkan ke URL otorisasi Trello.
    - `500`: Kunci API Trello tidak dikonfigurasi.

- **GET /auth/trello/redirect**
  - **Deskripsi**: Menangani pengalihan otorisasi Trello dan merender halaman untuk memproses token Trello.
  - ** Respons**:
    - `200`: Merender halaman HTML untuk memproses token Trello.

- **POST /auth/trello/save-token**
  - **Deskripsi**: Menyimpan token Trello dan menghasilkan token JWT untuk akses API.
  - **Parameter**:
    - `token` (body, wajib): Token autentikasi Trello.
  - **Respons**:
    - `200`: Mengembalikan token JWT.
      ```json
      {
        "success": true,
        "message": "Token Trello berhasil disimpan",
        "jwtToken": "<token-jwt-anda>"
      }
      ```
    - `400`: Token tidak disediakan atau autentikasi Google diperlukan.
  - **Contoh**:
    ```bash
    curl -X POST http://localhost:3000/auth/trello/save-token \
    -H "Content-Type: application/json" \
    -d '{"token": "<token-trello>"}'
    ```

- **GET /auth-success**
  - **Deskripsi**: Menampilkan halaman sukses dengan token JWT setelah autentikasi selesai.
  - **Parameter**:
    - `token` (query, wajib): Token JWT untuk ditampilkan.
  - **Respons**:
    - `200`: Merender halaman HTML dengan token JWT.

### 2. Sinkronisasi Kartu Trello ke Google Calendar

- **POST /api/sync/trello-to-calendar**
  - **Deskripsi**: Menyinkronkan kartu Trello dari papan tertentu ke Google Calendar sebagai acara. Secara default, hanya kartu dengan tenggat waktu yang disinkronkan, tetapi ini dapat diubah.
  - **Autentikasi**: Memerlukan autentikasi Google dan Trello (token JWT di header `Authorization`).
  - **Parameter**:
    - `boardId` (body, wajib): ID papan Trello yang akan disinkronkan.
    - `dueOnly` (body, opsional, default: `true`): Jika `true`, hanya kartu dengan tenggat waktu yang disinkronkan; jika `false`, semua kartu disinkronkan.
  - **Contoh Body Permintaan**:
    ```json
    {
      "boardId": "<id-papan-trello>",
      "dueOnly": true
    }
    ```
  - **Respons**:
    - `200`: Sinkronisasi berhasil diselesaikan.
      ```json
      {
        "message": "Sinkronisasi selesai",
        "totalCards": 5,
        "results": [
          {
            "trelloCard": "Nama Tugas",
            "googleEventId": "<id-acara-google>",
            "success": true
          },
          {
            "trelloCard": "Tugas Lain",
            "error": "Gagal membuat acara",
            "success": false
          }
        ]
      }
      ```
    - `400`: ID papan diperlukan.
    - `401`: Tidak diautentikasi dengan Google atau Trello, atau token tidak ditemukan.
    - `500`: Gagal menyinkronkan kartu Trello ke Google Calendar.
  - **Contoh**:
    ```bash
    curl -X POST http://localhost:3000/api/sync/trello-to-calendar \
    -H "Authorization: Bearer <token-jwt-anda>" \
    -H "Content-Type: application/json" \
    -d '{"boardId": "<id-papan-trello>", "dueOnly": true}'
    ```

## Struktur Proyek

- `/routes/api.js`: Berisi endpoint untuk operasi Trello dan Google Calendar, termasuk sinkronisasi.
- `/routes/auth.js`: Menangani alur autentikasi untuk Google dan Trello.
- `/routes/catalog.js`: Menyediakan katalog API dan antarmuka dokumentasi.
- `index.js`: File utama aplikasi yang mengatur server Express dan middleware.
- `/config`: File konfigurasi untuk Google OAuth, Trello API, dan JWT.
- `/public`: File statis, termasuk `index.html` untuk rute utama.

## Contoh Alur Kerja

1. **Autentikasi**:
   - Kunjungi `/auth/google` untuk autentikasi dengan Google.
   - Setelah autentikasi Google, Anda diarahkan ke `/auth/trello`.
   - Setelah autentikasi Trello, terima token JWT di `/auth-success`.

2. **Sinkronisasi Kartu Trello**:
   - Gunakan token JWT untuk membuat permintaan POST ke `/api/sync/trello-to-calendar` dengan ID papan Trello yang diinginkan.
   - Kartu Trello dengan tenggat waktu (atau semua kartu jika `dueOnly` adalah `false`) akan dibuat sebagai acara di Google Calendar.

3. **Kelola Acara**:
   - Gunakan endpoint seperti `/api/calendar/events` untuk mengambil, memperbarui, atau menghapus acara Google Calendar.
   - Gunakan endpoint seperti `/api/trello/boards` untuk mengelola papan, daftar, dan kartu Trello.

## Pemecahan Masalah

- **Kesalahan Autentikasi**:
  - Pastikan kredensial API Google dan Trello dikonfigurasi dengan benar di file `.env`.
  - Verifikasi bahwa URI pengalihan cocok di Google Cloud Console dan pengaturan aplikasi Trello.

- **Masalah Token**:
  - Jika menerima kesalahan `401`, periksa apakah token JWT valid dan disertakan di header `Authorization`.
  - Gunakan `/api/reauthenticate` untuk memeriksa layanan mana yang memerlukan autentikasi ulang.

- **Kegagalan Sinkronisasi**:
  - Pastikan ID papan Trello benar dan dapat diakses dengan token yang diberikan.
  - Konfirmasi bahwa Google Calendar API diaktifkan dan token akses belum kedaluwarsa.

## Peningkatan di Masa Depan

- Tambahkan dukungan untuk menyinkronkan acara Google Calendar kembali ke kartu Trello.
- Terapkan pembaruan real-time menggunakan webhook untuk Trello dan Google Calendar.
- Tingkatkan penanganan kesalahan dengan pesan kesalahan yang lebih rinci.
- Tambahkan dukungan untuk memilih kalender khusus (selain kalender utama).

## Kontribusi

Kontribusi sangat dihargai! Silakan ajukan pull request atau buka isu di repositori untuk laporan bug, permintaan fitur, atau saran.

## Lisensi

Proyek ini dilisensikan di bawah [Lisensi MIT](LICENSE).
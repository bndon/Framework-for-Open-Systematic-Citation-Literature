# FOSCL: Panduan Lengkap Membaca Kode, Mengedit, Mengubah UI, & Rencana Masa Depan

Selamat datang di panduan komprehensif **FOSCL (Research Workspace)** versi 0.2.0+. Dokumen ini dibuat agar kamu bisa memahami cara kerja arsitektur aplikasi ini secara mendalam, tahu file mana yang harus diedit jika ingin mengubah tampilan (UI) atau logika, serta memahami roadmap pengembangan masa depan.

---

## 1. Arsitektur & Cara Kerja FOSCL

FOSCL menggabungkan performa desktop native dengan kemudahan pengembangan web modern:

```
┌─────────────────────────────────────────────────────────────┐
│                       React 19 Frontend                     │
│    (UI, Layout, State, PDF Canvas, Router, Styling inline)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            Tauri 2 IPC Bridge (`src/lib/api.ts`)
          Otomatis menangani camelCase & snake_case
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Tauri 2 Rust Backend                     │
│    (Window desktop, dialog file native, HTTP OpenAlex)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Database SQLite Lokal                    │
│     (Tersimpan di: %APPDATA%/com.anon.foscl/foscl/foscl.db)                │
└─────────────────────────────────────────────────────────────┘
```

### Konsep Inti Data FOSCL
1. **Paper**: Metadata artikel ilmiah (Judul, DOI, Venue, Penulis, Abstrak, Path PDF lokal).
2. **Collection**: Folder riset atau topik penelitian yang mengelompokkan paper-paper tertentu.
3. **Annotation**: Kutipan dan catatan penting yang di-highlight langsung di halaman PDF.
4. **Template & Field**: Matriks ekstraksi data (misal: *Research Question, Methodology, Findings*).
5. **Extraction**: Nilai sel matriks hasil perbandingan yang memiliki badge asal-usul (*Source*, *You*, atau *AI*).
6. **Claim & Lineage**: Hipotesis ilmiah yang ditautkan ke bukti (*supports/contradicts/qualifies*) dan memiliki rekam jejak revisi abadi.

---

## 2. Peta Folder & Direktori (Di Mana Mencari Kode?)

```text
d:\Venture\foscl\
├── index.html                   # Halaman HTML pembungkus utama (#root)
├── package.json                 # Dependensi Node (React 19, pdfjs, docx, jszip, pdfmake)
├── public/
│   └── pdf.worker.min.mjs       # Worker lokal agar PDF viewer bisa bekerja tanpa internet (offline)
│
├── src/                         # KODE FRONTEND (REACT + TYPESCRIPT)
│   ├── main.tsx                 # Entry point React DOM createRoot
│   ├── App.tsx                  # Router utama (mendaftarkan semua route layar aplikasi)
│   ├── types/
│   │   └── index.ts             # Definisi tipe data TypeScript (Paper, Claim, Annotation, dll)
│   ├── lib/
│   │   ├── api.ts               # Jembatan penghubung React ke Rust backend
│   │   ├── toast.ts             # Store notifikasi popup elegan
│   │   └── extraction.ts        # Algoritma ekstraksi otomatis
│   ├── components/              # Komponen antarmuka yang dipakai berulang
│   │   ├── Sidebar.tsx          # Panel navigasi sebelah kiri (dengan Knowledge Graph & Citation Tree)
│   │   ├── ForceGraphView.tsx   # Mesin interaktif 60 FPS HTML5 Canvas Force-Directed Graph (Obsidian-style)
│   │   ├── Modal.tsx            # Jendela popup serbaguna
│   │   ├── ConfirmDialog.tsx    # Dialog konfirmasi aksi (pengganti window.confirm)
│   │   ├── ToastContainer.tsx   # Tempat merender notifikasi hijau/merah di pojok kanan bawah
│   │   ├── OriginBadge.tsx      # Label warna untuk penanda asal data (Source/You/AI)
│   │   └── SimulatedBadge.tsx   # Badge penanda fitur konsep/simulasi
│   └── screens/                 # HALAMAN / LAYAR APLIKASI
│       ├── Discover.tsx         # Pencarian OpenAlex, filter DOI, & simpan paper
│       ├── Library.tsx          # Manajemen koleksi, list paper, search & sorting
│       ├── PaperDetail.tsx      # Detail paper, unggah file PDF, & link jaringan sitasi
│       ├── Reader.tsx           # PDF Reader visual, highlight teks, & catatan warna
│       ├── ComparisonTable.tsx  # Matriks tabel pembanding paper × template field
│       ├── KnowledgeGraph.tsx   # Obsidian-style Global Knowledge Graph (Paper, Koleksi, Klaim, Bukti)
│       ├── CitationGraph.tsx    # Visual Citation Tree interaktif (Karya rujukan & pengutip)
│       ├── Lineage.tsx          # Manajemen klaim ilmiah, bukti, & timeline revisi
│       ├── Templates.tsx        # Pengaturan template kustom & reordering kolom matriks
│       ├── Export.tsx           # Generator ekspor Word (.docx) dan PDF (.pdf)
│       ├── AccessHub.tsx        # Akses DOI & simulasi akuisisi publisher
│       ├── ConferenceConverter.tsx # Parser struktur heading DOCX asli via JSZip
│       ├── Pricing.tsx          # Halaman konsep langganan & tier grup lab
│       └── EpubLibrary.tsx      # Reader buku format EPUB bawaan FOSCL klasik
│
└── src-tauri/                   # KODE BACKEND (RUST)
    ├── Cargo.toml               # Dependensi Rust (tauri, rusqlite, reqwest, uuid)
    ├── tauri.conf.json          # Konfigurasi jendela desktop (ukuran, judul, icon)
    └── src/
        ├── lib.rs               # Tempat mendaftarkan semua 34 command Tauri
        ├── models.rs            # Struct data Rust
        ├── db/
        │   ├── mod.rs           # Inisialisasi koneksi SQLite
        │   └── migrations.sql   # Skema tabel SQLite (CREATE TABLE & default data)
        └── commands/            # Logika perintah backend per modul
            ├── openalex.rs      # Pencarian API OpenAlex & caching SQLite
            ├── papers.rs        # CRUD database paper
            ├── collections.rs   # CRUD database koleksi & relasi paper
            ├── annotations.rs   # CRUD kutipan highlight
            ├── templates.rs     # CRUD template matriks
            ├── claims.rs        # CRUD claim, bukti, & revisi
            ├── pdf.rs           # Penyimpanan file PDF ke disk lokal
            └── files.rs         # Penulisan binary file hasil ekspor ke disk native
```

---

## 3. Cara Membaca & Memahami Alur Kodenya

Jika kamu ingin menelusuri bagaimana sebuah tombol bekerja dari klik sampai tersimpan:

1. **Lihat Model Datanya Terlebih Dahulu**:
   - Buka [`src/types/index.ts`](file:///C:/Venture/foscl/src/types/index.ts). Di sini kamu melihat bentuk objek `Paper`, `Collection`, `Annotation`, dll.
2. **Lihat Halaman Terkait di `src/screens/`**:
   - Misal ingin tahu alur pencarian: buka [`Discover.tsx`](file:///C:/Venture/foscl/src/screens/Discover.tsx).
   - Cari fungsi `handleSearch` atau `handleSaveToCollection`.
3. **Lihat Jembatan API di `src/lib/api.ts`**:
   - Fungsi `addPaperToCollection(...)` memanggil `invoke("add_paper_to_collection", ...)`.
   - Di file ini ada helper `dualKeys()` yang otomatis memastikan nama parameter terbaca baik di JavaScript maupun Rust.
4. **Lihat Backend Rust di `src-tauri/src/commands/`**:
   - Buka [`collections.rs`](file:///C:/Venture/foscl/src-tauri/src/commands/collections.rs) dan cari fungsi `pub fn add_paper_to_collection`. Di sinilah query SQL dieksekusi ke database SQLite.

---

## 4. Cara Mengubah Tampilan (UI) & Desain

FOSCL menggunakan **Inline Style CSS** murni yang rapi dan mudah diubah tanpa perlu ribet dengan CSS class yang bertumpuk-tumpuk.

### Palet Warna Resmi FOSCL
Semua layar menggunakan palet warna khas bertema akademis hangat:
- **Latar Belakang Utama**: `#FAF5EC` (Warm Parchment/Krem Lembut)
- **Latar Belakang Kartu / Panel**: `#FAF7F2` dan `#FFFFFF` (Putih Bersih)
- **Warna Teks Primer (Judul & Heading)**: `#4A2418` (Deep Espresso/Cokelat Tua)
- **Warna Teks Sekunder (Subtitle/Penulis)**: `#7A6458` (Muted Cocoa)
- **Warna Aksen / Tombol Utama**: `#8A5A7A` (Dusty Plum/Ungu Akademik)
- **Warna Aksen Sekunder**: `#6E4363` (Deep Violet)
- **Warna Garis Tepi (Border)**: `#E4DACB` atau `#EADDCB`

### Panduan Mengubah Elemen Tertentu:
- **Mengubah Sidebar (Menu Kiri)**:
  - Buka [`src/components/Sidebar.tsx`](file:///C:/Venture/foscl/src/components/Sidebar.tsx).
  - Kamu bisa menambah item menu baru di array `navItems` atau mengganti icon emoji dan warnanya.
- **Mengubah Warna Tombol Utama**:
  - Cari properti `backgroundColor: "#8A5A7A"` pada tombol di layar manapun dan ubah ke warna heksadesimal yang kamu inginkan (misal warna biru `#2B579A` atau hijau botol `#1B4D3E`).
- **Mengubah Font Aplikasi**:
  - Buka [`src/App.css`](file:///C:/Venture/foscl/src/App.css) atau [`src/styles.css`](file:///C:/Venture/foscl/src/styles.css), kamu bisa menambahkan font Google Web Fonts seperti *Inter*, *Plus Jakarta Sans*, atau *Merriweather* pada `body { font-family: ... }`.
- **Mengubah Ukuran Jendela Desktop Awal**:
  - Buka [`src-tauri/tauri.conf.json`](file:///C:/Venture/foscl/src-tauri/tauri.conf.json), ubah angka `width: 1280` dan `height: 800` pada objek `windows`.

---

## 5. Cara Menjalankan & Membangun Aplikasi

### Menjalankan Sesi Pengembangan (Hot-Reload Aktif)

Buka PowerShell di folder proyek:

1. **Jalankan frontend server Vite**:
   ```powershell
   cd d:\Venture\foscl
   npm run dev
   ```
   *(Biarkan jendela terminal ini tetap terbuka; kamu akan melihat alamat `http://localhost:1420/`)*

2. **Buka aplikasi desktop FOSCL**:
   Buka terminal PowerShell baru, lalu ketik:
   ```powershell
   Start-Process "d:\Venture\foscl\src-tauri\target\debug\foscl.exe"
   ```
   *Atau kamu bisa langsung double-click file `src-tauri\target\debug\foscl.exe` lewat Windows File Explorer.*

*(Keuntungan cara ini: Setiap kali kamu mengedit file di folder `src/`, tampilan aplikasi desktop akan langsung berubah secara otomatis / hot-reload!)*

### Memperbarui Build Produksi (`dist/`)

Jika kamu selesai melakukan perubahan dan ingin memastikan kode TypeScript bersih dan ter-compile dengan benar:
```powershell
cd d:\Venture\foscl
npm run build
```

---

## 6. Rencana & Roadmap Masa Depan (Future Ideas)

Berikut adalah beberapa arah fitur masa depan yang sangat menarik untuk dikembangkan lebih lanjut di FOSCL:

### 1. Integrasi AI Sungguhan (Real LLM Integration)
- **Saat ini**: Fitur *Mock AI* di Comparison Table menyaring kutipan berdasarkan keyword heuristik sederhana.
- **Rencana**: Tambahkan pengaturan API Key (Gemini, Claude, atau OpenAI) atau integrasi model offline lokal (Ollama / Llama-3) untuk:
  - Otomatis merangkum kontribusi utama sebuah paper saat diunggah.
  - Membaca seluruh PDF dan mengisi kolom metodologi serta limitasi penelitian secara cerdas.
  - Menemukan kontradiksi otomatis antar-paper di dalam koleksi.

### 2. Fitur Lanjutan pada PDF Reader
- **Dark Mode / Inverted Color**: Mode layar malam agar nyaman membaca paper panjang tanpa lelah mata.
- **Visual Highlight Layer**: Menggambar kotak highlight transparan berwarna-warni langsung di atas halaman canvas PDF.
- **Daftar Isi (Bookmarks / Table of Contents)**: Menampilkan navigasi bab/bagian PDF langsung di panel samping.

### 3. Visual Network Graph Interaktif (Obsidian-Style) — SUDAH TERSEDIA (v0.2.0+)
- **Global Knowledge Graph** (`/graph`): Memvisualisasikan seluruh Koleksi, Paper, Klaim Hipotesis, dan Hubungan Bukti (*supports / contradicts / qualifies*) dalam grafis fisika interaktif (Coulomb repulsion & Hooke's spring force) dengan zoom, pan, drag-and-drop, serta filter tipe node.
- **Visual Citation Tree** (`/citations`): Visualisasi pohon rujukan dan sitasi OpenAlex interaktif berpusat pada paper target dengan koneksi panah, penyorotan node (*hover glow*), serta kemampuan inspeksi dan pivoting sitasi langsung.

### 4. Sinkronisasi & Impor Format Eksternal
- **BibTeX / RIS Import**: Memungkinkan user mengimpor koleksi perpustakaan referensi dari Zotero, Mendeley, atau Google Scholar hanya dengan men-drag file `.bib`.
- **Export BibTeX**: Menyalin sitasi BibTeX paper dengan 1 kali klik.

### 5. Build Standalone Installer (Rilis .exe / .msi Tanpa Perlu `npm run dev`)
- Jika kamu menginstall compiler Rust via [rustup.rs](https://rustup.rs/), kamu bisa menjalankan perintah:
  ```powershell
  npm run tauri build
  ```
  Ini akan menghasilkan installer tunggal resmi (`FOSCL_0.2.0_x64_en-US.msi` atau `.exe`) yang bisa diinstal di komputer mana pun tanpa perlu dependensi Node.js atau server dev.

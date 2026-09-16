# KARSA Finance System — COMPLETE

## Struktur
Dashboard
Kas & Bank (Kas, Bank, Uang Masuk, Uang Keluar, Saldo)
Transaksi (Penjualan, Pembelian, Pemasukan Lain, Pengeluaran, Modal, Penarikan Pemilik)
Piutang (Daftar, Jatuh Tempo, Pembayaran)
Hutang (Daftar, Jatuh Tempo, Pembayaran)
Stok (Produk, Masuk, Keluar, Akhir)
HPP Produk (Bahan/Kain, Produksi, Packaging, Aksesoris, HPP/Produk, Estimasi Laba)
Jurnal (Umum, Penjualan, Pembelian, Penerimaan, Pengeluaran)
Laporan (Arus Kas, Penjualan, Pembelian, Hutang, Piutang, Stok, HPP, Laba/Rugi)
Export (Excel XLSX, CSV)

## Jurnal double-entry
- Penjualan tunai: Dr Kas/Bank, Cr Penjualan
- Penjualan kredit: Dr Piutang, Cr Penjualan
- Pembelian tunai: Dr Persediaan/HPP, Cr Kas/Bank
- Pembelian kredit: Dr Persediaan/HPP, Cr Hutang
- Penerimaan lain: Dr Kas/Bank, Cr Pendapatan Lain
- Pengeluaran: Dr Beban, Cr Kas/Bank
- Modal: Dr Kas/Bank, Cr Modal
- Penarikan pemilik: Dr Prive, Cr Kas/Bank
- Pembayaran piutang: Dr Kas/Bank, Cr Piutang
- Pembayaran hutang: Dr Hutang, Cr Kas/Bank
- HPP penjualan: Dr HPP, Cr Persediaan

Semua jurnal harus balance: SUM(Debit) = SUM(Kredit).

## Excel/Spreadsheet/CSV
- CSV memakai UTF-8 BOM agar mudah dibuka Excel.
- XLSX dibuat dengan SheetJS dari web dan tersedia template formula.
- Spreadsheet dapat mengimpor XLSX/CSV tanpa kehilangan kolom debit/kredit.
- Template Excel berisi rumus saldo kas, HPP/unit, laba rugi, dan stok.

## Setup
1. Buat project Supabase.
2. Jalankan `supabase-schema-complete.sql`.
3. Buat user di Supabase Auth > Users. Tidak ada register di website.
4. Isi `config.js` dengan Project URL dan anon/public key.
5. Deploy dengan HTTPS.

Service-role key tidak boleh dimasukkan ke frontend.

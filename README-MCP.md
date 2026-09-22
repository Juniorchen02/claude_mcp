# Cara menjalankan

1. `npm install`
2. Salin `.env.example` menjadi `.env.local`, lalu isi `MCP_SECRET_TOKEN`
   (buat token: `openssl rand -hex 32`)
3. `npm run dev`
4. Buka http://localhost:3000 (dashboard hasil)
5. Buat bisa diakses publik untuk Claude, mis. `ngrok http 3000`
6. Di claude.ai: Settings -> Connectors -> Add custom connector
   URL: `https://<domain-ngrok-anda>/api/mcp?token=TOKEN_ANDA`
7. Di chat Claude, aktifkan connector, lalu minta:
   "Buatkan ringkasan X, lalu kirim ke sistem saya beserta file CSV-nya."

Tambahkan `data/` ke .gitignore (berisi data yang dikirim Claude).

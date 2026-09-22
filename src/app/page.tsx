"use client";

import { useEffect, useState } from "react";

type FileMeta = { id: string; name: string; mimeType: string; size: number };
type Message = {
  id: string;
  createdAt: string;
  title: string;
  content: string;
  files: FileMeta[];
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/messages", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Message[];
        if (active) {
          setMessages(data);
          setError(null);
        }
      } catch {
        if (active) setError("Gagal memuat data. Mencoba lagi...");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 3000); // cek data baru tiap 3 detik
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Hasil dari Claude</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Halaman ini diperbarui otomatis setiap 3 detik.
      </p>

      {loading && <p className="mt-8 text-zinc-500">Memuat...</p>}

      {error && <p className="mt-8 text-sm text-red-600">{error}</p>}

      {!loading && messages.length === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
          Belum ada data. Minta Claude untuk mengirim hasil ke sistem.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {messages.map((m) => (
          <article
            key={m.id}
            className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
          >
            <header className="flex items-baseline justify-between gap-4">
              <h2 className="font-medium">{m.title}</h2>
              <time className="shrink-0 text-xs text-zinc-500">
                {new Date(m.createdAt).toLocaleString("id-ID")}
              </time>
            </header>

            {/* Ditampilkan sebagai teks biasa (aman dari XSS) */}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
              {m.content}
            </p>

            {m.files.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {m.files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/files/${f.id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      📎 {f.name}
                      <span className="text-xs text-zinc-500">
                        {formatSize(f.size)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}

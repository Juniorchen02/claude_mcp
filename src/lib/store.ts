import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/**
 * Penyimpanan berbasis Supabase:
 *  - Tabel `messages` dan `files` menyimpan data pesan & metadata file
 *  - Bucket Storage `files` (private) menyimpan isi file
 *
 * Memakai SERVICE ROLE key, jadi HANYA boleh dijalankan di server.
 * Jangan pernah mengimpor file ini dari komponen client.
 */

const BUCKET = "files";

export type FileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

export type Message = {
  id: string;
  createdAt: string;
  title: string;
  content: string;
  files: FileMeta[];
};

// Vercel membatasi body request sekitar 4,5 MB, dan base64 membengkak ~33%.
// Batas 3 MB per file aman untuk file biner maupun teks.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

let cached: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diatur di environment"
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Buang karakter berbahaya dari nama file (cegah path traversal) */
function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[^\w.\- ]+/g, "_")
    .trim();
  return base.length > 0 ? base.slice(0, 120) : "file";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FileRow = {
  id: string;
  message_id: string;
  name: string;
  mime_type: string;
  size: number;
};

type MessageRow = {
  id: string;
  created_at: string;
  title: string;
  content: string;
  files: FileRow[] | null;
};

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    createdAt: row.created_at,
    title: row.title,
    content: row.content,
    files: (row.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mime_type,
      size: f.size,
    })),
  };
}

export async function listMessages(): Promise<Message[]> {
  const { data, error } = await db()
    .from("messages")
    .select("id, created_at, title, content, files(id, message_id, name, mime_type, size)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Gagal membaca pesan: ${error.message}`);
  return ((data ?? []) as unknown as MessageRow[]).map(toMessage);
}

export async function saveMessage(input: {
  title: string;
  content: string;
  files?: { name: string; mimeType?: string; base64?: string; text?: string }[];
}): Promise<Message> {
  const client = db();

  // 1) Siapkan & validasi SEMUA file dulu, sebelum menulis apa pun.
  //    Jadi kalau ada file yang terlalu besar, tidak ada data setengah jadi.
  const prepared = (input.files ?? []).map((f) => {
    const buffer = f.base64
      ? Buffer.from(f.base64, "base64")
      : Buffer.from(f.text ?? "", "utf-8");

    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error(
        `File "${f.name}" terlalu besar (maks ${MAX_FILE_BYTES / 1024 / 1024} MB)`
      );
    }
    return {
      id: randomUUID(),
      name: sanitizeFileName(f.name),
      mimeType: f.mimeType ?? "application/octet-stream",
      buffer,
    };
  });

  // 2) Simpan pesan
  const { data: msg, error: msgErr } = await client
    .from("messages")
    .insert({ title: input.title, content: input.content })
    .select("id, created_at")
    .single();

  if (msgErr || !msg) {
    throw new Error(`Gagal menyimpan pesan: ${msgErr?.message ?? "tidak diketahui"}`);
  }

  // 3) Unggah file ke Storage. Path di storage = UUID, bukan nama dari luar.
  const uploaded: string[] = [];
  try {
    for (const f of prepared) {
      const { error } = await client.storage
        .from(BUCKET)
        .upload(f.id, f.buffer, {
          contentType: f.mimeType,
          upsert: false,
        });
      if (error) throw new Error(`Gagal mengunggah "${f.name}": ${error.message}`);
      uploaded.push(f.id);
    }

    // 4) Simpan metadata file
    if (prepared.length > 0) {
      const { error } = await client.from("files").insert(
        prepared.map((f) => ({
          id: f.id,
          message_id: msg.id,
          name: f.name,
          mime_type: f.mimeType,
          size: f.buffer.byteLength,
        }))
      );
      if (error) throw new Error(`Gagal menyimpan metadata file: ${error.message}`);
    }
  } catch (err) {
    // Rollback: hapus file di storage dan pesan, supaya tidak ada sisa yatim.
    if (uploaded.length > 0) await client.storage.from(BUCKET).remove(uploaded);
    await client.from("messages").delete().eq("id", msg.id);
    throw err;
  }

  return {
    id: msg.id,
    createdAt: msg.created_at,
    title: input.title,
    content: input.content,
    files: prepared.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.buffer.byteLength,
    })),
  };
}

export async function getFile(
  id: string
): Promise<{ meta: FileMeta; data: Buffer } | null> {
  // id hanya boleh berupa UUID, cegah path traversal
  if (!UUID_RE.test(id)) return null;

  const client = db();

  const { data: row, error } = await client
    .from("files")
    .select("id, name, mime_type, size")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) return null;

  const { data: blob, error: dlErr } = await client.storage
    .from(BUCKET)
    .download(id);
  if (dlErr || !blob) return null;

  return {
    meta: {
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      size: row.size,
    },
    data: Buffer.from(await blob.arrayBuffer()),
  };
}

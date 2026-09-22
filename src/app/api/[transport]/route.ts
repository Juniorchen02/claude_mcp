import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { saveMessage } from "@/lib/store";

// Di mcp-handler v2 / MCP SDK v2, inputSchema harus berupa objek Zod utuh
// (z.object), bukan lagi map { field: z.string() }.
const kirimKeSistemInput = z.object({
  title: z.string().max(200).describe("Judul singkat untuk hasil ini"),
  content: z
    .string()
    .max(100_000)
    .describe("Isi jawaban/hasil dalam teks (boleh Markdown)"),
  files: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Nama file beserta ekstensi, mis. laporan.csv"),
        mimeType: z
          .string()
          .optional()
          .describe("MIME type, mis. text/csv atau application/pdf"),
        text: z
          .string()
          .optional()
          .describe("Isi file jika berupa teks (csv, md, html, kode, json)"),
        base64: z
          .string()
          .optional()
          .describe(
            "Isi file dalam base64 jika biner (pdf, gambar). Hanya untuk file kecil (maks ~3 MB)."
          ),
      })
    )
    .max(5)
    .optional()
    .describe("Daftar file yang ingin dilampirkan (maks 5)"),
});

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "kirim_ke_sistem",
      {
        title: "Kirim ke sistem",
        description:
          "Kirim hasil/jawaban ke sistem pengguna agar tampil di dashboard mereka. " +
          "Gunakan tool ini ketika pengguna meminta hasil dikirim/disimpan ke sistem. " +
          "Sertakan file (jika ada) pada parameter 'files'.",
        inputSchema: kirimKeSistemInput,
      },
      async ({ title, content, files }) => {
        try {
          const saved = await saveMessage({ title, content, files });
          return {
            content: [
              {
                type: "text" as const,
                text: `Berhasil dikirim ke sistem (id: ${saved.id}, ${saved.files.length} file).`,
              },
            ],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Gagal mengirim: ${msg}` }],
          };
        }
      }
    );
  },
  {
    serverInfo: { name: "claude-mcp-dashboard", version: "1.0.0" },
  }
);

/**
 * Autentikasi sederhana: token statis lewat query string atau header.
 * Cocok untuk uji coba / penggunaan pribadi.
 *
 * Untuk produksi multi-pengguna, gunakan OAuth (didukung spesifikasi MCP).
 */
function isAuthorized(req: Request): boolean {
  const expected = process.env.MCP_SECRET_TOKEN;
  if (!expected) return false; // tolak semua jika token belum diatur

  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  const authHeader = req.headers.get("authorization");
  const fromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const provided = fromQuery ?? fromHeader;
  return provided === expected;
}

async function guarded(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return mcpHandler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };

import { getFile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const file = await getFile(id);

  if (!file) {
    return new Response("File tidak ditemukan", { status: 404 });
  }

  // Selalu paksa unduh (attachment) dan matikan sniffing tipe konten.
  // Ini mencegah file HTML/SVG dari luar dieksekusi di domain Anda (XSS).
  const safeName = encodeURIComponent(file.meta.name);

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.meta.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${safeName}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(file.meta.size),
    },
  });
}

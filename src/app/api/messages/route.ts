import { listMessages } from "@/lib/store";

// Jangan di-cache, data selalu berubah
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const messages = await listMessages();
    return Response.json(messages);
  } catch (err) {
    // Log detail di server, kirim pesan umum ke client
    console.error("[/api/messages]", err);
    return Response.json({ error: "Gagal membaca data" }, { status: 500 });
  }
}

"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import NotePDF from "./NotePDF";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ExportButton({ note }: { note: any }) {
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("attachments")
        .select("*")
        .eq("note_id", note.id);
      setAttachments(data ?? []);
    }
    load();
  }, [note.id]);

  if (!isClient) return null;

  return (
    <PDFDownloadLink
      document={<NotePDF note={note} attachments={attachments} />}
      fileName={`${note.title || "nota"}.pdf`}
      className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
    >
      {({ loading }) => (loading ? "Generando..." : "Exportar PDF / Imprimir")}
    </PDFDownloadLink>
  );
}

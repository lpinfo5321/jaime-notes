import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  template_snapshot?: any;
  updated_at: string;
};

export default function FeaturedNoteCard({
  companyName,
  note,
  coverUrl,
  firstDoc,
  meta,
}: {
  companyName: string;
  note: Note;
  coverUrl?: string | null;
  firstDoc?: { url: string; filename: string; mime: string } | null;
  meta?: { total: number; images: number; docs: number } | null;
}) {
  const title = note.title?.trim() ? note.title : "Sin título";
  const excerpt = (note.body ?? "").trim();
  const templateName =
    typeof note.template_snapshot?.name === "string"
      ? note.template_snapshot.name
      : null;

  return (
    <div
      className={cn(
        "rounded-[28px] border border-zinc-200 bg-white shadow-sm",
        "dark:border-zinc-800 dark:bg-zinc-900",
      )}
    >
      <div className="px-5 pt-5">
        <div className="text-center text-2xl font-black tracking-wide text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          {companyName}
        </div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_380px] md:items-stretch">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            Última nota
            <span className="text-zinc-500 dark:text-zinc-400">
              ·{" "}
              {formatDistanceToNow(new Date(note.updated_at), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>

          <div className="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-50">
            {title}
          </div>
          {excerpt ? (
            <div className="mt-1 line-clamp-4 text-sm text-zinc-600 dark:text-zinc-300">
              {excerpt}
            </div>
          ) : (
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              (sin contenido)
            </div>
          )}

          {templateName ? (
            <div className="mt-3 inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              Plantilla: {templateName}
            </div>
          ) : null}

          {meta?.total ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
                <Paperclip className="h-3.5 w-3.5" />
                {meta.total}
              </span>
              {meta.images ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {meta.images}
                </span>
              ) : null}
              {meta.docs ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
                  <FileText className="h-3.5 w-3.5" />
                  {meta.docs}
                </span>
              ) : null}
              {firstDoc ? (
                <a
                  href={firstDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-full border border-zinc-200 bg-white px-2 py-1 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  title={`Abrir: ${firstDoc.filename}`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {firstDoc.filename}
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <Link
              href={`/app/n/${note.id}`}
              prefetch={false}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Abrir nota
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Portada"
              src={coverUrl}
              className="h-full min-h-[220px] w-full object-cover md:min-h-[280px]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400 md:min-h-[280px]">
              Sin portada
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


type Notice = {
  start: (title?: string, detail?: string) => void;
  update: (title: string, detail?: string) => void;
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  close: () => void;
};

let loading: Promise<Notice> | null = null;

/** Ventana animada de exportación (public/export-notice.js). */
export function exportNotice(): Promise<Notice> {
  const w = window as unknown as { rcNotice?: Notice };
  if (w.rcNotice) return Promise.resolve(w.rcNotice);
  if (loading) return loading;
  loading = new Promise<Notice>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/export-notice.js?v=1";
    s.onload = () => (w.rcNotice ? resolve(w.rcNotice) : reject(new Error("notice")));
    s.onerror = () => reject(new Error("notice"));
    document.head.appendChild(s);
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/** Si la ventana no carga, igual avisamos con un alert: un error nunca se queda callado. */
export async function noticeOrAlert(): Promise<Notice> {
  try {
    return await exportNotice();
  } catch {
    return {
      start: () => {},
      update: () => {},
      success: (t, d) => alert(`${t}${d ? `\n${d}` : ""}`),
      error: (t, d) => alert(`ERROR: ${t}${d ? `\n${d}` : ""}`),
      close: () => {},
    };
  }
}

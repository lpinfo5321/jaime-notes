import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: note, error: readErr } = await supabase
    .from("notes")
    .select("title,body,tags,favorite,template_id,template_snapshot,values")
    .eq("id", id)
    .single();

  if (readErr || !note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Duplicado "limpio":
  // - Mantener nombre de la compañía (title)
  // - Mantener SOLO 3 campos del reporte (NO todo):
  //   1) COMPANY NAME
  //   2) MAKER/PAYOR
  //   3) COMPANY CONTACT
  // - NO copiar notas internas (values._entries) ni body
  // - Siempre volver a Pendientes
  const sourceValues =
    note.values && typeof note.values === "object" && !Array.isArray(note.values)
      ? (note.values as any)
      : null;

  const isObj = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
  const normStr = (v: any) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

  // Extraer reporte actual (puede venir en diferentes formas)
  const rawReportCandidate =
    sourceValues?._report?.payload ??
    sourceValues?._report?.payload?.payload ??
    sourceValues?._report ??
    null;

  const pickFields = () => {
    if (!isObj(rawReportCandidate)) return { makerPayor: "", companyContact: "" };
    let payload: any = rawReportCandidate;
    // Si viene envuelto como { payload: { fields... } }, desempaquetar.
    if (isObj(payload.payload) && isObj(payload.payload.fields)) payload = payload.payload;
    const fields = isObj(payload.fields) ? payload.fields : {};
    const makerPayor = normStr(fields.makerPayor) || normStr(fields.maker_payor);
    const companyContact = normStr(fields.companyContact) || normStr(fields.company_contact);
    return { makerPayor, companyContact };
  };

  const title = note.title?.trim() ? note.title.trim() : "Sin nombre";
  const { makerPayor, companyContact } = pickFields();

  // Construir un payload nuevo con SOLO esos 3 campos (sin imágenes)
  const cleanReportPayload: any = {
    id: (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: {
      companyName: title.toUpperCase(),
      makerPayor,
      companyContact,
      // lo demás vacío a propósito (NO duplicar todo)
      dateCashed: "",
      dateDeposit: "",
      dateReturned: "",
      payee: "",
      checkNumber: "",
      rejectReason: "",
      customerContact: "",
      checkAmount: "",
      returnedFee: "",
      totalDue: "$0.00",
      dateFeePaid: "",
      feePaymentMethod: "",
      feePaidNumbers: "",
      dateCheckPaid: "",
      checkPaymentMethod: "",
      checkPaidNumber: "",
      dateCompleted: "",
      agentCompleted: "",
    },
    images: [],
  };

  const values = {
    _bucket: "pending",
    _report: { payload: cleanReportPayload, updatedAt: new Date().toISOString() },
    // No copiar portada ni imágenes ligadas
    _cover: null,
    _coverInline: null,
  } as any;

  const { data: created, error: createErr } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title,
      body: "", // NO copiar notas
      tags: note.tags ?? [],
      favorite: false,
      template_id: note.template_id ?? null,
      template_snapshot: note.template_snapshot ?? null,
      values,
    })
    .select("id")
    .single();

  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? "Error" }, { status: 400 });
  }

  return NextResponse.json(
    {
      id: created.id,
      title,
      reportPayload: cleanReportPayload,
    },
    { status: 201 },
  );
}


import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ReturnedCheckPresetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fields = [
    // Datos del cheque
    {
      id: crypto.randomUUID(),
      type: "date",
      label: "Date Cashed",
      key: "date_cashed",
      required: true,
      section: "Datos del cheque",
      width: "half",
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "date",
      label: "Date of Deposit",
      key: "date_deposit",
      required: true,
      section: "Datos del cheque",
      width: "half",
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "date",
      label: "Date Returned",
      key: "date_returned",
      required: true,
      section: "Datos del cheque",
      width: "half",
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      label: "Payee",
      key: "payee",
      required: true,
      section: "Datos del cheque",
      width: "full",
      placeholder: "Nombre del cliente (payee)",
    },
    {
      id: crypto.randomUUID(),
      type: "number",
      label: "Check Number",
      key: "check_number",
      required: true,
      section: "Datos del cheque",
      width: "half",
      placeholder: "Ej. 2690",
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      label: "Maker/Payor",
      key: "maker_payor",
      required: true,
      section: "Datos del cheque",
      width: "full",
      placeholder: "Ej. CPC CONCRETE LLC",
    },
    {
      id: crypto.randomUUID(),
      type: "select",
      label: "Reject Reason",
      key: "reject_reason",
      required: true,
      section: "Datos del cheque",
      width: "half",
      options: ["NSF", "ACCOUNT CLOSED", "STOP PAYMENT", "OTHER"],
      placeholder: "",
    },

    // Contactos
    {
      id: crypto.randomUUID(),
      type: "phone",
      label: "Customer Contact",
      key: "customer_contact",
      required: false,
      section: "Contactos",
      width: "half",
      placeholder: "Ej. 813-838-6100",
    },
    {
      id: crypto.randomUUID(),
      type: "phone",
      label: "Company Contact",
      key: "company_contact",
      required: false,
      section: "Contactos",
      width: "half",
      placeholder: "Ej. 813-495-4300",
    },

    // Montos
    {
      id: crypto.randomUUID(),
      type: "currency",
      label: "Check Amount",
      key: "check_amount",
      required: true,
      section: "Montos",
      width: "half",
      placeholder: "0.00",
    },
    {
      id: crypto.randomUUID(),
      type: "currency",
      label: "Returned Check Fee",
      key: "returned_check_fee",
      required: false,
      section: "Montos",
      width: "half",
      placeholder: "0.00",
    },
    {
      id: crypto.randomUUID(),
      type: "currency",
      label: "Total Due",
      key: "total_due",
      required: false,
      section: "Montos",
      width: "half",
      placeholder: "0.00",
    },

    // Pagos
    {
      id: crypto.randomUUID(),
      type: "date",
      label: "Date Fee Paid",
      key: "date_fee_paid",
      required: false,
      section: "Pagos",
      width: "half",
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "select",
      label: "Form of Payment (Fee)",
      key: "form_payment_fee",
      required: false,
      section: "Pagos",
      width: "half",
      options: ["CASH", "CARD", "ZELLE", "OTHER"],
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "date",
      label: "Date Check Paid",
      key: "date_check_paid",
      required: false,
      section: "Pagos",
      width: "half",
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "select",
      label: "Form of Payment (Check)",
      key: "form_payment_check",
      required: false,
      section: "Pagos",
      width: "half",
      options: ["CASH", "CARD", "ZELLE", "OTHER"],
      placeholder: "",
    },

    // Notas (tabla del reporte)
    {
      id: crypto.randomUUID(),
      type: "textarea",
      label: "Notes",
      key: "notes",
      required: false,
      section: "Notas",
      width: "full",
      placeholder: "Escribe notas del caso…",
    },

    // Cierre
    {
      id: crypto.randomUUID(),
      type: "date",
      label: "Date Completed",
      key: "date_completed",
      required: false,
      section: "Cierre",
      width: "half",
      placeholder: "",
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      label: "Agent",
      key: "agent",
      required: false,
      section: "Cierre",
      width: "half",
      placeholder: "Nombre del agente",
    },
  ];

  const { data, error } = await supabase
    .from("templates")
    .insert({
      user_id: user.id,
      name: "Returned Check Report",
      description: "Plantilla estilo reporte (cheque devuelto) — editable.",
      fields,
    })
    .select("id")
    .single();

  if (error || !data?.id) redirect("/templates");
  redirect(`/templates/${data.id}`);
}


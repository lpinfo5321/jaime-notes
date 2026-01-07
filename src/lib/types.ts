export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "phone"
  | "currency";

export type TemplateField = {
  id: string;
  type: FieldType;
  label: string;
  key: string;
  required?: boolean;
  options?: string[]; // para select
  section?: string; // para agrupar (ej. "Datos del cheque")
  width?: "half" | "full"; // layout en el formulario
  placeholder?: string;
};

export type Template = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  created_at: string;
  updated_at: string;
};

export type NoteValues = Record<string, unknown>;


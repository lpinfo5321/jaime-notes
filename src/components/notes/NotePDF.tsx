"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#18181b",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#71717a",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    backgroundColor: "#f4f4f5",
    padding: 4,
  },
  body: {
    lineHeight: 1.5,
    marginBottom: 10,
  },
  grid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  field: {
    width: "48%",
    marginBottom: 8,
  },
  label: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#71717a",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
  },
  tag: {
    fontSize: 8,
    backgroundColor: "#f4f4f5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  attachment: {
    fontSize: 9,
    marginBottom: 4,
    color: "#2563eb",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#a1a1aa",
    borderTopWidth: 1,
    borderTopColor: "#f4f4f5",
    paddingTop: 10,
  },
});

type Props = {
  note: any;
  attachments: any[];
};

export default function NotePDF({ note, attachments }: Props) {
  const fields = (note.template_snapshot?.fields ?? []) as any[];
  const values = note.values ?? {};

  return (
    <Document title={note.title || "Nota"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{note.title || "Nota sin título"}</Text>
          <Text style={styles.subtitle}>
            Fecha: {format(new Date(note.created_at), "PPP", { locale: es })}
          </Text>
        </View>

        {note.body ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contenido / Notas</Text>
            <Text style={styles.body}>{note.body}</Text>
          </View>
        ) : null}

        {fields.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Información del Formulario {note.template_snapshot?.name ? `(${note.template_snapshot.name})` : ""}
            </Text>
            <View style={styles.grid}>
              {fields.map((f) => {
                const val = values[f.key];
                const displayVal =
                  typeof val === "boolean"
                    ? val
                      ? "Sí"
                      : "No"
                    : val || "—";
                return (
                  <View key={f.id} style={styles.field}>
                    <Text style={styles.label}>{f.label}</Text>
                    <Text style={styles.value}>{displayVal}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {attachments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adjuntos / Archivos</Text>
            {attachments.map((a) => (
              <Text key={a.id} style={styles.attachment}>
                • {a.filename} ({Math.round(a.size / 1024)} KB)
              </Text>
            ))}
          </View>
        ) : null}

        {note.tags?.length > 0 ? (
          <View style={[styles.section, { flexDirection: "row" }]}>
            {note.tags.map((t: string) => (
              <Text key={t} style={styles.tag}>
                #{t}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Generado por Return Checks — {new Date().toLocaleString()}</Text>
        </View>
      </Page>
    </Document>
  );
}

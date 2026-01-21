# Jaime Notes (MVP)

App web tipo Google Keep, enfocada a **notas/expedientes con plantillas** y **adjuntos (fotos/PDFs/escaneos)**. Funciona en celular/tablet/PC y sincroniza en la nube usando **Supabase** (Auth + Postgres + Storage).

## Requisitos

- Node.js 20+
- Una cuenta de Supabase (gratis sirve para empezar)
- Opcional: Vercel para deploy

## 1) Crear Supabase (DB + Auth + Storage)

1. En Supabase crea un proyecto nuevo.
2. En **SQL Editor**, pega y ejecuta `supabase/schema.sql`.
3. En **Storage**, crea un bucket llamado `attachments` (privado).
4. En **Authentication**, crea tu usuario admin (email + contraseña).

## 2) Variables de entorno (local)

1. Copia `env.example` a `.env.local`
2. Completa:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Los encuentras en Supabase → **Project Settings → API**.

## 3) Ejecutar local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## 4) Deploy (Vercel) para “nube” real

1. Sube este repo a GitHub.
2. En Vercel: **New Project** → importa el repo.
3. Agrega las mismas variables en Vercel (Environment Variables).
4. Deploy.

## Notas

- La sincronización entre dispositivos la hace Supabase (Auth + DB + Storage).
- El bucket `attachments` se protege por policies: cada usuario sólo ve sus archivos en su carpeta.



Link de datos de app también aquí 
https://supabase.com/dashboard/project/xhjhzfenoyjuvozygsld

# Notas para Miguel (ReturnChecks)

Esta carpeta es una “guía rápida” para mantener/actualizar la app en el futuro.

## Qué es esta app
- **Nombre**: ReturnChecks
- **Dominio Prod (Vercel)**: `returnchecks.vercel.app`
- **Stack**: Next.js (App Router) + React + Tailwind + Supabase (Auth/DB/Storage)
- **Repo GitHub**: `lpinfo5321/jaime-notes`

## Cómo correr local
Desde `app-jaime/`:

```bash
npm install
npm run dev
```

Luego abrir: `http://localhost:3000/app`

> Si el puerto está ocupado, usa: `npm run dev -- -p 3001`

## Deploy a Vercel (cómo se actualiza la nube)
Esta app se despliega cuando haces **push a `main`**:

```bash
git add -A
git commit -m "tu mensaje"
git push origin main
```

Luego Vercel crea un deployment y lo pone en producción automáticamente.

## Variables de entorno (Supabase)
La app requiere variables públicas y privadas de Supabase.
Si falta algo, la app redirige a `/setup`.

- Revisa: `src/lib/env.ts`
- Ejemplo: `env.example`
- Archivo local típico: `.env.local` (NO se sube a GitHub)

## Funciones clave que ya existen
- **Reporte editable** dentro de un iframe: `public/appreporte/index.html` + `public/appreporte/app.js`
- **Guardado confiable**: indica “Guardado/Guardando/Sin conexión”, cola offline y autosync.
- **Imágenes y PDF**: se pueden agregar (PDF → páginas → imágenes).
- **Ordenar imágenes antes de importar**: drag & drop + preview grande.
- **Exportar**:
  - CSV desde selección múltiple
  - PDFs: 1 PDF por reporte + ZIP masivo desde selección
- **Búsqueda** en header con modos: Compañía / PAY / Status
- **Pestañas**: Pendientes / Completados / Papelera
- **Acciones masivas**: mover varios, borrar varios en papelera
- **Prompt al cerrar reporte**: si está completo, pregunta mover a Completados

## Archivos importantes (dónde tocar cosas)
- **Listado principal + tarjetas + modales**: `src/components/notes/NotesList.tsx`
- **Header / búsqueda**: `src/components/AppHeader.tsx`
- **Fondo/estilos globales**: `src/app/globals.css`
- **Página /app (consulta a DB)**: `src/app/(app)/app/page.tsx`
- **APIs**:
  - Guardar reporte: `src/app/api/notes/[id]/report/route.ts`
  - Duplicar: `src/app/api/notes/[id]/duplicate/route.ts`
  - CRUD nota: `src/app/api/notes/[id]/route.ts`

## Notas de mantenimiento
- **No tocar** el formato de mensajes `postMessage` entre app ↔ reporte sin revisar ambos lados.
- Si algo “no se ve” en Vercel, revisar:
  - último deployment en Vercel
  - que se hizo `git push origin main`
  - que no faltan env vars (pantalla `/setup`)


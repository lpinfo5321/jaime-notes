# Keys / Env (cómo conseguirlas y dónde ponerlas)

La app necesita estas variables para funcionar:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Están definidas en:
- `src/lib/env.ts`
- `env.example`

> **Importante**: **NO** subas las keys a GitHub. Van en `.env.local` (local) y en **Vercel → Environment Variables** (nube).

---

## 1) Cómo conseguir las keys en Supabase

1. Entra a Supabase (`https://supabase.com`) e inicia sesión.
2. Abre tu proyecto (el que usa ReturnChecks).
3. Ve a **Project Settings** (⚙️) → **API**.
4. Copia:
   - **Project URL** → esto es `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → esto es `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> No necesitas la *service role key* para correr la app normalmente. Si algún día se usa, debe ir solo en backend y nunca en frontend.

---

## 2) Dónde ponerlas en LOCAL (tu computadora)

En la raíz del proyecto (`app-jaime/`) crea/edita el archivo:

- `.env.local`

Con este formato:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
```

Luego corre:

```bash
npm run dev
```

Si entras a `/setup` significa que faltan o están mal.

---

## 3) Dónde ponerlas en VERCEL (producción)

1. Entra a Vercel y abre el proyecto `returnchecks`.
2. Ve a **Settings** → **Environment Variables**.
3. Agrega estas variables (al menos en **Production**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Guarda cambios.
5. Haz un redeploy (normalmente con un push a `main` o redeploy desde Vercel).

---

## 4) Recomendación para guardar esta info (sin riesgo)
- Guarda las keys en un lugar seguro (password manager).
- Evita screenshots en chats.
- No las pongas dentro del código.


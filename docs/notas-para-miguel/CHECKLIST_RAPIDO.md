# Checklist rápido (cuando algo falle)

## 1) No carga en producción (Vercel)
- Revisa que el dominio sea `returnchecks.vercel.app`
- En Vercel → Deployments: confirma que el último deployment sea el más reciente (main).
- Si ves `/setup`, faltan variables de entorno.

## 2) Quiero actualizar la nube
```bash
git add -A
git commit -m "update"
git push origin main
```

## 3) El reporte sale raro / en blanco
- Revisa:
  - `public/appreporte/index.html`
  - `public/appreporte/app.js`
- Asegúrate de que el reporte recibe datos:
  - Mensajes `rc:init`, `rc:save`, `rc:flushNow` (app ↔ reporte)

## 4) Exportar PDFs (bulk)
- Se genera un `.zip` con un PDF por compañía.
- Si falla, suele ser por:
  - muchas imágenes muy pesadas
  - el navegador bloqueó descargas múltiples
  - falta memoria (probar con menos seleccionados)

## 5) Supabase / Login
- Auth depende de Supabase.
- Si no puedes entrar, revisa:
  - `.env.local`
  - Config en Supabase (URL/keys)


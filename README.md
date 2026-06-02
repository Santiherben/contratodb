# ContratosDB — despliegue a GitHub Pages

Pasos rápidos para que el workflow genere `config.js` y publique en GitHub Pages:

1. En el repositorio en GitHub → Settings → Secrets and variables → Actions, añade dos secrets:
   - `SUPABASE_URL` = tu Supabase URL (ej. `https://...supabase.co`)
   - `SUPABASE_ANON_KEY` = tu anon publicable (empieza con `sb_publishable_`)

2. Confirma que la rama principal usada para `push` es `main` (o ajusta `.github/workflows/deploy.yml`).

3. Haz push de tus cambios a `main`:

```bash
git add .
git commit -m "Config: add deploy workflow and runtime config example"
git push origin main
```

4. El workflow `Deploy to GitHub Pages` generará `config.js` desde los secrets y publicará el contenido en la rama `gh-pages`.

5. En GitHub → Settings → Pages, seleccioná la rama `gh-pages` como origen si no se configura automáticamente.

Opcional: si preferís usar la CLI de GitHub para añadir secrets:

```bash
gh secret set SUPABASE_URL --body "https://tu-proyecto.supabase.co"
gh secret set SUPABASE_ANON_KEY --body "sb_publishable_..."
```

Si querés, hago el `git commit` y `git push` por vos aquí (crearé el commit con los cambios ya aplicados). ¿Lo hago?

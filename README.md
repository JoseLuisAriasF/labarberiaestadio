# La Barbería Estadio · SaaS de barberías en tiempo real

Web pública + panel del dueño + panel del barbero, con vista 3D isométrica en vivo.
$0/mes: **Astro 7 (estático) + Cloudflare Pages (+ Pages Functions) + Supabase (free)**.

```bash
npm install
npm run dev        # http://localhost:4321
npm test           # lógica de agenda (horas libres)
npm run deploy     # build + wrangler pages deploy → labarberiaestadio.pages.dev
```

## Mapa del proyecto

| Ruta | Qué es |
|---|---|
| `/` | Cita en tiempo real: mapa 3D por pisos, barberos cortando en vivo, colas y reserva |
| `/productos` | Catálogo (JSON-LD Product) con stock en vivo y "Separar por WhatsApp" |
| `/como-llegar` | Igual que Papichulo: Leaflet + OSM, GPS, ruta real (auto/a pie), seguimiento en vivo, Google Maps/Waze |
| `/perfil` | Cliente: Google + DNI, citas, historial con foto, tarjeta de lealtad, cupones |
| `/registro` | Alta de barbería: código `B1…BN`, 90 días de prueba, usuario master |
| `/login` | Personal: **código + usuario + clave** (como el POS de referencia) |
| `/admin` | Dueño: citas/pagos, barberos, servicios, pisos 3D, clientes, lealtad, productos, finanzas, local |
| `/barber` | Barbero: cambio de clave obligatorio, estado 1-tap, citas, walk-ins, perfil y best sellers |

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/001_init.sql` | **Todo el backend**: tablas, RLS, RPCs `SECURITY DEFINER`, triggers (cola, lealtad), Realtime, Storage |
| `functions/api/registro.ts` | Crea barbería + cuenta del dueño (service key; Turnstile opcional) |
| `functions/api/staff.ts` | Dueño crea barberos / resetea clave / da de baja (ban) / "Publicar en Google" (deploy hook) |
| `src/components/three/Barberia3D.tsx` | Escena R3F: sillas, barbero animado con tijeras, cliente cuyo pelo se acorta, pelitos cayendo, poste giratorio, timers y colas |
| `src/lib/useBarberia.ts` | Carga + suscripción Realtime a `barberos` (estados → 3D al instante) |
| `src/components/Agenda.tsx` | Agenda del día (dueño y barbero) con aviso sonoro/notificación de comprobantes |
| `src/lib/agenda.ts` | Horas reservables (horario − citas). Lima = UTC-5 fijo |
| `src/lib/sitio.ts` | Datos leídos en el build para SEO: `BarberShop` JSON-LD con geo, horario y precios |

## Seguridad

- **RLS en todas las tablas**; el navegador sólo usa la clave *publishable*. Toda escritura sensible
  (reservar, aprobar pagos, verificar DNI, estados, completar cortes) pasa por RPCs que validan al que llama.
- Privilegios por columna: el dueño no puede cambiarse `plan`, `trial_ends_at` ni `codigo`.
- **Doble reserva imposible** por constraint de exclusión (`btree_gist`), no por código.
- Antitroll: Google + DNI único; sin verificar ⇒ comprobante Yape/Plin obligatorio; máx. 2 citas pendientes.
- Comprobantes en bucket **privado** (URL firmada 10 min, sólo staff de esa barbería o el propio cliente).
- La *service key* sólo vive en Pages Functions (secreto de Cloudflare). Las funciones exigen JWT de dueño y mismo origen.
- CSP con hashes por script (Astro `security.csp`), HSTS, `X-Frame-Options: DENY`, `Permissions-Policy`, noindex en paneles.

## SEO + GEO

- `BarberShop` con `GeoCoordinates`, `openingHoursSpecification`, `makesOffer`; `ItemList` de productos.
- Meta `geo.region / geo.position / ICBM`, OpenGraph `business.business`, sitemap, robots.
- **`/llms.txt`** (GEO = Generative Engine Optimization): ficha factual para ChatGPT/Perplexity/Gemini.
- El HTML se genera con los datos reales del local; el botón **Publicar en Google** del admin regenera el sitio.

## Puesta en marcha (lo que falta y es tuyo)

1. **Clave secreta de Supabase → Cloudflare** (nunca al repo):
   ```bash
   npx wrangler pages secret put SUPABASE_SERVICE_KEY --project-name labarberiaestadio
   npx wrangler pages secret put SUPABASE_URL --project-name labarberiaestadio
   ```
   (Supabase → Project Settings → API Keys → *secret*; URL: `https://natjzjrzkunjyjtbjupq.supabase.co`)
2. **Google OAuth** (clientes): Supabase → Authentication → Sign In / Providers → Google → pega Client ID y
   Secret de Google Cloud (OAuth client "Web", redirect `https://natjzjrzkunjyjtbjupq.supabase.co/auth/v1/callback`).
   Luego Authentication → URL Configuration: Site URL `https://labarberiaestadio.pages.dev` y añade
   `https://labarberiaestadio.pages.dev/**` y `http://localhost:4321/**` a Redirect URLs.
3. **Variables públicas de build** en Cloudflare Pages (o deploy desde tu PC con `.env`): ya están en `.env`.
4. Opcional: Turnstile (`PUBLIC_TURNSTILE_SITE_KEY` + secreto `TURNSTILE_SECRET`), deploy hook (`DEPLOY_HOOK_URL`),
   Cloudflare Web Analytics (`PUBLIC_CF_ANALYTICS_TOKEN`).
5. Datos demo: `supabase/demo.sql` (cargado). Para borrarlos y que tu barbería real sea **B1**:
   ```sql
   delete from public.barberias where nombre like '%(demo)%';
   alter sequence public.barberia_codigo_seq restart with 1;
   ```

## Planes (SaaS)

Prueba de 90 días automática. Al vencer, las reservas online se pausan (`barberia_activa()`).
Para activar un cliente de pago: `update barberias set plan = 'ACTIVO' where codigo = 'B7';`
(cobro de suscripciones: pendiente — con Culqi/Mercado Pago cuando haya clientes que paguen).

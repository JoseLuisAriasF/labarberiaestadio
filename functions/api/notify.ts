import { admin, json, mismoOrigen, type Env } from '../../server/lib';

type Tipo = 'cita_confirmada' | 'cita_nueva' | 'pago_recibido';

const ASUNTOS: Record<Tipo, string> = {
  cita_confirmada: '✅ Cita confirmada',
  cita_nueva: '📅 Nueva cita reservada',
  pago_recibido: '💰 Comprobante de pago recibido',
};

const PUSH_ICONOS: Record<Tipo, string> = {
  cita_confirmada: '✅',
  cita_nueva: '📅',
  pago_recibido: '💰',
};

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);
  if (!env.RESEND_API_KEY) return json({ ok: true, skip: 'RESEND_API_KEY no configurada' });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const tipo = body.tipo as Tipo;
  const citaId = String(body.cita_id ?? '');
  if (!ASUNTOS[tipo] || !citaId) return json({ error: 'tipo y cita_id requeridos' }, 400);

  const sb = admin(env);

  const { data: cita } = await sb
    .from('citas')
    .select('id, fecha_hora, precio, estado, barbero_id, cliente_id, servicios_cortes(nombre), barberos(nombre, email_real), clientes(nombre, email)')
    .eq('id', citaId)
    .maybeSingle();
  if (!cita) return json({ error: 'Cita no encontrada' }, 404);

  const servicio = (cita as any).servicios_cortes?.nombre ?? 'Servicio';
  const barberoNombre = (cita as any).barberos?.nombre ?? 'Barbero';
  const barberoEmail = (cita as any).barberos?.email_real;
  const clienteNombre = (cita as any).clientes?.nombre ?? 'Cliente';
  const clienteEmail = (cita as any).clientes?.email;

  const fechaLocal = new Date(cita.fecha_hora).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
  const monto = `S/ ${Number(cita.precio).toFixed(2)}`;

  const emails: { to: string; subject: string; html: string }[] = [];

  if (tipo === 'cita_confirmada' && clienteEmail) {
    emails.push({
      to: clienteEmail,
      subject: '✅ Tu cita ha sido confirmada',
      html: plantilla(`
        <h2>¡Cita confirmada!</h2>
        <p>Hola <b>${clienteNombre}</b>,</p>
        <p>Tu cita con <b>${barberoNombre}</b> está confirmada:</p>
        <table><tr><td>📋</td><td>${servicio}</td></tr><tr><td>📅</td><td>${fechaLocal}</td></tr><tr><td>💰</td><td>${monto}</td></tr></table>
        <p>¡Te esperamos!</p>
      `),
    });
  }

  if ((tipo === 'cita_nueva' || tipo === 'pago_recibido') && barberoEmail) {
    const msg = tipo === 'pago_recibido'
      ? `<b>${clienteNombre}</b> subió un comprobante de pago. Revísalo en tu panel.`
      : `<b>${clienteNombre}</b> reservó una cita contigo.`;
    emails.push({
      to: barberoEmail,
      subject: `${ASUNTOS[tipo]} — ${clienteNombre}`,
      html: plantilla(`
        <h2>${ASUNTOS[tipo]}</h2>
        <p>${msg}</p>
        <table><tr><td>📋</td><td>${servicio}</td></tr><tr><td>📅</td><td>${fechaLocal}</td></tr><tr><td>💰</td><td>${monto}</td></tr></table>
      `),
    });
  }

  // Push notifications: notify the target user(s) via Web Push
  const pushTargets: { userId: string; title: string; body: string; url: string }[] = [];
  if (tipo === 'cita_confirmada') {
    const userId = (cita as any).cliente_id;
    if (userId) pushTargets.push({ userId, title: '✅ Cita confirmada', body: `${servicio} con ${barberoNombre} · ${fechaLocal}`, url: '/perfil' });
  }
  if (tipo === 'cita_nueva' || tipo === 'pago_recibido') {
    const { data: barberoRow } = await sb.from('barberos').select('usuario_id').eq('id', cita.barbero_id).maybeSingle();
    if (barberoRow?.usuario_id) pushTargets.push({
      userId: barberoRow.usuario_id,
      title: `${PUSH_ICONOS[tipo]} ${tipo === 'pago_recibido' ? 'Comprobante recibido' : 'Nueva cita'}`,
      body: `${clienteNombre} · ${servicio} · ${fechaLocal}`,
      url: '/barber#agenda',
    });
  }

  const pushResults = env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY
    ? await enviarPush(sb, env, pushTargets)
    : [];

  const emailResults = await Promise.allSettled(
    emails.map((e) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({ from: 'El Estadio Barbería <noreply@labarberiaestadio.pages.dev>', ...e }),
      }),
    ),
  );

  return json({ ok: true, emails: emailResults.filter((r) => r.status === 'fulfilled').length, push: pushResults.length });
};

async function enviarPush(
  sb: ReturnType<typeof admin>,
  env: Env,
  targets: { userId: string; title: string; body: string; url: string }[],
) {
  if (!targets.length) return [];
  const userIds = targets.map((t) => t.userId);
  const { data: subs } = await sb.from('push_subscriptions').select('*').in('usuario_id', userIds);
  if (!subs?.length) return [];

  const sent: string[] = [];
  for (const sub of subs) {
    const target = targets.find((t) => t.userId === sub.usuario_id);
    if (!target) continue;
    const payload = JSON.stringify({ title: target.title, body: target.body, url: target.url, icon: '/icono-192.png', badge: '/icono-192.png' });
    try {
      const res = await webpush(sub.endpoint, sub.p256dh, sub.auth_key, payload, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
      if (res.status === 410 || res.status === 404) {
        await sb.from('push_subscriptions').delete().eq('id', sub.id);
      } else if (res.ok) {
        sent.push(sub.id);
      }
    } catch {}
  }
  return sent;
}

// Web Push with crypto.subtle (Cloudflare Workers compatible)
async function webpush(endpoint: string, p256dh: string, authKey: string, payload: string, vapidPub: string, vapidPriv: string) {
  const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  // VAPID JWT
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({ aud, exp, sub: 'mailto:noreply@labarberiaestadio.pages.dev' })));
  const unsignedToken = `${header}.${claims}`;

  const privKeyRaw = b64urlDecode(vapidPriv);
  const vapidKey = await crypto.subtle.importKey('pkcs8', buildPkcs8(privKeyRaw), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, new TextEncoder().encode(unsignedToken));
  const jwt = `${unsignedToken}.${b64url(derToRaw(new Uint8Array(sig)))}`;
  const vapidPubBytes = b64urlDecode(vapidPub);

  // Encrypt payload (RFC 8291)
  const clientPubBytes = b64urlDecode(p256dh);
  const authBytes = b64urlDecode(authKey);

  const localKey = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKey.publicKey));

  const clientPub = await crypto.subtle.importKey('raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, localKey.privateKey, 256));

  const authInfo = concatBytes(new TextEncoder().encode('WebPush: info\0'), clientPubBytes, localPubRaw);
  const ikm = await hkdf(authBytes, sharedSecret, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concatBytes(new TextEncoder().encode('Content-Encoding: aes128gcm\0'));
  const nonceInfo = concatBytes(new TextEncoder().encode('Content-Encoding: nonce\0'));
  const cek = await hkdf(salt, ikm, keyInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  const padded = concatBytes(new Uint8Array(new TextEncoder().encode(payload)), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const header8 = new Uint8Array(5);
  new DataView(header8.buffer).setUint32(0, 4096);
  header8[4] = localPubRaw.length;
  const body = concatBytes(salt, header8, localPubRaw, ciphertext);

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Authorization: `vapid t=${jwt}, k=${b64url(vapidPubBytes)}`,
    },
    body,
  });
}

function concatBytes(...arrays: Uint8Array[]) {
  const r = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrays) { r.set(a, o); o += a.length; }
  return r;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', salt.length ? salt : new Uint8Array(32), 'HKDF', false, ['deriveBits']);
  // HKDF not available in all CF Workers runtimes — use HMAC-based extract+expand
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC',
    await crypto.subtle.importKey('raw', salt.length ? salt : new Uint8Array(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    ikm));
  const hmacKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, concatBytes(info, new Uint8Array([1]))));
  return out.slice(0, len);
}

// Convert raw 32-byte private key to PKCS#8 DER for P-256
function buildPkcs8(rawPriv: Uint8Array) {
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  return concatBytes(prefix, rawPriv);
}

// DER-encoded ECDSA signature to raw 64-byte r||s
function derToRaw(der: Uint8Array) {
  const raw = new Uint8Array(64);
  let offset = 3;
  const rLen = der[offset++];
  const rStart = rLen > 32 ? offset + 1 : offset;
  raw.set(der.slice(rStart, rStart + 32), 0);
  offset += rLen + 1;
  const sLen = der[offset++];
  const sStart = sLen > 32 ? offset + 1 : offset;
  raw.set(der.slice(sStart, sStart + 32), 32);
  return raw;
}

function plantilla(cuerpo: string) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
body{font-family:system-ui,sans-serif;margin:0;padding:0;background:#0a0a1a;color:#e2e8f0}
.c{max-width:480px;margin:24px auto;background:#1a1a2e;border-radius:16px;padding:32px;border:1px solid #2d2d44}
h2{color:#a78bfa;margin:0 0 16px}
table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:6px 8px;border-bottom:1px solid #2d2d44}
.f{text-align:center;padding:24px;color:#64748b;font-size:12px}
</style></head><body><div class="c">${cuerpo}</div><div class="f">El Estadio Barbería</div></body></html>`;
}

import { connect } from 'cloudflare:sockets';

// Envío por SMTP a Gmail (gratis): TLS directo en el puerto 465 con contraseña de aplicación.
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (s: string) => btoa(Array.from(enc.encode(s), (c) => String.fromCharCode(c)).join(''));
const cabeceraUtf8 = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

export async function enviarGmail(
  env: { GMAIL_USER?: string; GMAIL_APP_PASSWORD?: string },
  p: { to: string; subject: string; html: string },
) {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return false;
  const socket = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
  const w = socket.writable.getWriter();
  const r = socket.readable.getReader();
  let buf = '';

  async function leer(): Promise<{ code: number; text: string }> {
    for (;;) {
      const lineas = buf.split('\r\n').filter(Boolean);
      const ultima = lineas[lineas.length - 1] ?? '';
      if (buf.endsWith('\r\n') && /^\d{3} /.test(ultima)) {
        const text = buf;
        buf = '';
        return { code: Number(ultima.slice(0, 3)), text };
      }
      const { value, done } = await r.read();
      if (done) throw new Error('El servidor SMTP cerró la conexión');
      buf += dec.decode(value);
    }
  }

  async function cmd(linea: string, esperado: number) {
    await w.write(enc.encode(linea + '\r\n'));
    const res = await leer();
    if (res.code !== esperado) throw new Error(`SMTP ${res.code}: ${res.text.slice(0, 200)}`);
  }

  try {
    const saludo = await leer();
    if (saludo.code !== 220) throw new Error('Saludo SMTP inválido');
    await cmd('EHLO labarberiaestadio.pages.dev', 250);
    await cmd('AUTH LOGIN', 334);
    await cmd(b64(env.GMAIL_USER), 334);
    await cmd(b64(env.GMAIL_APP_PASSWORD), 235);
    await cmd(`MAIL FROM:<${env.GMAIL_USER}>`, 250);
    await cmd(`RCPT TO:<${p.to}>`, 250);
    await cmd('DATA', 354);
    const cabecera = [
      `From: ${cabeceraUtf8('El Estadio Barbería')} <${env.GMAIL_USER}>`,
      `To: ${p.to}`,
      `Subject: ${cabeceraUtf8(p.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
    ].join('\r\n');
    const cuerpo = b64(p.html).replace(/.{1,76}/g, '$&\r\n');
    await cmd(cabecera + '\r\n' + cuerpo + '.', 250);
    await cmd('QUIT', 221);
    return true;
  } catch (err) {
    console.error('smtp', String(err));
    return false;
  } finally {
    await socket.close().catch(() => {});
  }
}

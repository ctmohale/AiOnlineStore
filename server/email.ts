import tls from 'node:tls';

type SendInput = { to:string; subject:string; text:string; html:string; from?:string; replyTo?:string };

const clean = (v:string) => v.replace(/[\r\n]/g, ' ').trim();
const b64 = (v:string) => Buffer.from(v, 'utf8').toString('base64');

async function response(socket: tls.TLSSocket) {
  return await new Promise<string>((resolve, reject) => {
    let data = '';
    const onData = (chunk: Buffer) => {
      data += chunk.toString();
      const lines = data.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || '';
      if (/^\d{3} /.test(last)) { cleanup(); resolve(data); }
    };
    const onError = (e:Error) => { cleanup(); reject(e); };
    const cleanup = () => { socket.off('data', onData); socket.off('error', onError); };
    socket.on('data', onData); socket.once('error', onError);
  });
}

async function cmd(socket:tls.TLSSocket, value:string, expected:number|number[]) {
  socket.write(value + '\r\n');
  const result = await response(socket);
  const code = Number(result.slice(0,3));
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(code)) throw new Error(`SMTP ${code}`);
}

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_PASSWORD?.trim() && (process.env.SMTP_USER?.trim() || 'info@mzansimegastore.co.za'));
}

export async function sendEmail(input:SendInput) {
  const host = process.env.SMTP_HOST?.trim() || 'cp75.domains.co.za';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim() || 'info@mzansimegastore.co.za';
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!password) throw new Error('SMTP_PASSWORD is not configured');
  const socket = tls.connect({host, port, servername:host, rejectUnauthorized:true});
  try {
    await new Promise<void>((resolve,reject)=>{ socket.once('secureConnect',()=>resolve()); socket.once('error',reject); });
    const greeting = await response(socket); if (!/^220 /.test(greeting)) throw new Error('SMTP greeting failed');
    await cmd(socket,'EHLO mzansimegastore.co.za',250);
    await cmd(socket,'AUTH LOGIN',334);
    await cmd(socket,b64(user),334);
    await cmd(socket,b64(password),235);
    const from = clean(input.from || process.env.SMTP_FROM || 'no-reply@mzansimegastore.co.za');
    const reply = clean(input.replyTo || process.env.SMTP_REPLY_TO || 'info@mzansimegastore.co.za');
    await cmd(socket,`MAIL FROM:<${from}>`,250);
    await cmd(socket,`RCPT TO:<${clean(input.to)}>`,[250,251]);
    await cmd(socket,'DATA',354);
    const text = input.text.replace(/\r?\n/g,'\r\n').replace(/^\./gm,'..');
    const html = input.html.replace(/\r?\n/g,'\r\n').replace(/^\./gm,'..');
    const subject = `=?UTF-8?B?${Buffer.from(clean(input.subject),'utf8').toString('base64')}?=`;
    const message = [
      `From: Mzansi Mega Store <${from}>`,`To: <${clean(input.to)}>`,`Reply-To: <${reply}>`,
      `Subject: ${subject}`,'MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="mms"',
      '','--mms','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',text,
      '','--mms','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: 8bit','',html,
      '','--mms--',''
    ].join('\r\n');
    socket.write(message+'\r\n.\r\n');
    await cmd(socket,'',250);
    await cmd(socket,'QUIT',221);
  } finally { socket.end(); }
}

const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const money=(v:number)=>`R${Number(v).toFixed(2)}`;

export async function sendOrderEmail(input:{
  to:string; name:string; reference:string; status:string; items:string; total:number;
  event:'received'|'payment'|'status'|'shipped'|'delivered'|'cancelled'|'refunded'|'payment_failed';
  paymentLink?:string|null; trackingUrl?:string|null; trackingNumber?:string|null;
}) {
  const titles = {
    received:'Order received', payment:'Payment confirmed', status:'Order update', shipped:'Your order has shipped',
    delivered:'Your order has been delivered', cancelled:'Order cancelled', refunded:'Refund processed', payment_failed:'Payment update'
  };
  const title=titles[input.event];
  const payment=input.paymentLink?`<p><a href="${esc(input.paymentLink)}">Continue to secure payment</a></p>`:'';
  const tracking=input.trackingUrl?`<p><a href="${esc(input.trackingUrl)}">Track your delivery</a></p>`:(input.trackingNumber?`<p>Tracking number: <strong>${esc(input.trackingNumber)}</strong></p>`:'');
  const text=[`Hi ${input.name||'there'},`,title,`Order: ${input.reference}`,`Items: ${input.items}`,`Total: ${money(input.total)}`,`Status: ${input.status}`,input.paymentLink?`Payment: ${input.paymentLink}`:'',input.trackingUrl?`Tracking: ${input.trackingUrl}`:'',input.trackingNumber?`Tracking number: ${input.trackingNumber}`:'','Mzansi Mega Store'].filter(Boolean).join('\n\n');
  await sendEmail({to:input.to,subject:`${title} - ${input.reference}`,text,html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px"><h2>${title}</h2><p>Hi ${esc(input.name||'there')},</p><p><strong>Order:</strong> ${esc(input.reference)}<br><strong>Items:</strong> ${esc(input.items)}<br><strong>Total:</strong> ${money(input.total)}<br><strong>Status:</strong> ${esc(input.status)}</p>${tracking}${payment}<p>Mzansi Mega Store</p></div>`});
}

export async function sendTestEmail(to:string) {
  await sendEmail({to,subject:'Mzansi Mega Store SMTP test',text:'SMTP email sending is working.',html:'<h2>SMTP test successful</h2><p>Mzansi Mega Store transactional email is working.</p>'});
}

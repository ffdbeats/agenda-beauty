// Agenda Beauty — versão de teste com login e sessão.
// IMPORTANTE: configure os segredos SESSION_SECRET e SETUP_SECRET no Cloudflare antes de usar.
// Versão de teste multi-salão: cada cadastro cria seu próprio salão e usuário.
// O salão legado da Mariana e seus dados são preservados.

const encoder = new TextEncoder();
const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers });
const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=UTF-8", ...headers } });
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromB64url = value => Uint8Array.from(
  atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)),
  c => c.charCodeAt(0)
);
const randomToken = (n = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return b64url(bytes);
};
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256"
  }, key, 256);
  return "pbkdf2$100000$" + salt + "$" + b64url(bits);
}
async function passwordMatches(password, stored) {
  try {
    const [kind, rounds, salt, expected] = stored.split("$");
    if (kind !== "pbkdf2" || Number(rounds) !== 100000 || !salt || !expected) return false;
    const actual = await passwordHash(password, salt);
    return actual === stored;
  } catch { return false; }
}
function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const found = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}
async function createSession(env, user) {
  const payload = b64url(encoder.encode(JSON.stringify({
    uid: user.id, salon_id: user.salon_id, role: user.role, exp: Math.floor(Date.now()/1000) + 60*60*24*7
  })));
  return payload + "." + await hmac(env.SESSION_SECRET, payload);
}
async function readSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const token = cookieValue(request, "agenda_session");
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = await hmac(env.SESSION_SECRET, parts[0]);
  if (expected !== parts[1]) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    if (!data.uid || !data.salon_id || !data.exp || data.exp < Math.floor(Date.now()/1000)) return null;
    const user = await env.DB.prepare(
      "SELECT id, salon_id, email, role, status FROM users WHERE id = ? AND salon_id = ?"
    ).bind(data.uid, data.salon_id).first();
    if (!user || user.status !== "active" || user.role !== data.role) return null;
    return user;
  } catch { return null; }
}
const sessionCookie = token =>
  "agenda_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800";
const clearCookie = "agenda_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    if (!env.DB) return new Response("Banco D1 ainda não está conectado ao Worker.", { status: 500 });
    const minutes = value => { const [h,m] = String(value || "00:00").split(":").map(Number); return h*60+m; };
    const fmt = n => String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
    const validTime = v => /^\d{2}:\d{2}$/.test(String(v)) && Number(v.slice(0,2)) <= 23 && Number(v.slice(3,5)) <= 59;
    const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const nowMinutes = () => minutes(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date()));
    const daysSet = days => {
      if (String(days||"").startsWith("Personalizado:")) return new Set(String(days).slice(14).split(",").map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6));
      if (days==="Todos os dias") return new Set([0,1,2,3,4,5,6]);
      if (days==="Segunda a sábado") return new Set([1,2,3,4,5,6]);
      return new Set([1,2,3,4,5]);
    };
    const session = await readSession(request, env);

    if ((url.pathname === "/login" || url.pathname === "/entrar") && method === "GET") {
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar — Agenda Beauty</title>
      <style>body{font-family:Arial;background:#fff8f7;color:#35252c;padding:20px}main{max-width:420px;margin:8vh auto;background:white;border:1px solid #eadde2;border-radius:16px;padding:22px}h1{color:#a34370}label{display:block;margin:15px 0 6px;font-weight:bold}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #d9cbd1;border-radius:9px;font-size:16px}button{margin-top:18px;width:100%;padding:14px;background:#a34370;color:white;border:0;border-radius:9px;font-weight:bold;font-size:16px}p{line-height:1.5;color:#75656d}</style>
      <main><h1>Agenda Beauty</h1><p>Entre para configurar sua agenda.</p><form id="f"><label>E-mail</label><input id="email" type="email" autocomplete="username" required><label>Senha</label><input id="password" type="password" autocomplete="current-password" required><button>Entrar</button><p id="msg" role="status"></p></form><p>Primeira vez aqui? <a href="/criar-conta">Criar conta e cadastrar meu salão</a></p></main>
      <script>
      const byId=id=>document.getElementById(id);
      async function readApiResponse(response){const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error("O servidor devolveu uma página HTML em vez de JSON. Isso normalmente indica que a rota da API não chegou ao código publicado correto. Atualize a implantação do Worker e tente novamente.")};if(!response.ok)throw new Error(data.error||("Erro HTTP "+response.status));return data}
      byId("f").addEventListener("submit",async e=>{e.preventDefault();byId("msg").textContent="Verificando...";byId("f").querySelector("button").disabled=true;try{await readApiResponse(await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({email:byId("email").value.trim(),password:byId("password").value})}));location.href="/"}catch(e){byId("msg").textContent=e.message}finally{byId("f").querySelector("button").disabled=false}});
      </script></html>`);
    }
    if ((url.pathname === "/criar-conta" || url.pathname === "/cadastro") && method === "GET") {
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Criar conta — Agenda Beauty</title><style>body{font-family:Arial;background:#fff8f7;color:#35252c;padding:20px}main{max-width:440px;margin:5vh auto;background:white;padding:22px;border-radius:15px;border:1px solid #eadde2}h1{color:#a34370}label{display:block;margin:14px 0 6px;font-weight:bold}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d9cbd1;border-radius:8px;font-size:16px}button{margin-top:18px;padding:13px;background:#a34370;color:white;border:0;border-radius:8px;width:100%;font-weight:bold}#msg{overflow-wrap:anywhere;line-height:1.45}p{line-height:1.5}</style><main><h1>Agenda Beauty</h1><h2>Crie sua conta profissional</h2><p>Cadastre seu espaço e depois configure seus serviços, preços e horários no painel.</p><form id="f"><label for="salon">Nome do salão ou espaço</label><input id="salon" maxlength="80" required autocomplete="organization"><label for="email">Seu e-mail</label><input id="email" type="email" maxlength="254" required autocomplete="email"><label for="password">Crie uma senha (mínimo 12 caracteres)</label><input id="password" type="password" minlength="12" maxlength="200" required autocomplete="new-password"><button type="submit">Criar conta e entrar</button><p id="msg" role="status"></p></form><p>Já tem conta? <a href="/login">Entrar</a></p></main><script>const $=id=>document.getElementById(id);$('f').onsubmit=async e=>{e.preventDefault();let b=$('f').querySelector('button');b.disabled=true;$('msg').textContent='Criando conta e salão...';try{let r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({salon:$('salon').value.trim(),email:$('email').value.trim(),password:$('password').value})});let d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível criar a conta');$('msg').textContent='Conta criada! Abrindo seu painel...';location.href='/'}catch(e){$('msg').textContent=e.message}finally{b.disabled=false}};</script></html>`);
    }
    if (url.pathname === "/api/register" && method === "POST") {
      if (!env.SESSION_SECRET) return json({error:"Configure SESSION_SECRET no Cloudflare."},500);
      let data; try { data=await request.json(); } catch { return json({error:"Dados inválidos."},400); }
      const salonName=String(data.salon||"").trim(), email=String(data.email||"").trim().toLowerCase(), password=String(data.password||"");
      if (salonName.length<2 || salonName.length>80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<12 || password.length>200) return json({error:"Informe o nome do espaço, um e-mail válido e uma senha de 12 a 200 caracteres."},400);
      const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first(); if(exists) return json({error:"Esse e-mail já tem cadastro. Entre pela página de login."},409);
      const hash=await passwordHash(password,randomToken(16));
      const slugBase=(salonName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24)||"studio");
      const slug=slugBase+"-"+randomToken(9).toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,8);
      let salonId=null;
      try {
        const created=await env.DB.prepare("INSERT INTO salons (name,slug,status) VALUES (?,?, 'active')").bind(salonName,slug).run();
        salonId=created.meta.last_row_id;
        await env.DB.prepare("INSERT INTO users (salon_id,email,password_hash,role,status) VALUES (?,?,?, 'salon_owner','active')").bind(salonId,email,hash).run();
      } catch (e) {
        if(salonId!==null){try{await env.DB.prepare("DELETE FROM salons WHERE id=?").bind(salonId).run()}catch{}}
        return json({error:"Não foi possível criar a conta. Confira se as tabelas salons e users existem no D1 e se as colunas name, slug, status, salon_id, email, password_hash, role e status estão disponíveis."},500);
      }
      const user=await env.DB.prepare("SELECT id,salon_id,email,role,status FROM users WHERE email=?").bind(email).first();
      const token=await createSession(env,user);
      return json({ok:true,bookingUrl:"/agendar?espaco="+slug},200,{"Set-Cookie":sessionCookie(token),"Cache-Control":"no-store"});
    }
    if ((url.pathname === "/configurar-acesso" || url.pathname === "/primeiro-acesso" || url.pathname === "/setup") && method === "GET") {
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      if (Number(count?.n || 0) > 0) return html("<h1>Configuração inicial já encerrada.</h1>", 410);
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Criar acesso — Agenda Beauty</title><style>body{font-family:Arial;background:#fff8f7;padding:20px;color:#35252c}main{max-width:440px;margin:auto;background:white;padding:22px;border-radius:15px;border:1px solid #eadde2}label{display:block;margin:14px 0 6px;font-weight:bold}input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d9cbd1;border-radius:8px;font-size:16px}button{margin-top:18px;padding:13px;background:#a34370;color:white;border:0;border-radius:8px;width:100%;font-weight:bold}#msg{overflow-wrap:anywhere;line-height:1.45}</style><main><h1>Agenda Beauty</h1><h2>Criar primeiro acesso</h2><p>Esta página só funciona enquanto ainda não existe nenhum usuário.</p><form id="f"><label for="setupSecret">Chave de configuração (SETUP_SECRET)</label><input id="setupSecret" type="password" autocomplete="off" required><label for="email">Seu e-mail</label><input id="email" type="email" autocomplete="email" required><label for="password">Crie uma senha (mínimo 12 caracteres)</label><input id="password" type="password" minlength="12" autocomplete="new-password" required><button type="submit">Criar acesso</button><p id="msg" role="status"></p></form><p><a href="/login">Já tenho acesso — entrar</a></p></main><script>
      const byId=id=>document.getElementById(id);
      async function readApiResponse(response){const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw new Error("O servidor devolveu HTML em vez de JSON. A rota /api/setup-owner não está chegando à API esperada. Confira se esta versão foi publicada no Cloudflare.")};if(!response.ok)throw new Error(data.error||("Erro HTTP "+response.status));return data}
      byId("f").addEventListener("submit",async e=>{e.preventDefault();const button=byId("f").querySelector("button");button.disabled=true;byId("msg").textContent="Criando acesso...";try{await readApiResponse(await fetch("/api/setup-owner",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({setupSecret:byId("setupSecret").value,email:byId("email").value.trim(),password:byId("password").value})}));byId("msg").textContent="Acesso criado. Abrindo login...";location.href="/login"}catch(e){byId("msg").textContent=e.message}finally{button.disabled=false}});
      </script></html>`);
    }
    if (url.pathname === "/api/setup-owner" && method === "POST") {
      if (!env.SETUP_SECRET || !env.SESSION_SECRET) return json({error:"Configure os segredos SETUP_SECRET e SESSION_SECRET no Cloudflare."},500);
      let data; try { data = await request.json(); } catch { return json({error:"Dados inválidos."},400); }
      if (typeof data.setupSecret !== "string" || data.setupSecret !== env.SETUP_SECRET) return json({error:"Chave de configuração incorreta."},403);
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      if (Number(count?.n || 0) !== 0) return json({error:"O primeiro acesso já foi criado. Esta etapa está encerrada."},409);
      const email = String(data.email||"").trim().toLowerCase();
      const password = String(data.password||"");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 200)
        return json({error:"Informe um e-mail válido e uma senha de 12 a 200 caracteres."},400);
      const salon = await env.DB.prepare("SELECT id FROM salons WHERE id = 1 AND status = 'active'").first();
      if (!salon) return json({error:"Não encontrei o salão de teste ativo (ID 1)."},500);
      const hash = await passwordHash(password, randomToken(16));
      try {
        await env.DB.prepare("INSERT INTO users (salon_id,email,password_hash,role,status) VALUES (1,?,?, 'salon_owner','active')")
          .bind(email, hash).run();
      } catch { return json({error:"Não foi possível criar o usuário. Confira se o e-mail já existe."},400); }
      return json({ok:true,message:"Acesso criado. Agora entre pela página de login."});
    }
    if (url.pathname === "/api/login" && method === "POST") {
      if (!env.SESSION_SECRET) return json({error:"O segredo SESSION_SECRET ainda não foi configurado no Cloudflare."},500);
      let data; try { data = await request.json(); } catch { return json({error:"Dados inválidos."},400); }
      const email = String(data.email||"").trim().toLowerCase();
      const password = String(data.password||"");
      if (!email || !password || email.length > 254 || password.length > 200) return json({error:"Confira o e-mail e a senha."},400);
      const user = await env.DB.prepare("SELECT id,salon_id,email,password_hash,role,status FROM users WHERE email = ?").bind(email).first();
      if (!user || user.status !== "active" || !await passwordMatches(password,user.password_hash))
        return json({error:"E-mail ou senha incorretos."},401);
      if (user.role !== "salon_owner" && user.role !== "platform_admin") return json({error:"Este usuário não tem permissão para acessar esta área."},403);
      const token = await createSession(env,user);
      return json({ok:true},200,{"Set-Cookie":sessionCookie(token),"Cache-Control":"no-store"});
    }
    if (url.pathname === "/sair") return new Response(null,{status:302,headers:{"Location":"/login","Set-Cookie":clearCookie,"Cache-Control":"no-store"}});
    if (url.pathname === "/api/logout" && method === "POST") return json({ok:true},200,{"Set-Cookie":clearCookie,"Cache-Control":"no-store"});

    const privateApi = url.pathname === "/api/config" || (url.pathname === "/api/appointments" && method === "GET") || url.pathname === "/api/appointment-status";
    if (privateApi && !session) {
      if (url.pathname === "/api/appointments" && method === "POST") { /* agendamento público */ }
      else return json({error:"Faça login para acessar esta área."},401);
    }
    if (url.pathname === "/" && !session) {
      const ownerCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      const destination = "/login";
      return new Response(null,{status:302,headers:{Location:destination,"Cache-Control":"no-store"}});
    }
    if (url.pathname === "/" && session && session.role !== "salon_owner" && session.role !== "platform_admin")
      return new Response("Acesso negado.",{status:403});

    if (url.pathname === "/api/my-salon" && method === "GET") {
      if(!session) return json({error:"Faça login."},401);
      const salon=await env.DB.prepare("SELECT id,name,slug,status FROM salons WHERE id=?").bind(session.salon_id).first();
      if(!salon) return json({error:"Salão não encontrado."},404);
      return json({salon,bookingUrl:"/agendar?espaco="+salon.slug});
    }
    if (url.pathname === "/api/config" && method === "GET") {
      try {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS salon_settings (salon_id INTEGER PRIMARY KEY, confirmation_mode TEXT NOT NULL DEFAULT 'manual')").run();
        const setting = await env.DB.prepare("SELECT confirmation_mode FROM salon_settings WHERE salon_id=?").bind(session.salon_id).first();
        const professional = await env.DB.prepare("SELECT * FROM professionals WHERE salon_id = ? ORDER BY id LIMIT 1").bind(session.salon_id).first();
        if (!professional) return json({configured:false});
        const result = await env.DB.prepare("SELECT name,price,duration FROM services WHERE salon_id = ? AND professional_id = ? AND name NOT LIKE '[Arquivado] %' ORDER BY id")
          .bind(session.salon_id,professional.id).all();
        return json({configured:true,professional,services:result.results,confirmation_mode:setting?.confirmation_mode||"manual"});
      } catch { return json({error:"Não foi possível carregar os dados."},500); }
    }
    if (url.pathname === "/api/config" && method === "POST") {
      try {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS salon_settings (salon_id INTEGER PRIMARY KEY, confirmation_mode TEXT NOT NULL DEFAULT 'manual')").run();
        const data = await request.json();
        const confirmationMode = data.confirmation_mode === "automatic" ? "automatic" : "manual";
        await env.DB.prepare("INSERT INTO salon_settings (salon_id,confirmation_mode) VALUES (?,?) ON CONFLICT(salon_id) DO UPDATE SET confirmation_mode=excluded.confirmation_mode").bind(session.salon_id,confirmationMode).run();
        const name = String(data.name||"").trim(), category = String(data.category||"").trim();
        const accent = /^#[0-9a-fA-F]{6}$/.test(data.accent) ? data.accent : "#a34370";
        const days = String(data.days||"Segunda a sexta"), start = String(data.start||"09:00"), end = String(data.end||"18:00");
        const prep = Number(data.prep_minutes ?? 10), services = data.services;
        if (!name || name.length>120 || !category || category.length>100 || !Array.isArray(services)) return json({error:"Confira o nome, a categoria e os serviços."},400);
        if (services.length>100) return json({error:"Limite de 100 serviços."},400);
        if (!validTime(start)||!validTime(end)||minutes(start)>=minutes(end)) return json({error:"Confira os horários de atendimento."},400);
        if (!Number.isInteger(prep)||prep<0||prep>180) return json({error:"Preparação deve ser de 0 a 180 minutos."},400);
        const names = new Set();
        for (const s of services) {
          const n=String(s.name||"").trim();
          if (!n||n.length>120||n.startsWith("[Arquivado] ")||names.has(n.toLowerCase())||!Number.isFinite(Number(s.price))||Number(s.price)<0||!Number.isInteger(Number(s.duration))||Number(s.duration)<1||Number(s.duration)>1440)
            return json({error:"Confira nomes, preços e durações dos serviços. Não repita nomes."},400);
          names.add(n.toLowerCase());
        }
        let professional = await env.DB.prepare("SELECT id FROM professionals WHERE salon_id = ? ORDER BY id LIMIT 1").bind(session.salon_id).first();
        if (professional) {
          await env.DB.prepare("UPDATE professionals SET name=?,category=?,accent_color=?,work_days=?,start_time=?,end_time=?,prep_minutes=? WHERE id=? AND salon_id=?")
            .bind(name,category,accent,days,start,end,prep,professional.id,session.salon_id).run();
        } else {
          await env.DB.prepare("INSERT INTO professionals (salon_id,name,category,accent_color,work_days,start_time,end_time,prep_minutes) VALUES (?,?,?,?,?,?,?,?)")
            .bind(session.salon_id,name,category,accent,days,start,end,prep).run();
          professional = await env.DB.prepare("SELECT id FROM professionals WHERE salon_id = ? ORDER BY id DESC LIMIT 1").bind(session.salon_id).first();
        }
        const pid = professional.id;
        const existing = (await env.DB.prepare("SELECT id,name FROM services WHERE salon_id=? AND professional_id=?").bind(session.salon_id,pid).all()).results;
        const used = new Set();
        for (const s of services) {
          const n=String(s.name).trim(), match=existing.find(x=>x.name===n&&!used.has(x.id));
          if (match) {
            used.add(match.id);
            await env.DB.prepare("UPDATE services SET price=?,duration=? WHERE id=? AND salon_id=? AND professional_id=?")
              .bind(Number(s.price),Number(s.duration),match.id,session.salon_id,pid).run();
          } else {
            await env.DB.prepare("INSERT INTO services (salon_id,professional_id,name,price,duration) VALUES (?,?,?,?,?)")
              .bind(session.salon_id,pid,n,Number(s.price),Number(s.duration)).run();
          }
        }
        for (const item of existing) {
          if (used.has(item.id)) continue;
          const booked = await env.DB.prepare("SELECT id FROM appointments WHERE salon_id=? AND service_id=? LIMIT 1").bind(session.salon_id,item.id).first();
          if (booked) {
            if (!item.name.startsWith("[Arquivado] ")) await env.DB.prepare("UPDATE services SET name=? WHERE id=? AND salon_id=?").bind("[Arquivado] "+item.name,item.id,session.salon_id).run();
          } else await env.DB.prepare("DELETE FROM services WHERE id=? AND salon_id=?").bind(item.id,session.salon_id).run();
        }
        return json({ok:true,message:"Configuração salva!"});
      } catch { return json({error:"Erro ao salvar. Confira as colunas do banco e tente novamente."},500); }
    }

    const publicSalon = async () => {
      const slug = String(url.searchParams.get("espaco") || "").trim();
      if (!slug || slug.length > 100) return null;
      return await env.DB.prepare("SELECT id, name, slug FROM salons WHERE slug=? AND status='active'").bind(slug).first();
    };
    if (url.pathname === "/api/public-config" && method === "GET") {
      try {
        const salon=await publicSalon(); if(!salon) return json({error:"Link de agendamento inválido. Peça à profissional o link correto."},404);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS salon_settings (salon_id INTEGER PRIMARY KEY, confirmation_mode TEXT NOT NULL DEFAULT 'manual')").run();
        const setting=await env.DB.prepare("SELECT confirmation_mode FROM salon_settings WHERE salon_id=?").bind(salon.id).first();
        const p=await env.DB.prepare("SELECT name,category,accent_color,work_days,start_time,end_time,prep_minutes FROM professionals WHERE salon_id=? ORDER BY id LIMIT 1").bind(salon.id).first();
        if(!p) return json({error:"Este espaço ainda não foi configurado pela profissional."},404);
        const professional=await env.DB.prepare("SELECT id FROM professionals WHERE salon_id=? ORDER BY id LIMIT 1").bind(salon.id).first();
        const services=await env.DB.prepare("SELECT id,name,price,duration FROM services WHERE salon_id=? AND professional_id=? AND name NOT LIKE '[Arquivado] %' ORDER BY id").bind(salon.id,professional.id).all();
        return json({salon:{name:salon.name,slug:salon.slug},professional,services:services.results,confirmation_mode:setting?.confirmation_mode||"manual"});
      } catch { return json({error:"Não foi possível carregar os serviços."},500); }
    }
    if (url.pathname === "/api/availability" && method === "GET") {
      try {
        const date=url.searchParams.get("date")||"", sid=Number(url.searchParams.get("service_id"));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(sid)) return json({error:"Escolha a data e o serviço."},400);
        const dt=new Date(date+"T12:00:00Z"); if(Number.isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==date) return json({error:"Data inválida."},400);
        if(date<today()) return json({slots:[]});
        const salon=await publicSalon(); if(!salon) return json({error:"Link de agendamento inválido."},404);
        const p=await env.DB.prepare("SELECT * FROM professionals WHERE salon_id=? ORDER BY id LIMIT 1").bind(salon.id).first();
        const s=await env.DB.prepare("SELECT id,duration FROM services WHERE id=? AND salon_id=? AND name NOT LIKE '[Arquivado] %'").bind(sid,salon.id).first();
        if(!p||!s) return json({error:"Profissional ou serviço não encontrado."},404);
        if(!daysSet(p.work_days).has(dt.getUTCDay())) return json({slots:[]});
        const opening=minutes(p.start_time),closing=minutes(p.end_time),duration=Number(s.duration),prep=Number(p.prep_minutes??10);
        const rows=await env.DB.prepare("SELECT a.appointment_time,s.duration FROM appointments a JOIN services s ON s.id=a.service_id AND s.salon_id=a.salon_id WHERE a.salon_id=? AND a.professional_id=? AND a.appointment_date=? AND (a.status IS NULL OR a.status!='cancelled')").bind(salon.id,p.id,date).all();
        const occupied=rows.results.map(x=>({start:minutes(x.appointment_time),end:minutes(x.appointment_time)+Number(x.duration)+prep}));
        const candidates=new Set(); for(let t=opening;t+duration<=closing;t+=30)candidates.add(t);
        for(const x of occupied)if(x.end>=opening&&x.end+duration<=closing)candidates.add(x.end);
        let slots=[...candidates].filter(t=>t>=opening&&t+duration<=closing&&!occupied.some(x=>t<x.end&&t+duration>x.start)).sort((a,b)=>a-b).map(fmt);
        if(date===today())slots=slots.filter(t=>minutes(t)>nowMinutes());
        return json({slots});
      } catch { return json({error:"Não foi possível consultar os horários."},500); }
    }
    if (url.pathname === "/api/appointments" && method === "POST") {
      try {
        const d=await request.json(),sid=Number(d.service_id),name=String(d.customer_name||"").trim(),phone=String(d.customer_phone||"").trim(),date=String(d.date||""),time=String(d.time||"");
        if(!name||name.length>100||!phone||phone.length>25||!Number.isInteger(sid)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validTime(time))return json({error:"Preencha todos os campos corretamente."},400);
        const dt=new Date(date+"T12:00:00Z");if(Number.isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==date||date<today())return json({error:"Escolha uma data válida, hoje ou futura."},400);
        const salon=await publicSalon(); if(!salon) return json({error:"Link de agendamento inválido."},404);
        const p=await env.DB.prepare("SELECT * FROM professionals WHERE salon_id=? ORDER BY id LIMIT 1").bind(salon.id).first();
        const s=await env.DB.prepare("SELECT id,duration FROM services WHERE id=? AND salon_id=? AND name NOT LIKE '[Arquivado] %'").bind(sid,salon.id).first();
        if(!p||!s)return json({error:"Selecione um serviço válido."},400);
        const requested=minutes(time),opening=minutes(p.start_time),closing=minutes(p.end_time),duration=Number(s.duration),prep=Number(p.prep_minutes??10);
        if(requested<opening||requested+duration>closing||!daysSet(p.work_days).has(dt.getUTCDay())||(date===today()&&requested<=nowMinutes()))return json({error:"Escolha um horário válido."},400);
        const rows=await env.DB.prepare("SELECT a.appointment_time,s.duration FROM appointments a JOIN services s ON s.id=a.service_id AND s.salon_id=a.salon_id WHERE a.salon_id=? AND a.professional_id=? AND a.appointment_date=? AND (a.status IS NULL OR a.status!='cancelled')").bind(salon.id,p.id,date).all();
        const occupied=rows.results.map(x=>({start:minutes(x.appointment_time),end:minutes(x.appointment_time)+Number(x.duration)+prep}));
        const candidates=new Set();for(let t=opening;t+duration<=closing;t+=30)candidates.add(t);for(const x of occupied)if(x.end>=opening&&x.end+duration<=closing)candidates.add(x.end);
        if(![...candidates].some(t=>t===requested&&t+duration<=closing&&!occupied.some(x=>t<x.end&&t+duration>x.start)))return json({error:"Esse horário não está mais disponível. Escolha outro."},409);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS salon_settings (salon_id INTEGER PRIMARY KEY, confirmation_mode TEXT NOT NULL DEFAULT 'manual')").run();
        const setting=await env.DB.prepare("SELECT confirmation_mode FROM salon_settings WHERE salon_id=?").bind(salon.id).first();
        const appointmentStatus = setting?.confirmation_mode === "automatic" ? "confirmed" : "pending";
        await env.DB.prepare("INSERT INTO appointments (salon_id,professional_id,service_id,customer_name,customer_phone,appointment_date,appointment_time,status) VALUES (?,?,?,?,?,?,?,?)")
          .bind(salon.id,p.id,sid,name,phone,date,time,appointmentStatus).run();
        return json({ok:true,status:appointmentStatus,message:appointmentStatus==="confirmed"?"Agendamento confirmado!":"Solicitação enviada; aguardando confirmação da profissional."});
      } catch { return json({error:"Não foi possível registrar a solicitação."},500); }
    }
    if (url.pathname === "/api/appointment-status" && method === "POST") {
      try {
        const data = await request.json();
        const id = Number(data.id), status = String(data.status||"");
        if (!Number.isInteger(id) || !["confirmed","cancelled"].includes(status)) return json({error:"Dados de confirmação inválidos."},400);
        const result = await env.DB.prepare("UPDATE appointments SET status=? WHERE id=? AND salon_id=?").bind(status,id,session.salon_id).run();
        if (!result.meta?.changes) return json({error:"Agendamento não encontrado neste salão."},404);
        return json({ok:true,status});
      } catch { return json({error:"Não foi possível atualizar o status do agendamento."},500); }
    }
    if (url.pathname === "/api/appointments" && method === "GET") {
      try {
        const p=await env.DB.prepare("SELECT id FROM professionals WHERE salon_id=? ORDER BY id LIMIT 1").bind(session.salon_id).first();
        if(!p)return json({appointments:[]});
        const rows=await env.DB.prepare("SELECT a.id,a.customer_name,a.customer_phone,a.appointment_date,a.appointment_time,a.status,s.name AS service_name FROM appointments a JOIN services s ON s.id=a.service_id AND s.salon_id=a.salon_id WHERE a.salon_id=? AND a.professional_id=? AND a.appointment_date>=? AND (a.status IS NULL OR a.status!='cancelled') ORDER BY a.appointment_date,a.appointment_time LIMIT 200")
          .bind(session.salon_id,p.id,today()).all();
        return json({appointments:rows.results});
      } catch { return json({error:"Não foi possível carregar os agendamentos."},500); }
    }
    if (url.pathname === "/agendar" && method === "GET") {
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agendar atendimento</title><style>
:root{--accent:#a34370;--ink:#30232b;--muted:#786b73;--line:#eee1e7;--soft:#fff1f6}
*{box-sizing:border-box}body{margin:0;padding:22px 14px 40px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(ellipse at top left,#ffe5ef 0,transparent 42%),linear-gradient(180deg,#fff8fb 0%,#fff 70%);color:var(--ink)}main{max-width:540px;margin:0 auto}.card{background:rgba(255,255,255,.96);padding:clamp(20px,5vw,30px);border-radius:25px;border:1px solid rgba(238,225,231,.95);box-shadow:0 18px 50px rgba(100,42,72,.09)}h1{color:var(--accent,#a34370);font-size:clamp(27px,7vw,34px);letter-spacing:-.8px;line-height:1.12;margin:4px 0 8px}#category{margin:0 0 22px;color:var(--muted);font-size:15px;line-height:1.55}label{display:block;font-weight:750;font-size:14px;margin:21px 0 9px;color:#44323c}input,select{display:block;width:100%;min-height:49px;padding:13px 14px;border:1px solid #e5d6de;border-radius:13px;font-size:16px;background:#fff;color:var(--ink);outline:none}input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}.slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.weekdays{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}.weekday{min-height:60px;padding:10px 3px;border:1px solid #eadce3;border-radius:13px;background:#fff;color:var(--muted);font-size:12px;box-shadow:0 2px 5px rgba(65,30,48,.025)}.weekday b{display:block;font-size:19px;margin-top:4px;color:var(--ink)}.weekday.selected{background:var(--accent,#a34370);color:#fff;border-color:var(--accent,#a34370)}.weekday.selected b{color:#fff}.slot,button{min-height:45px;padding:11px 9px;border-radius:12px;border:1px solid #e7d9e0;background:white;color:var(--ink);font-weight:700;font-size:14px}.slot.selected,.weekday.selected{background:var(--accent,#a34370);color:white;border-color:var(--accent,#a34370)}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.row .slot{font-size:12px;color:#674655;background:var(--soft);border-color:#f0d9e4}.submit{width:100%;min-height:53px;margin-top:24px;border:0;border-radius:15px;background:var(--accent,#a34370);color:white;font-size:16px;box-shadow:0 8px 18px color-mix(in srgb,var(--accent) 24%,transparent)}.submit:active,button:active{transform:scale(.99)}p{line-height:1.55;color:var(--muted)}#msg{margin:16px 0 0;padding:0;overflow-wrap:anywhere;font-size:14px}#msg:not(:empty){padding:12px 14px;background:#fff4f8;border-radius:12px}button:focus-visible{outline:3px solid #dba4bd;outline-offset:2px}@media(min-width:480px){.weekdays{grid-template-columns:repeat(7,minmax(0,1fr))}}
</style><main><div class="card"><h1 id="title">Agendar atendimento</h1><p id="category">Escolha o serviço e o horário.</p><form id="f"><label>Serviço</label><select id="service" required></select><label>Escolha o dia</label><div id="weekPicker" class="weekdays"></div><input id="date" type="hidden" required><div class="row"><button type="button" id="prevWeek" class="slot">← 7 dias anteriores</button><button type="button" id="nextWeek" class="slot">Próximos 7 dias →</button></div><label>Horários disponíveis</label><div id="slots" class="slots"></div><input id="time" type="hidden" required><label>Seu nome</label><input id="name" maxlength="100" required><label>WhatsApp com DDD</label><input id="phone" maxlength="25" type="tel" required><button class="submit">Solicitar agendamento</button><p id="msg"></p></form></div></main><script>
const $=id=>document.getElementById(id);let chosen="";const salonSlug=new URLSearchParams(location.search).get("espaco")||"";if(!salonSlug){document.getElementById("msg").textContent="Este link não identifica um salão. Abra o link fornecido pela profissional.";}const dayLabels=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];let weekOffset=0;function localDate(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}function renderWeek(){const box=$("weekPicker");box.replaceChildren();const base=new Date();base.setHours(12,0,0,0);base.setDate(base.getDate()+weekOffset*7);for(let i=0;i<7;i++){const d=new Date(base);d.setDate(base.getDate()+i);const value=localDate(d);const b=document.createElement("button");b.type="button";b.className="weekday"+(date.value===value?" selected":"");b.innerHTML=dayLabels[d.getDay()]+"<b>"+d.getDate()+"</b>";b.onclick=()=>{date.value=value;renderWeek();slots()};box.append(b)}}$("prevWeek").onclick=()=>{if(weekOffset>0){weekOffset--;date.value="";renderWeek();slots()}};$("nextWeek").onclick=()=>{weekOffset++;date.value="";renderWeek();slots()};renderWeek();
async function slots(){chosen="";time.value="";slotsBox.replaceChildren();if(!service.value||!date.value)return;try{let r=await fetch("/api/availability?"+new URLSearchParams({date:date.value,service_id:service.value,espaco:salonSlug}));let d=await r.json();if(!r.ok)throw Error(d.error);if(!d.slots.length){slotsBox.textContent="Sem horários disponíveis.";return}d.slots.forEach(t=>{let b=document.createElement("button");b.type="button";b.className="slot";b.textContent=t;b.onclick=()=>{document.querySelectorAll(".slot").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");chosen=t;time.value=t};slotsBox.append(b)})}catch(e){msg.textContent=e.message}}
const slotsBox=$("slots");service.onchange=()=>{renderWeek();slots()};
fetch("/api/public-config?"+new URLSearchParams({espaco:salonSlug})).then(async r=>{let d=await r.json();if(!r.ok)throw Error(d.error);title.textContent=d.professional.name;category.textContent=d.professional.category;document.documentElement.style.setProperty("--accent",d.professional.accent_color||"#a34370");service.innerHTML='<option value="">Selecione</option>';d.services.forEach(s=>{let o=document.createElement("option");o.value=s.id;o.textContent=s.name+" — R$ "+Number(s.price).toFixed(2).replace(".",",")+" ("+s.duration+" min)";service.append(o)})}).catch(e=>msg.textContent=e.message);
f.onsubmit=async e=>{e.preventDefault();if(!chosen){msg.textContent="Escolha um horário.";return}msg.textContent="Enviando...";try{let r=await fetch("/api/appointments?"+new URLSearchParams({espaco:salonSlug}),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service_id:service.value,date:date.value,time:chosen,customer_name:$("name").value.trim(),customer_phone:$("phone").value.trim()})});let d=await r.json();if(!r.ok)throw Error(d.error);msg.textContent=d.message||"Solicitação registrada!";f.reset();slotsBox.replaceChildren();chosen="";date.value="";renderWeek()}catch(e){msg.textContent=e.message;await slots()}}</script></html>`);
    }
    if (url.pathname === "/" && method === "GET") {
      // Interface administrativa simplificada, protegida por login.
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agenda Beauty</title><style>body{font-family:Arial;background:#fff8f7;color:#35252c;margin:0}header{background:white;padding:18px;border-bottom:1px solid #eadde2;display:flex;justify-content:space-between;align-items:center;gap:10px}h1,h2{color:#a34370}main{max-width:720px;margin:auto;padding:18px}.card{background:white;border:1px solid #eadde2;border-radius:14px;padding:18px;margin:14px 0}label{display:block;font-weight:bold;margin:13px 0 6px}input,select{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d9cbd1;border-radius:9px;font-size:16px}button{padding:12px;border:0;border-radius:9px;background:#a34370;color:white;font-weight:bold;margin-top:10px}.service{padding:10px 0;border-bottom:1px solid #eee}.secondary{background:#f8eaf0;color:#84365c}.row{display:flex;gap:10px}.weekdays{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0 14px}.weekday{padding:12px 4px;border:1px solid #d9cbd1;border-radius:9px;background:#fff;color:#75656d;text-align:center}.weekday.on{background:#a34370;color:white;border-color:#a34370}.row>div{flex:1;min-width:0}a{color:#84365c;overflow-wrap:anywhere}p{line-height:1.5;color:#75656d}</style><header><h1>Agenda Beauty</h1><a href="/sair">Sair</a></header><main><section class="card"><h2>Configuração</h2><label>Confirmação dos agendamentos</label><select id="confirmationMode"><option value="manual">Manual — confirmar cada pedido</option><option value="automatic">Automática — confirmar ao reservar</option></select><label>Nome do espaço</label><input id="business" placeholder="Studio da Maria"><label>Tipo de atendimento</label><input id="category" placeholder="Unhas, cílios, etc."><label>Cor da página</label><input id="accent" type="color" value="#a34370"><div><label>Dias em que atende</label><div id="weekdayToggles" class="weekdays"></div></div><div class="row"><div><label>Preparação (min)</label><input id="prep" type="number" min="0" max="180" value="10"></div></div><div class="row"><div><label>Abre</label><input id="start" type="time" value="09:00"></div><div><label>Fecha</label><input id="end" type="time" value="18:00"></div></div></section><section class="card"><h2>Adicionar serviço</h2><label>Nome</label><input id="sn" placeholder="Manicure"><div class="row"><div><label>Preço (R$)</label><input id="price" type="number" min="0" step=".01"></div><div><label>Duração (min)</label><input id="duration" type="number" min="1" max="1440" value="60"></div></div><button id="add">Adicionar serviço</button><div id="services"></div><button id="save">Salvar configuração</button><p id="status"></p></section><section class="card"><h2>Próximos agendamentos</h2><button id="refresh" class="secondary">Atualizar</button><div id="appointments"></div><p>Link público do seu salão: <a id="bookingLink" href="#" target="_blank">Carregando link...</a></p></section></main><script>
const $=id=>document.getElementById(id);let services=[];const weekdayNames=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];let activeDays=new Set([1,2,3,4,5]);
function renderWeekdays(){const box=$("weekdayToggles");box.replaceChildren();weekdayNames.forEach((label,day)=>{const b=document.createElement("button");b.type="button";b.className="weekday"+(activeDays.has(day)?" on":"");b.textContent=label;b.setAttribute("aria-pressed",String(activeDays.has(day)));b.onclick=()=>{if(activeDays.has(day))activeDays.delete(day);else activeDays.add(day);renderWeekdays()};box.append(b)})}
function daysValue(){return "Personalizado:"+[...activeDays].sort((a,b)=>a-b).join(",")}
function render(){servicesBox.replaceChildren();services.forEach((s,i)=>{let d=document.createElement("div");d.className="service";let t=document.createElement("b");t.textContent=s.name;let p=document.createElement("p");p.textContent="R$ "+Number(s.price).toFixed(2).replace(".",",")+" · "+s.duration+" min";let b=document.createElement("button");b.className="secondary";b.textContent="Remover";b.onclick=()=>{services.splice(i,1);render()};d.append(t,p,b);servicesBox.append(d)})}
const servicesBox=$("services");
$("add").onclick=()=>{let n=$("sn").value.trim(),p=$("price").value,d=Number($("duration").value);if(!n||p===""||!Number.isFinite(Number(p))||Number(p)<0||!Number.isInteger(d)||d<1||d>1440){alert("Confira nome, preço e duração.");return}if(services.some(s=>s.name.toLowerCase()===n.toLowerCase())){alert("Já existe um serviço com esse nome.");return}services.push({name:n,price:Number(p),duration:d});$("sn").value="";$("price").value="";render()};
$("save").onclick=async()=>{let b=$("save");b.disabled=true;status.textContent="Salvando...";try{let r=await fetch("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:business.value.trim(),category:category.value.trim(),accent:accent.value,days:daysValue(),start:start.value,end:end.value,prep_minutes:Number(prep.value),confirmation_mode:$("confirmationMode").value,services})});let d=await r.json();if(!r.ok)throw Error(d.error);status.textContent="Salvo!";await load()}catch(e){status.textContent=e.message}finally{b.disabled=false}};
async function load(){try{let r=await fetch("/api/config");let d=await r.json();if(!r.ok)throw Error(d.error);if(d.configured){let p=d.professional;$("confirmationMode").value=d.confirmation_mode||"manual";business.value=p.name||"";category.value=p.category||"";accent.value=p.accent_color||"#a34370";activeDays=new Set(String(p.work_days||"Segunda a sexta")==="Todos os dias"?[0,1,2,3,4,5,6]:String(p.work_days||"")==="Segunda a sábado"?[1,2,3,4,5,6]:String(p.work_days||"").startsWith("Personalizado:")?String(p.work_days).slice(14).split(",").map(Number):[1,2,3,4,5]);renderWeekdays();start.value=p.start_time||"09:00";end.value=p.end_time||"18:00";prep.value=p.prep_minutes??10;services=(d.services||[]).map(s=>({name:s.name,price:Number(s.price),duration:Number(s.duration)}));render();status.textContent="Dados carregados."}else status.textContent="Configure o espaço e adicione serviços."}catch(e){status.textContent=e.message}}
$("refresh").onclick=async()=>{appointments.textContent="Carregando...";try{let r=await fetch("/api/appointments");let d=await r.json();if(!r.ok)throw Error(d.error);appointments.replaceChildren();if(!d.appointments.length){appointments.textContent="Nenhum agendamento futuro.";return}d.appointments.forEach(a=>{let div=document.createElement("div");div.className="service";let b=document.createElement("b");b.textContent=a.appointment_date.split("-").reverse().join("/")+" às "+a.appointment_time+" — "+a.service_name;let p=document.createElement("p");const state=a.status==="pending"?"Pendente de confirmação":a.status==="confirmed"?"Confirmado":a.status==="cancelled"?"Cancelado":"Agendamento antigo";p.textContent=a.customer_name+" · "+a.customer_phone+" · "+state;div.append(b,p);const phone=String(a.customer_phone||"").replace(/\\D/g,"");const dateLabel=a.appointment_date.split("-").reverse().join("/");const confirmText="Olá "+a.customer_name+"! Seu agendamento de "+a.service_name+" para "+dateLabel+" às "+a.appointment_time+" está confirmado.";const reminderText="Olá "+a.customer_name+"! Passando para lembrar do seu agendamento de "+a.service_name+" em "+dateLabel+" às "+a.appointment_time+". Te esperamos!";if(a.status==="pending"){const confirm=document.createElement("button");confirm.textContent="Confirmar agendamento";confirm.onclick=async()=>{confirm.disabled=true;try{const r=await fetch("/api/appointment-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:a.id,status:"confirmed"})});const x=await r.json();if(!r.ok)throw Error(x.error);await $("refresh").onclick()}catch(e){alert(e.message);confirm.disabled=false}};div.append(confirm)}const wa=document.createElement("a");wa.href="https://wa.me/"+phone+"?text="+encodeURIComponent(confirmText);wa.target="_blank";wa.rel="noopener";wa.textContent="Enviar confirmação pelo WhatsApp";div.append(wa);const rem=document.createElement("a");rem.href="https://wa.me/"+phone+"?text="+encodeURIComponent(reminderText);rem.target="_blank";rem.rel="noopener";rem.textContent="Enviar lembrete pelo WhatsApp";div.append(rem);appointments.append(div)})}catch(e){appointments.textContent=e.message}};
renderWeekdays();load();fetch("/api/my-salon").then(r=>r.json()).then(d=>{if(d.bookingUrl){$("bookingLink").href=d.bookingUrl;$("bookingLink").textContent=location.origin+d.bookingUrl}}).catch(()=>{});
</script></html>`);
    }
    return new Response("Não encontrado.", { status: 404 });
  }
};


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.DB) {
      return new Response("Banco D1 ainda não está conectado ao Worker.", {
        status: 500
      });
    }

    // CARREGAR CONFIGURACAO
    if (url.pathname === "/api/config" && request.method === "GET") {
      try {
        const professional = await env.DB.prepare(
          "SELECT * FROM professionals WHERE id = 1"
        ).first();

        if (!professional) {
          return Response.json({ configured: false });
        }

        const result = await env.DB.prepare(`
          SELECT name, price, duration
          FROM services
          WHERE professional_id = 1
            AND name NOT LIKE '[Arquivado] %'
          ORDER BY id
        `).all();

        return Response.json({
          configured: true,
          professional,
          services: result.results
        });
      } catch (error) {
        return Response.json({
          error: "Nao foi possivel carregar os dados."
        }, { status: 500 });
      }
    }

    // SALVAR CONFIGURACAO
    if (url.pathname === "/api/config" && request.method === "POST") {
      try {
        const data = await request.json();
        const name = String(data.name || "").trim();
        const category = String(data.category || "").trim();
        const accent = /^#[0-9a-fA-F]{6}$/.test(data.accent)
          ? data.accent : "#a34370";
        const days = String(data.days || "Segunda a sexta");
        const start = String(data.start || "09:00");
        const end = String(data.end || "18:00");
        const services = data.services;

        const validTime = value => {
          if (!/^\d{2}:\d{2}$/.test(value)) return false;
          const [h, m] = value.split(":").map(Number);
          return h >= 0 && h <= 23 && m >= 0 && m <= 59;
        };

        if (!name || !category || !Array.isArray(services)) {
          return Response.json({
            error: "Confira o nome, a categoria e os servicos."
          }, { status: 400 });
        }

        if (services.length > 100) {
          return Response.json({
            error: "Limite de 100 servicos por configuracao."
          }, { status: 400 });
        }

        if (!validTime(start) || !validTime(end) || start >= end) {
          return Response.json({
            error: "Confira os horarios de atendimento."
          }, { status: 400 });
        }

        const serviceNames = new Set();

        for (const service of services) {
          const serviceName = String(service.name || "").trim();

          if (
            !serviceName ||
            serviceName.startsWith("[Arquivado] ") ||
            serviceNames.has(serviceName.toLowerCase()) ||
            !Number.isFinite(Number(service.price)) ||
            Number(service.price) < 0 ||
            !Number.isInteger(Number(service.duration)) ||
            Number(service.duration) < 1 ||
            Number(service.duration) > 1440
          ) {
            return Response.json({
              error: "Confira os nomes, precos e duracoes dos servicos. Nao repita nomes."
            }, { status: 400 });
          }

          serviceNames.add(serviceName.toLowerCase());
        }

        await env.DB.prepare(`
          INSERT INTO professionals
            (id, name, category, accent_color, work_days, start_time, end_time)
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            accent_color = excluded.accent_color,
            work_days = excluded.work_days,
            start_time = excluded.start_time,
            end_time = excluded.end_time
        `).bind(name, category, accent, days, start, end).run();

        const existingResult = await env.DB.prepare(
          "SELECT id, name FROM services WHERE professional_id = 1"
        ).all();

        const existing = existingResult.results;
        const usedIds = new Set();

        for (const service of services) {
          const serviceName = String(service.name).trim();
          const match = existing.find(item =>
            item.name === serviceName && !usedIds.has(item.id)
          );

          if (match) {
            usedIds.add(match.id);

            await env.DB.prepare(`
              UPDATE services
              SET price = ?, duration = ?
              WHERE id = ? AND professional_id = 1
            `).bind(
              Number(service.price),
              Number(service.duration),
              match.id
            ).run();
          } else {
            await env.DB.prepare(`
              INSERT INTO services
                (professional_id, name, price, duration)
              VALUES (1, ?, ?, ?)
            `).bind(
              serviceName,
              Number(service.price),
              Number(service.duration)
            ).run();
          }
        }

        for (const item of existing) {
          if (usedIds.has(item.id)) continue;

          const bookings = await env.DB.prepare(
            "SELECT id FROM appointments WHERE service_id = ? LIMIT 1"
          ).bind(item.id).first();

          if (bookings) {
            if (!item.name.startsWith("[Arquivado] ")) {
              await env.DB.prepare(
                "UPDATE services SET name = ? WHERE id = ?"
              ).bind("[Arquivado] " + item.name, item.id).run();
            }
          } else {
            await env.DB.prepare(
              "DELETE FROM services WHERE id = ?"
            ).bind(item.id).run();
          }
        }

        return Response.json({
          ok: true,
          message: "Configuracao salva!"
        });
      } catch (error) {
        return Response.json({
          error: "Erro ao salvar. Confira a conexao e as tabelas do D1."
        }, { status: 500 });
      }
    }

    // CONFIGURACAO PUBLICA
    if (url.pathname === "/api/public-config" &&
        request.method === "GET") {
      try {
        const professional = await env.DB.prepare(`
          SELECT name, category, accent_color, work_days, start_time, end_time
          FROM professionals WHERE id = 1
        `).first();

        if (!professional) {
          return Response.json({
            error: "Este espaco ainda nao foi configurado."
          }, { status: 404 });
        }

        const result = await env.DB.prepare(`
          SELECT id, name, price, duration
          FROM services
          WHERE professional_id = 1
            AND name NOT LIKE '[Arquivado] %'
          ORDER BY id
        `).all();

        return Response.json({
          professional,
          services: result.results
        });
      } catch (error) {
        return Response.json({
          error: "Nao foi possivel carregar os servicos."
        }, { status: 500 });
      }
    }

    // CONSULTAR HORARIOS DISPONIVEIS
    if (url.pathname === "/api/availability" &&
        request.method === "GET") {
      try {
        const date = url.searchParams.get("date") || "";
        const serviceId = Number(url.searchParams.get("service_id"));

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isInteger(serviceId)
        ) {
          return Response.json({
            error: "Escolha a data e o servico."
          }, { status: 400 });
        }

        const selectedDate = new Date(date + "T12:00:00Z");

        if (
          Number.isNaN(selectedDate.getTime()) ||
          selectedDate.toISOString().slice(0, 10) !== date
        ) {
          return Response.json({
            error: "Data invalida."
          }, { status: 400 });
        }

        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date());

        if (date < today) {
          return Response.json({ slots: [] });
        }

        const professional = await env.DB.prepare(
          "SELECT * FROM professionals WHERE id = 1"
        ).first();

        const service = await env.DB.prepare(`
          SELECT id, duration
          FROM services
          WHERE id = ? AND professional_id = 1
            AND name NOT LIKE '[Arquivado] %'
        `).bind(serviceId).first();

        if (!professional || !service) {
          return Response.json({
            error: "Profissional ou servico nao encontrado."
          }, { status: 404 });
        }

        const weekday = selectedDate.getUTCDay();
        const days = professional.work_days || "Segunda a sexta";

        if (
          (days === "Segunda a sexta" &&
            (weekday === 0 || weekday === 6)) ||
          (days === "Segunda a sábado" && weekday === 0)
        ) {
          return Response.json({ slots: [] });
        }

        const toMinutes = value => {
          const [h, m] = value.split(":").map(Number);
          return h * 60 + m;
        };

        const opening = toMinutes(professional.start_time);
        const closing = toMinutes(professional.end_time);
        const duration = Number(service.duration);

        const result = await env.DB.prepare(`
          SELECT a.appointment_time, s.duration
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.professional_id = 1
            AND a.appointment_date = ?
            AND a.status != 'cancelled'
        `).bind(date).all();

        const occupied = result.results.map(item => {
          const start = toMinutes(item.appointment_time);
          return {
            start,
            end: start + Number(item.duration)
          };
        });

        const slots = [];

        // Horarios em intervalos de 30 minutos.
        for (
          let start = opening;
          start + duration <= closing;
          start += 30
        ) {
          const end = start + duration;

          const conflict = occupied.some(item =>
            start < item.end && end > item.start
          );

          if (!conflict) {
            const hours = String(Math.floor(start / 60)).padStart(2, "0");
            const minutes = String(start % 60).padStart(2, "0");
            slots.push(hours + ":" + minutes);
          }
        }

        // No dia atual, nao mostrar horarios que ja passaram.
        if (date === today) {
          const current = new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
          }).format(new Date());

          const nowMinutes = toMinutes(current);
          return Response.json({
            slots: slots.filter(slot => toMinutes(slot) > nowMinutes)
          });
        }

        return Response.json({ slots });
      } catch (error) {
        return Response.json({
          error: "Nao foi possivel consultar os horarios."
        }, { status: 500 });
      }
    }

    // REGISTRAR SOLICITACAO DE AGENDAMENTO
    if (url.pathname === "/api/appointments" &&
        request.method === "POST") {
      try {
        const data = await request.json();
        const serviceId = Number(data.service_id);
        const customerName = String(data.customer_name || "").trim();
        const customerPhone = String(data.customer_phone || "").trim();
        const date = String(data.date || "");
        const time = String(data.time || "");

        if (
          !customerName ||
          customerName.length > 100 ||
          !customerPhone ||
          customerPhone.length > 25 ||
          !Number.isInteger(serviceId) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !/^\d{2}:\d{2}$/.test(time)
        ) {
          return Response.json({
            error: "Preencha todos os campos corretamente."
          }, { status: 400 });
        }

        const selectedDate = new Date(date + "T12:00:00Z");

        if (
          Number.isNaN(selectedDate.getTime()) ||
          selectedDate.toISOString().slice(0, 10) !== date
        ) {
          return Response.json({
            error: "Escolha uma data valida."
          }, { status: 400 });
        }

        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(new Date());

        if (date < today) {
          return Response.json({
            error: "Escolha hoje ou uma data futura."
          }, { status: 400 });
        }

        const professional = await env.DB.prepare(
          "SELECT * FROM professionals WHERE id = 1"
        ).first();

        if (!professional) {
          return Response.json({
            error: "O espaco ainda nao foi configurado."
          }, { status: 400 });
        }

        const service = await env.DB.prepare(`
          SELECT id, duration
          FROM services
          WHERE id = ? AND professional_id = 1
            AND name NOT LIKE '[Arquivado] %'
        `).bind(serviceId).first();

        if (!service) {
          return Response.json({
            error: "Selecione um servico valido."
          }, { status: 400 });
        }

        const [hour, minute] = time.split(":").map(Number);
        const requestedMinutes = hour * 60 + minute;

        if (
          hour > 23 ||
          minute > 59 ||
          minute % 30 !== 0 ||
          time < professional.start_time ||
          requestedMinutes + Number(service.duration) >
            Number(professional.end_time.split(":")[0]) * 60 +
            Number(professional.end_time.split(":")[1])
        ) {
          return Response.json({
            error: "Escolha um dos horarios validos."
          }, { status: 400 });
        }

        const weekday = selectedDate.getUTCDay();
        const days = professional.work_days || "Segunda a sexta";

        if (
          (days === "Segunda a sexta" &&
            (weekday === 0 || weekday === 6)) ||
          (days === "Segunda a sábado" && weekday === 0)
        ) {
          return Response.json({
            error: "O espaco nao atende nesse dia da semana."
          }, { status: 400 });
        }

        if (date === today) {
          const current = new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
          }).format(new Date());

          if (requestedMinutes <= toMinutesSafe(current)) {
            return Response.json({
              error: "Esse horario ja passou. Escolha outro."
            }, { status: 400 });
          }
        }

        const existing = await env.DB.prepare(`
          SELECT a.appointment_time, s.duration
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.professional_id = 1
            AND a.appointment_date = ?
            AND a.status != 'cancelled'
        `).bind(date).all();

        const conflict = existing.results.some(item => {
          const [h, m] = item.appointment_time.split(":").map(Number);
          const oldStart = h * 60 + m;
          const oldEnd = oldStart + Number(item.duration);
          const newEnd = requestedMinutes + Number(service.duration);

          return requestedMinutes < oldEnd && newEnd > oldStart;
        });

        if (conflict) {
          return Response.json({
            error: "Esse horario acabou de ser ocupado. Escolha outro."
          }, { status: 409 });
        }

        await env.DB.prepare(`
          INSERT INTO appointments
            (professional_id, service_id, customer_name, customer_phone,
             appointment_date, appointment_time)
          VALUES (1, ?, ?, ?, ?, ?)
        `).bind(
          serviceId,
          customerName,
          customerPhone,
          date,
          time
        ).run();

        return Response.json({
          ok: true,
          message: "Solicitacao registrada!"
        });
      } catch (error) {
        return Response.json({
          error: "Nao foi possivel registrar a solicitacao."
        }, { status: 500 });
      }
    }

    // PAGINA PUBLICA DE AGENDAMENTO
    if (url.pathname === "/agendar") {
      const publicHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agendar atendimento</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:20px 14px;background:#fff8f7;color:#35252c;font-family:Arial,sans-serif}
main{max-width:520px;margin:auto}
.card{background:white;border:1px solid #eadde2;border-radius:16px;padding:20px;margin:16px 0}
h1{color:#a34370;font-size:26px}
p{line-height:1.5;color:#75656d}
label{display:block;font-weight:bold;margin:16px 0 7px;font-size:14px}
input,select{width:100%;padding:13px;border:1px solid #d9cbd1;border-radius:10px;font-size:16px;background:white;color:#35252c}
button{cursor:pointer}
.submit{width:100%;padding:14px;border:0;border-radius:10px;background:var(--accent,#a34370);color:white;font-size:16px;font-weight:bold;margin-top:20px}
button:disabled{opacity:.5;cursor:not-allowed}
.brand{font-size:13px;color:#a34370;font-weight:bold}
#status{overflow-wrap:anywhere}
.slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}
.slot{border:1px solid #d9cbd1;background:white;color:#35252c;border-radius:10px;padding:13px 4px;font-size:15px;font-weight:bold}
.slot.selected{background:var(--accent,#a34370);color:white;border-color:var(--accent,#a34370)}
.slot:disabled{opacity:.4}
.help{font-size:13px}
.hidden{display:none!important}
.success{text-align:center;padding:12px 0}
.check{font-size:46px;color:#32845b}
.secondary{display:block;text-align:center;text-decoration:none;background:#f8eaf0;color:#84365c;padding:14px;border-radius:10px;font-weight:bold;margin-top:12px}
</style>
</head>
<body>
<main>
<div class="card" id="bookingCard">
<div class="brand">AGENDA BEAUTY</div>
<h1 id="businessName">Agendamento</h1>
<p id="businessCategory">Escolha o servico e o horario desejado.</p>

<form id="bookingForm">
<label for="service">Servico</label>
<select id="service" required>
<option value="">Carregando servicos...</option>
</select>

<label for="date">Data desejada</label>
<input id="date" type="date" required>

<label>Horarios disponiveis</label>
<p class="help" id="slotHelp">Escolha primeiro o servico e a data.</p>
<div class="slots" id="slots"></div>
<input id="time" type="hidden" required>

<label for="customer">Seu nome</label>
<input id="customer" maxlength="100" required placeholder="Digite seu nome">

<label for="phone">Seu WhatsApp com DDD</label>
<input id="phone" maxlength="25" required type="tel" placeholder="Ex.: 21999999999">

<button class="submit" id="send" type="submit">Solicitar agendamento</button>
<p id="status" role="status"></p>
</form>
</div>

<div class="card hidden" id="successCard">
<div class="success">
<div class="check">✓</div>
<h1>Solicitacao enviada!</h1>
<p id="successMessage">Seu pedido foi registrado.</p>
<p>Seu horario ainda precisa ser confirmado pela profissional.</p>
</div>
<a class="secondary" href="/agendar">Fazer outro agendamento</a>
<a class="secondary" href="/">Voltar para a pagina inicial</a>
</div>
</main>

<script>
const $ = id => document.getElementById(id);
const dateInput = $("date");
let selectedTime = "";
let businessAccent = "#a34370";

const localToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

dateInput.min = localToday();

function clearSlots(message) {
  selectedTime = "";
  $("time").value = "";
  $("slots").replaceChildren();
  $("slotHelp").textContent = message;
}

function showSlots(slots) {
  $("slots").replaceChildren();
  selectedTime = "";
  $("time").value = "";

  if (!slots.length) {
    $("slotHelp").textContent =
      "Nao ha horarios disponiveis nessa data. Tente outro dia.";
    return;
  }

  $("slotHelp").textContent = "Toque no horario que preferir:";

  slots.forEach(time => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    button.textContent = time;
    button.addEventListener("click", () => {
      document.querySelectorAll(".slot").forEach(item => {
        item.classList.remove("selected");
      });

      button.classList.add("selected");
      selectedTime = time;
      $("time").value = time;
    });
    $("slots").appendChild(button);
  });
}

async function loadSlots() {
  clearSlots("Consultando horarios disponiveis...");

  if (!$("service").value || !dateInput.value) {
    clearSlots("Escolha primeiro o servico e a data.");
    return;
  }

  try {
    const params = new URLSearchParams({
      date: dateInput.value,
      service_id: $("service").value
    });

    const response = await fetch("/api/availability?" + params);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Erro ao consultar.");

    showSlots(data.slots || []);
  } catch (error) {
    clearSlots(error.message);
  }
}

$("service").addEventListener("change", loadSlots);
dateInput.addEventListener("change", loadSlots);

fetch("/api/public-config")
  .then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erro ao carregar.");

    $("businessName").textContent = data.professional.name;
    $("businessCategory").textContent = data.professional.category;
    businessAccent = data.professional.accent_color || "#a34370";
    document.documentElement.style.setProperty("--accent", businessAccent);

    $("service").innerHTML =
      '<option value="">Selecione um servico</option>';

    data.services.forEach(service => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.name + " - R$ " +
        Number(service.price).toFixed(2).replace(".", ",") +
        " (" + service.duration + " min)";
      $("service").appendChild(option);
    });

    if (!data.services.length) {
      $("status").textContent =
        "Este espaco ainda nao cadastrou servicos.";
    }
  })
  .catch(error => {
    $("service").innerHTML =
      '<option value="">Servicos indisponiveis</option>';
    $("status").textContent = error.message;
  });

$("bookingForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!selectedTime) {
    $("status").textContent = "Escolha um horario disponivel na grade.";
    return;
  }

  const button = $("send");
  button.disabled = true;
  $("status").textContent = "Enviando solicitacao...";

  try {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        service_id: $("service").value,
        date: dateInput.value,
        time: selectedTime,
        customer_name: $("customer").value.trim(),
        customer_phone: $("phone").value.trim()
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Nao foi possivel enviar.");

    const serviceName = $("service").selectedOptions[0].textContent;
    $("successMessage").textContent =
      "Seu pedido para " + serviceName + ", no dia " +
      dateInput.value.split("-").reverse().join("/") +
      " as " + selectedTime + ", foi registrado.";

    $("bookingCard").classList.add("hidden");
    $("successCard").classList.remove("hidden");
    window.scrollTo(0, 0);
  } catch (error) {
    $("status").textContent = error.message;
    await loadSlots();
  } finally {
    button.disabled = false;
  }
});
</script>
</body>
</html>`;

      return new Response(publicHtml, {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    // TELA DE CONFIGURACAO DA PROFISSIONAL
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agenda Beauty - Configuracao</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#fff8f7;color:#35252c}
header{background:white;padding:20px 16px;border-bottom:1px solid #eee}
header h1{margin:0;color:#a34370;font-size:25px}
main{max-width:720px;margin:auto;padding:20px 16px 40px}
h2{font-size:23px;margin:8px 0}
p{line-height:1.5;color:#75656d}
.card{background:white;padding:18px;border:1px solid #eadde2;border-radius:16px;margin:16px 0}
label{display:block;font-weight:bold;font-size:14px;margin:15px 0 7px}
input,select{width:100%;padding:13px;border:1px solid #d9cbd1;border-radius:10px;font-size:16px;background:white;color:#35252c}
button{border:0;border-radius:10px;padding:13px 16px;font-weight:bold;font-size:15px;cursor:pointer}
.primary{background:#a34370;color:white;width:100%;margin-top:16px}
.secondary{background:#f8eaf0;color:#84365c;margin-top:12px}
.service{padding:12px 0;border-bottom:1px solid #eee}
.service:last-child{border:0}
.small{font-size:13px;color:#75656d}
.preview{border:2px dashed #d8b6c5;border-radius:15px;padding:18px;background:#fffafb}
.preview h3{margin-top:0}
.preview button{background:var(--accent,#a34370);color:white;width:100%;margin-top:10px}
.pill{display:inline-block;background:#f8eaf0;border-radius:20px;padding:7px 10px;margin:4px;font-size:13px}
.notice{font-size:13px;background:#fff4d9;padding:12px;border-radius:10px;color:#694e17}
#status{padding:10px;border-radius:8px;font-size:14px}
.publicLink{display:block;overflow-wrap:anywhere;margin-top:10px;color:#84365c}
</style>
</head>
<body>
<header><h1>Agenda Beauty</h1></header>
<main>
<section class="card">
<h2>Configure seu negocio</h2>
<p>Configure os dados do seu espaco e os servicos que oferece.</p>
<label for="professional">Nome profissional ou estudio</label>
<input id="professional" placeholder="Ex.: Studio da Maria">

<label for="category">Tipo de atendimento</label>
<select id="category">
<option>Unhas</option><option>Cilios</option><option>Sobrancelhas</option>
<option>Depilacao</option><option>Estetica</option><option>Mais de uma categoria</option>
</select>

<label for="accent">Cor principal da pagina</label>
<input id="accent" type="color" value="#a34370">
</section>

<section class="card">
<h2>Seus servicos</h2>
<p>Adicione os procedimentos, precos e duracao.</p>
<label for="serviceName">Nome do servico</label>
<input id="serviceName" placeholder="Ex.: Manicure">

<label for="price">Preco em reais (R$)</label>
<input id="price" type="number" min="0" step="0.01" placeholder="Ex.: 35">

<label for="duration">Duracao</label>
<select id="duration">
<option value="30">30 minutos</option><option value="45">45 minutos</option>
<option value="60" selected>1 hora</option><option value="90">1 hora e 30 minutos</option>
<option value="120">2 horas</option>
</select>

<button class="secondary" id="addService" type="button">+ Adicionar servico</button>
<div id="serviceList"><p class="small">Carregando servicos...</p></div>
</section>

<section class="card">
<h2>Horarios de atendimento</h2>
<label for="days">Dias em que atende</label>
<select id="days">
<option>Segunda a sexta</option><option>Segunda a sábado</option>
<option>Todos os dias</option><option>Personalizar depois</option>
</select>

<div style="display:flex;gap:12px">
<div style="flex:1">
<label for="start">Comeca as</label>
<input id="start" type="time" value="09:00">
</div>
<div style="flex:1">
<label for="end">Termina as</label>
<input id="end" type="time" value="18:00">
</div>
</div>
<p class="small">Os horarios para as clientes serao exibidos em intervalos de 30 minutos, respeitando a duracao do servico e os agendamentos existentes.</p>
</section>

<section class="card">
<h2>Previa da sua pagina</h2>
<p class="small">Exemplo de como suas clientes poderao visualizar os servicos.</p>
<div class="preview" id="preview">
<h3 id="previewName">Seu espaco de beleza</h3>
<span class="pill" id="previewCategory">Unhas</span>
<div id="previewServices"><p>Seus servicos aparecerao aqui.</p></div>
<p id="previewHours" class="small">Segunda a sexta - 09:00 as 18:00</p>
<button type="button" id="previewButton">Abrir pagina de agendamento</button>
</div>

<button class="secondary" id="updatePreview" type="button" style="width:100%">Atualizar previa</button>
<button class="primary" id="saveButton" type="button">Salvar configuracao</button>
<p id="status" role="status">Carregando dados...</p>
<p class="notice">Pagina publica para clientes:</p>
<a class="publicLink" href="/agendar" target="_blank">https://agenda-beauty.ffdbeats.workers.dev/agendar</a>
<p class="notice">Os pedidos ficam salvos no banco. A confirmacao ainda precisa ser feita pela profissional. Este teste atende uma profissional.</p>
</section>
</main>

<script>
const $ = id => document.getElementById(id);
let services = [];

function renderServices() {
  const list = $("serviceList");
  const preview = $("previewServices");

  if (!services.length) {
    list.innerHTML = '<p class="small">Nenhum servico adicionado ainda.</p>';
    preview.innerHTML = '<p>Seus servicos aparecerao aqui.</p>';
    return;
  }

  list.replaceChildren();
  preview.replaceChildren();

  services.forEach((service, index) => {
    const item = document.createElement("div");
    item.className = "service";

    const title = document.createElement("strong");
    title.textContent = service.name;

    const detail = document.createElement("p");
    detail.className = "small";
    detail.textContent = "R$ " +
      Number(service.price).toFixed(2).replace(".", ",") +
      " - " + service.duration + " min";

    const remove = document.createElement("button");
    remove.className = "secondary";
    remove.textContent = "Remover";
    remove.type = "button";
    remove.onclick = () => {
      services.splice(index, 1);
      renderServices();
    };

    item.append(title, detail, remove);
    list.appendChild(item);

    const previewItem = document.createElement("div");
    previewItem.className = "service";

    const previewTitle = document.createElement("strong");
    previewTitle.textContent = service.name;

    const previewDetail = document.createElement("p");
    previewDetail.className = "small";
    previewDetail.textContent = detail.textContent;

    previewItem.append(previewTitle, previewDetail);
    preview.appendChild(previewItem);
  });
}

function updatePreview() {
  $("previewName").textContent =
    $("professional").value.trim() || "Seu espaco de beleza";
  $("previewCategory").textContent = $("category").value;
  $("previewHours").textContent =
    $("days").value + " - " + $("start").value + " as " + $("end").value;
  document.documentElement.style.setProperty("--accent", $("accent").value);
  $("previewButton").style.background = $("accent").value;
}

$("addService").addEventListener("click", () => {
  const name = $("serviceName").value.trim();
  const priceText = $("price").value;
  const price = Number(priceText);
  const duration = Number($("duration").value);

  if (!name) {
    alert("Digite o nome do servico.");
    return;
  }

  if (name.startsWith("[Arquivado] ")) {
    alert("Escolha outro nome para o servico.");
    return;
  }

  if (services.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    alert("Voce ja adicionou um servico com esse nome.");
    return;
  }

  if (priceText === "" || !Number.isFinite(price) || price < 0) {
    alert("Digite um preco valido.");
    return;
  }

  services.push({name, price, duration});
  $("serviceName").value = "";
  $("price").value = "";
  renderServices();
});

$("updatePreview").addEventListener("click", updatePreview);

["professional","category","accent","days","start","end"].forEach(id => {
  $(id).addEventListener("input", updatePreview);
  $(id).addEventListener("change", updatePreview);
});

$("previewButton").addEventListener("click", () => {
  window.open("/agendar", "_blank");
});

$("saveButton").addEventListener("click", async () => {
  const button = $("saveButton");
  button.disabled = true;
  $("status").textContent = "Salvando no banco de dados...";
  updatePreview();

  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        name: $("professional").value.trim(),
        category: $("category").value,
        accent: $("accent").value,
        days: $("days").value,
        start: $("start").value,
        end: $("end").value,
        services
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Falha ao salvar.");

    $("status").textContent = "Configuracao salva com sucesso!";
  } catch (error) {
    $("status").textContent = "Nao foi possivel salvar: " + error.message;
  } finally {
    button.disabled = false;
  }
});

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Falha ao carregar.");

    if (!data.configured) {
      $("status").textContent =
        "Configure seu negocio e toque em Salvar configuracao.";
      updatePreview();
      renderServices();
      return;
    }

    const p = data.professional;
    $("professional").value = p.name || "";
    $("category").value = p.category || "Unhas";
    $("accent").value = p.accent_color || "#a34370";
    $("days").value = p.work_days || "Segunda a sexta";
    $("start").value = p.start_time || "09:00";
    $("end").value = p.end_time || "18:00";

    services = (data.services || []).map(s => ({
      name: s.name,
      price: Number(s.price),
      duration: Number(s.duration)
    }));

    renderServices();
    updatePreview();
    $("status").textContent = "Dados carregados do banco de dados.";
  } catch (error) {
    $("status").textContent = "Erro ao carregar os dados: " + error.message;
  }
}

function toMinutesSafe(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

updatePreview();
loadConfig();
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=UTF-8" }
    });
  }
};

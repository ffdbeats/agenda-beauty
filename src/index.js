
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.DB) {
      return new Response("Banco D1 ainda não está conectado ao Worker.", {
        status: 500
      });
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      try {
        const professional = await env.DB.prepare(
          "SELECT * FROM professionals WHERE id = 1"
        ).first();

        if (!professional) {
          return Response.json({ configured: false });
        }

        const result = await env.DB.prepare(
          "SELECT name, price, duration FROM services WHERE professional_id = 1 ORDER BY id"
        ).all();

        return Response.json({
          configured: true,
          professional,
          services: result.results
        });
      } catch (error) {
        return Response.json({ error: "Não foi possível carregar os dados." }, {
          status: 500
        });
      }
    }

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

        if (!name || !category || !Array.isArray(services)) {
          return Response.json({ error: "Confira o nome, a categoria e os serviços." }, {
            status: 400
          });
        }

        if (services.length > 100) {
          return Response.json({ error: "Limite de 100 serviços por configuração." }, {
            status: 400
          });
        }

        for (const service of services) {
          if (
            !String(service.name || "").trim() ||
            !Number.isFinite(Number(service.price)) ||
            Number(service.price) < 0 ||
            !Number.isInteger(Number(service.duration)) ||
            Number(service.duration) < 1
          ) {
            return Response.json({ error: "Confira os dados dos serviços." }, {
              status: 400
            });
          }
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

        const statements = [
          env.DB.prepare(
            "DELETE FROM services WHERE professional_id = 1"
          )
        ];

        for (const service of services) {
          statements.push(
            env.DB.prepare(`
              INSERT INTO services
                (professional_id, name, price, duration)
              VALUES (1, ?, ?, ?)
            `).bind(
              String(service.name).trim(),
              Number(service.price),
              Number(service.duration)
            )
          );
        }

        await env.DB.batch(statements);

        return Response.json({ ok: true, message: "Configuração salva!" });
      } catch (error) {
        return Response.json({ error: "Erro ao salvar. Confira a conexão e as tabelas do D1." }, {
          status: 500
        });
      }
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agenda Beauty - Configuração</title>
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
</style>
</head>
<body>
<header><h1>Agenda Beauty</h1></header>
<main>
<section class="card">
<h2>Configure seu negócio ✨</h2>
<p>Monte sua página de agendamento e configure os dados do seu espaço.</p>
<label for="professional">Nome profissional ou estúdio</label>
<input id="professional" placeholder="Ex.: Studio da Maria">
<label for="category">Tipo de atendimento</label>
<select id="category">
<option>Unhas</option><option>Cílios</option><option>Sobrancelhas</option>
<option>Depilação</option><option>Estética</option><option>Mais de uma categoria</option>
</select>
<label for="accent">Cor principal da página</label>
<input id="accent" type="color" value="#a34370">
</section>

<section class="card">
<h2>Seus serviços</h2>
<p>Adicione os procedimentos, preços e duração.</p>
<label for="serviceName">Nome do serviço</label>
<input id="serviceName" placeholder="Ex.: Manicure">
<label for="price">Preço em reais (R$)</label>
<input id="price" type="number" min="0" step="0.01" placeholder="Ex.: 35">
<label for="duration">Duração</label>
<select id="duration">
<option value="30">30 minutos</option><option value="45">45 minutos</option>
<option value="60" selected>1 hora</option><option value="90">1 hora e 30 minutos</option>
<option value="120">2 horas</option>
</select>
<button class="secondary" id="addService" type="button">+ Adicionar serviço</button>
<div id="serviceList"><p class="small">Nenhum serviço adicionado ainda.</p></div>
</section>

<section class="card">
<h2>Horários de atendimento</h2>
<label for="days">Dias em que atende</label>
<select id="days">
<option>Segunda a sexta</option><option>Segunda a sábado</option>
<option>Todos os dias</option><option>Personalizar depois</option>
</select>
<div style="display:flex;gap:12px">
<div style="flex:1"><label for="start">Começa às</label><input id="start" type="time" value="09:00"></div>
<div style="flex:1"><label for="end">Termina às</label><input id="end" type="time" value="18:00"></div>
</div>
</section>

<section class="card">
<h2>Prévia da sua página</h2>
<p class="small">Exemplo de como suas clientes poderão visualizar os serviços.</p>
<div class="preview" id="preview">
<h3 id="previewName">Seu espaço de beleza</h3>
<span class="pill" id="previewCategory">Unhas</span>
<div id="previewServices"><p>Seus serviços aparecerão aqui.</p></div>
<p id="previewHours" class="small">Segunda a sexta · 09:00 às 18:00</p>
<button type="button" id="previewButton">Solicitar agendamento</button>
</div>
<button class="secondary" id="updatePreview" type="button" style="width:100%">Atualizar prévia</button>
<button class="primary" id="saveButton" type="button">Salvar configuração</button>
<p id="status" role="status">Seus dados ainda não foram carregados.</p>
<p class="notice">Esta etapa salva as configurações e os serviços. A página pública para clientes e os agendamentos serão construídos depois.</p>
</section>
</main>

<script>
const $ = id => document.getElementById(id);
let services = [];

function renderServices() {
  const list = $("serviceList");
  const preview = $("previewServices");

  if (!services.length) {
    list.innerHTML = '<p class="small">Nenhum serviço adicionado ainda.</p>';
    preview.innerHTML = '<p>Seus serviços aparecerão aqui.</p>';
    return;
  }

  list.innerHTML = "";
  preview.innerHTML = "";

  services.forEach((service, index) => {
    const item = document.createElement("div");
    item.className = "service";
    const title = document.createElement("strong");
    title.textContent = service.name;
    const detail = document.createElement("p");
    detail.className = "small";
    detail.textContent = "R$ " + Number(service.price).toFixed(2).replace(".", ",") + " · " + service.duration + " min";
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
  $("previewName").textContent = $("professional").value.trim() || "Seu espaço de beleza";
  $("previewCategory").textContent = $("category").value;
  $("previewHours").textContent = $("days").value + " · " + $("start").value + " às " + $("end").value;
  document.documentElement.style.setProperty("--accent", $("accent").value);
  $("previewButton").style.background = $("accent").value;
}

$("addService").addEventListener("click", () => {
  const name = $("serviceName").value.trim();
  const priceText = $("price").value;
  const price = Number(priceText);
  const duration = Number($("duration").value);

  if (!name) {
    alert("Digite o nome do serviço.");
    return;
  }
  if (priceText === "" || !Number.isFinite(price) || price < 0) {
    alert("Digite um preço válido.");
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
    $("status").textContent = "Configuração salva com sucesso! ✅";
  } catch (error) {
    $("status").textContent = "Não foi possível salvar: " + error.message;
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
      $("status").textContent = "Configure seu negócio e toque em Salvar configuração.";
      updatePreview();
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
    $("status").textContent = "Dados carregados do banco de dados. ✅";
  } catch (error) {
    $("status").textContent = "Erro ao carregar os dados: " + error.message;
  }
}

$("previewButton").addEventListener("click", () => {
  alert("A página pública de agendamento será construída na próxima etapa.");
});

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

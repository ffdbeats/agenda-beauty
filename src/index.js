
export default {
  async fetch(request) {
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
</style>
</head>
<body>
<header><h1>Agenda Beauty</h1></header>
<main>
<section class="card">
<h2>Configure seu negócio ✨</h2>
<p>Monte sua página de agendamento. Preencha os dados e veja como ela ficará para suas clientes.</p>
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
<p>Adicione os procedimentos, seus preços e o tempo necessário.</p>
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
<p class="small">Exemplo de como suas clientes poderão visualizar seus serviços.</p>
<div class="preview" id="preview">
<h3 id="previewName">Seu espaço de beleza</h3>
<span class="pill" id="previewCategory">Unhas</span>
<div id="previewServices"><p>Seus serviços aparecerão aqui.</p></div>
<p id="previewHours" class="small">Segunda a sexta · 09:00 às 18:00</p>
<button type="button" id="previewButton">Solicitar agendamento</button>
</div>
<button class="primary" id="updatePreview" type="button">Atualizar prévia</button>
<p class="notice">Protótipo inicial: os dados ainda não são salvos permanentemente e os agendamentos ainda não são enviados. Vamos conectar essas funções nas próximas etapas.</p>
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
    detail.textContent = "R$ " + service.price.toFixed(2).replace(".", ",") + " · " + service.duration + " min";
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
    previewDetail.textContent = "R$ " + service.price.toFixed(2).replace(".", ",") + " · " + service.duration + " min";
    previewItem.append(previewTitle, previewDetail);
    preview.appendChild(previewItem);
  });
}

$("addService").addEventListener("click", () => {
  const name = $("serviceName").value.trim();
  const price = Number($("price").value);
  const duration = Number($("duration").value);

  if (!name) {
    alert("Digite o nome do serviço.");
    return;
  }
  if ($("price").value === "" || !Number.isFinite(price) || price < 0) {
    alert("Digite um preço válido.");
    return;
  }

  services.push({name, price, duration});
  $("serviceName").value = "";
  $("price").value = "";
  renderServices();
});

function updatePreview() {
  $("previewName").textContent = $("professional").value.trim() || "Seu espaço de beleza";
  $("previewCategory").textContent = $("category").value;
  $("previewHours").textContent = $("days").value + " · " + $("start").value + " às " + $("end").value;
  document.documentElement.style.setProperty("--accent", $("accent").value);
  $("previewButton").style.background = $("accent").value;
}

$("updatePreview").addEventListener("click", updatePreview);
$("professional").addEventListener("input", updatePreview);
$("category").addEventListener("change", updatePreview);
$("accent").addEventListener("input", updatePreview);
$("days").addEventListener("change", updatePreview);
$("start").addEventListener("change", updatePreview);
$("end").addEventListener("change", updatePreview);

$("previewButton").addEventListener("click", () => {
  alert("A página pública de agendamento será conectada nas próximas etapas.");
});

updatePreview();
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=UTF-8" }
    });
  }
};

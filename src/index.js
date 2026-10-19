
export default {
  async fetch(request) {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#fff8f7">
  <title>Agenda Beauty</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #fff8f7;
      color: #35252c;
    }
    header {
      padding: 22px;
      background: white;
      border-bottom: 1px solid #f0e2e7;
    }
    header strong { color: #a43d68; font-size: 21px; }
    main {
      max-width: 700px;
      margin: 55px auto;
      padding: 24px;
      text-align: center;
    }
    .tag {
      color: #a43d68;
      font-weight: bold;
    }
    h1 { font-size: clamp(32px, 7vw, 52px); }
    p { line-height: 1.7; color: #75616a; }
    .services {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 28px;
    }
    .service {
      background: white;
      border: 1px solid #f0dce4;
      border-radius: 14px;
      padding: 22px 10px;
    }
    footer { margin-top: 38px; font-size: 13px; }
  </style>
</head>
<body>
  <header><strong>Agenda Beauty</strong></header>
  <main>
    <div class="tag">MAIS TEMPO PARA VOCÊ</div>
    <h1>Sua beleza merece uma agenda organizada.</h1>
    <p>Uma maneira simples de organizar os horários
    e facilitar os agendamentos dos seus clientes.</p>
    <div class="services">
      <div class="service">💅<br><strong>Unhas</strong></div>
      <div class="service">✨<br><strong>Cílios</strong></div>
      <div class="service">🌸<br><strong>Sobrancelhas</strong></div>
      <div class="service">🧖‍♀️<br><strong>Estética</strong></div>
    </div>
    <footer>Seu negócio, sua marca, sua agenda.</footer>
  </main>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8"
      }
    });
  }
};

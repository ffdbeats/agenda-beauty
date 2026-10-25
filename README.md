# Agenda Beauty

SaaS em desenvolvimento para profissionais da beleza, com painel de configuração, cadastro de serviços e agendamento público. Base tecnológica: Cloudflare Workers + D1.

## Recursos existentes no MVP
- Login de proprietário com sessão assinada.
- Criação do primeiro acesso protegida por `SETUP_SECRET`.
- Configuração de profissional, horários e serviços.
- Página pública para consultar horários e solicitar agendamentos.
- Painel para consultar próximos agendamentos.

## Começar
1. Instale Node.js LTS.
2. Instale dependências: `npm install`.
3. Copie `.dev.vars.example` para `.dev.vars` e defina segredos locais fortes.
4. Execute `npm run check` para verificar a sintaxe.
5. Execute `npm run dev` para desenvolvimento local.

## Cloudflare e D1
A configuração do Worker está em `wrangler.jsonc`; o esquema inicial versionado está em `migrations/0001_initial_schema.sql`. Leia [o guia de implantação](docs/DEPLOY-CLOUDFLARE.md) antes de executar migrações remotas.

**Não apague nem recrie o D1 existente.** Faça backup e confira o esquema real antes de aplicar uma migração. A migração inicial cria apenas tabelas/índices ausentes e insere o salão de teste somente se o ID 1 estiver livre; ela não corrige automaticamente colunas diferentes em tabelas preexistentes.

## Diagnóstico de login
O formulário verifica se a resposta da API é JSON antes de tentar interpretá-la, para exibir uma mensagem útil se o Worker responder com HTML. Consulte o guia de implantação para investigar erros do D1 e a publicação do Worker.

## Limitações atuais
Esta é uma base MVP, ainda não um SaaS comercial multiempresa completo. Algumas rotas públicas usam `salon_id = 1`; o isolamento entre empresas precisa ser implementado e testado antes de cadastrar clientes reais. Planos/cobrança, recuperação de senha, gestão de equipe e testes de integração também estão pendentes. Veja [o roadmap](docs/ROADMAP.md).

## Segurança
- Nunca comite `.dev.vars`, senhas, tokens ou valores de segredos.
- Use segredos fortes no painel Cloudflare.
- Não use dados reais de clientes até concluir revisão de segurança e testes.

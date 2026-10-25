# Implantação do Agenda Beauty (Cloudflare)

## Importante: preserve o banco existente

O projeto usa o banco D1 `agenda-beauty-db`, ID `b654d405-6a1b-4d94-bcaa-89654341689b`.
**Não crie outro banco, não execute DROP TABLE e não apague/recrie o D1.**

1. No painel Cloudflare, abra D1 > `agenda-beauty-db`.
2. Faça um backup/exportação antes de qualquer alteração.
3. No Console SQL, consulte as tabelas existentes:
   ```sql
   SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name;
   ```
4. Compare com `migrations/0001_initial_schema.sql`. A migração usa `IF NOT EXISTS`, mas não adiciona colunas ausentes em tabelas que já existam. Se o banco atual tiver tabelas com estrutura diferente, pare e prepare uma migração específica, sem apagar dados.
5. Depois de confirmar que a estrutura é compatível, instale as dependências e veja o estado das migrações:
   ```sh
   npm install
   npm run check
   npm run db:remote:status
   ```
6. Só aplique a migração remota após conferir o resultado e ter backup:
   ```sh
   npm run db:remote:apply
   ```
7. Configure os segredos no Worker `agenda-beauty` (Settings > Variables and Secrets):
   - `SESSION_SECRET`: segredo aleatório forte para assinar sessões.
   - `SETUP_SECRET`: chave aleatória forte para proteger a configuração inicial.
   Não publique esses valores no GitHub, no código ou em mensagens.
8. Publique o Worker:
   ```sh
   npm run deploy
   ```
9. Abra `/configurar-acesso` para criar o primeiro usuário, apenas quando ainda não houver usuários. A senha deve ter pelo menos 12 caracteres.

## Diagnóstico do login

O formulário agora verifica o tipo de conteúdo da resposta antes de interpretar JSON. Se o Worker devolver HTML (por exemplo, uma página de erro ou uma rota não publicada), a tela mostra o status e um trecho da resposta em vez de falhar com `Unexpected token '<'`.

Se houver erro de banco, a API de login retorna uma mensagem JSON específica. Confira os logs do Worker e o esquema D1; não recrie o banco como tentativa de correção.

## Estado funcional e limites do MVP

A aplicação atual tem login, configuração inicial, cadastro de profissional/serviços e fluxo básico de agendamentos. Ainda precisa de evolução antes de ser considerada um SaaS comercial multiempresa completo, incluindo isolamento de tenant em todas as rotas públicas, gestão de planos/assinaturas, recuperação de senha, gestão de equipe/permissões, cancelamentos e confirmações, testes automatizados de integração e revisão de segurança. Não habilite cobrança nem prometa esses recursos até serem implementados e testados.

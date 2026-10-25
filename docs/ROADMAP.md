# Agenda Beauty — plano SaaS

## Já presente no código atual
- Login de proprietário com sessão assinada e senha derivada com PBKDF2.
- Configuração inicial protegida por `SETUP_SECRET`.
- Configuração de profissional, horários e serviços.
- Página pública de agendamento e consulta de disponibilidade.
- Listagem dos próximos agendamentos no painel.
- Cloudflare Workers + D1.

## Prioridades para um SaaS pronto para clientes
1. Validar e documentar a estrutura do D1 existente sem apagar dados.
2. Garantir isolamento por salão em absolutamente todas as consultas e rotas públicas (atualmente algumas rotas públicas usam `salon_id = 1`).
3. Corrigir e testar login/setup em ambiente publicado; adicionar testes de API e mensagens JSON consistentes.
4. Implementar estados de agendamento e ações para confirmar/cancelar.
5. Criar onboarding de novos salões e profissionais sem depender de ID fixo.
6. Adicionar recuperação de senha, gerenciamento de usuários e controle de permissões.
7. Implementar planos/assinaturas e cobrança somente após o isolamento multi-tenant estar validado.
8. Adicionar limites de uso, logs sem dados sensíveis, políticas de privacidade e termos de uso.
9. Executar testes de segurança, concorrência de horários, acessibilidade e mobile.

## Princípio de dados
Toda mudança de esquema deve ser incremental, versionada em `migrations/`, revisada e precedida de backup. Nunca resolver um problema de login recriando o banco.

# Omnifica Ads Planner

Versão completa simples com:

- Site com planos (Básico, Standard, Premium) – 30 dias
- Login e criação de conta pelo usuário (e-mail + senha)
- Usuário escolhe o plano no momento do cadastro
- Painel administrativo para aprovar / bloquear usuários
- Geração de planejamento de tráfego pago com IA (OpenAI)

## Rotas

- `/` – página principal com os planos e formulário de planejamento
- `/login` – tela de login + criação de conta
- `/admin` – painel administrativo

## API

- `POST /api/auth/register` – cria conta (status inicial = pending)
- `POST /api/auth/login` – login, só libera se status = approved
- `POST /api/plan` – gera plano com IA (precisa de token de sessão)
- `POST /api/admin/login` – valida senha do admin
- `GET /api/admin/users` – lista usuários
- `POST /api/admin/update-user-status` – muda status (pending / approved / blocked)

## Variáveis de ambiente

Crie um arquivo `.env` (ou configure no Render):

- `OPENAI_API_KEY` – sua chave da OpenAI
- `ADMIN_PASSWORD` – senha do painel admin

## Comandos

Instalar dependências:

    npm install

Rodar localmente:

    npm start


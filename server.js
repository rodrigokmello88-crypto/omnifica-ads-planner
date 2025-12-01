const express = require("express");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, "users.json");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

function loadUsers() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return { users: [] };
  }
}

function saveUsers(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return crypto.randomBytes(8).toString("hex");
}

function generateSessionToken() {
  return crypto.randomBytes(16).toString("hex");
}

// Rotas de páginas básicas
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Registro de usuário
app.post("/api/auth/register", (req, res) => {
  try {
    const { name, email, password, plan } = req.body || {};
    if (!name || !email || !password || !plan) {
      return res.status(400).json({
        error: "Informe nome, e-mail, senha e plano.",
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        error: "A senha deve ter pelo menos 6 caracteres.",
      });
    }

    const data = loadUsers();
    const existing = data.users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase()
    );
    if (existing) {
      return res.status(400).json({
        error: "Já existe uma conta com esse e-mail. Tente fazer login.",
      });
    }

    const user = {
      id: generateId(),
      name,
      email,
      password,
      plan,
      status: "pending", // pendente até aprovação após pagamento
      createdAt: new Date().toISOString(),
      sessionToken: null,
    };

    data.users.push(user);
    saveUsers(data);

    return res.json({
      ok: true,
      message:
        "Conta criada com sucesso. Agora faça o pagamento do plano escolhido e envie o comprovante para o WhatsApp do administrador. Seu acesso será liberado após aprovação.",
    });
  } catch (err) {
    console.error("Erro em /api/auth/register:", err);
    return res.status(500).json({ error: "Erro ao criar conta." });
  }
});

// Login de usuário
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Informe e-mail e senha." });
    }
    const data = loadUsers();
    const user = data.users.find(
      (u) =>
        u.email.toLowerCase() === String(email).toLowerCase() &&
        u.password === password
    );
    if (!user) {
      return res.status(401).json({ error: "Login inválido." });
    }
    // usuário existe, verifica status
    if (user.status !== "approved") {
      return res.status(403).json({
        error:
          "Sua conta ainda não foi aprovada. Aguarde o administrador confirmar o pagamento do plano.",
        status: user.status,
      });
    }

    const token = generateSessionToken();
    user.sessionToken = token;
    saveUsers(data);

    return res.json({
      ok: true,
      token,
      name: user.name,
      email: user.email,
      plan: user.plan,
      status: user.status,
    });
  } catch (err) {
    console.error("Erro em /api/auth/login:", err);
    return res.status(500).json({ error: "Erro ao fazer login." });
  }
});

// Middleware para usuário autenticado
function requireUser(req, res, next) {
  const token = req.headers["x-session-token"];
  if (!token) {
    return res.status(401).json({ error: "Token de sessão ausente." });
  }
  const data = loadUsers();
  const user = data.users.find((u) => u.sessionToken === token);
  if (!user) {
    return res.status(401).json({ error: "Sessão inválida." });
  }
  if (user.status !== "approved") {
    return res.status(403).json({
      error:
        "Sua conta não está aprovada. Aguarde a confirmação do pagamento.",
    });
  }
  req.user = user;
  req._usersData = data;
  next();
}

// Geração de plano com IA
app.post("/api/plan", requireUser, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error:
          "OPENAI_API_KEY não configurada no servidor. Configure no Render para usar a IA.",
      });
    }

    const { segmento, objetivo, orcamento, plataformas } = req.body || {};
    const user = req.user;

    const prompt = `
Você é um planejador de tráfego pago sênior. Crie um plano completo de mídia paga de 30 dias.

Dados do usuário:
- Nome: ${user.name}
- Plano: ${user.plan}

Negócio / Nicho: ${segmento || "não informado"}
Objetivo principal: ${objetivo || "não informado"}
Orçamento mensal: ${orcamento || "não informado"}
Plataformas desejadas: ${plataformas || "não informado"}

Entregue o plano no seguinte formato:

1. Resumo da estratégia
2. Público-alvo e segmentações sugeridas
3. Estrutura de campanhas e conjuntos de anúncios
4. Sugestões de criativos (imagens, vídeos, copies)
5. Distribuição do orçamento (por plataforma e campanha)
6. Métricas principais para acompanhar
7. Sugestões de testes A/B para os 30 dias
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Você é um especialista em tráfego pago e mídia online." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const planText =
      completion.choices?.[0]?.message?.content ||
      "Não foi possível gerar o planejamento. Tente novamente.";

    return res.json({ ok: true, plan: planText });
  } catch (err) {
    console.error("Erro em /api/plan:", err);
    return res.status(500).json({ error: "Erro ao gerar planejamento." });
  }
}

// Admin – simples verificação por senha (enviada no header)
function requireAdmin(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return res
      .status(500)
      .json({ error: "ADMIN_PASSWORD não configurada no servidor." });
  }
  if (!secret || secret !== adminPass) {
    return res.status(401).json({ error: "Senha de administrador inválida." });
  }
  next();
}

// Login admin (apenas valida a senha antes de usar o painel)
app.post("/api/admin/login", (req, res) => {
  try {
    const { password } = req.body || {};
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({
        error: "ADMIN_PASSWORD não configurada no servidor.",
      });
    }
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Senha incorreta." });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro em /api/admin/login:", err);
    return res.status(500).json({ error: "Erro ao validar senha." });
  }
});

// Listar usuários
app.get("/api/admin/users", requireAdmin, (req, res) => {
  try {
    const data = loadUsers();
    return res.json({ ok: true, users: data.users || [] });
  } catch (err) {
    console.error("Erro em /api/admin/users:", err);
    return res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

// Atualizar status do usuário
app.post("/api/admin/update-user-status", requireAdmin, (req, res) => {
  try {
    const { userId, status } = req.body || {};
    if (!userId || !status) {
      return res.status(400).json({ error: "Informe usuário e status." });
    }
    const data = loadUsers();
    const user = data.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }
    user.status = status;
    saveUsers(data);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro em /api/admin/update-user-status:", err);
    return res.status(500).json({ error: "Erro ao atualizar status." });
  }
});

app.listen(PORT, () => {
  console.log("Omnifica Ads Planner rodando em http://localhost:" + PORT);
});

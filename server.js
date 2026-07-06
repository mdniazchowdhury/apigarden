import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "openrouter/free";
const ENABLE_REASONING = String(process.env.ENABLE_REASONING || "false").toLowerCase() === "true";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

function requireOpenRouterKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    const err = new Error("OPENROUTER_API_KEY is missing. Add it to your .env file, then restart the server.");
    err.status = 500;
    throw err;
  }
  return process.env.OPENROUTER_API_KEY;
}

function extractMessageText(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "No answer returned from the model.";
}

async function callOpenRouter(messages) {
  const apiKey = requireOpenRouterKey();

  async function attempt(modelName, enableReasoning) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || `http://localhost:${PORT}`,
        "X-OpenRouter-Title": "APIGarden"
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        reasoning: { enabled: enableReasoning }
      })
    });

    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!response.ok) {
      const err = new Error(data?.error?.message || data?.message || text || "OpenRouter request failed.");
      err.status = response.status;
      throw err;
    }
    return data;
  }

  try {
    return await attempt(MODEL, ENABLE_REASONING);
  } catch (error) {
    const retryable = [402, 429, 500, 502, 503, 504].includes(error.status);
    if (!retryable) throw error;
    return await attempt(FALLBACK_MODEL, false);
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: Boolean(process.env.OPENROUTER_API_KEY),
    model: MODEL,
    fallbackModel: FALLBACK_MODEL,
    reasoning: ENABLE_REASONING,
    provider: "OpenRouter"
  });
});


app.get("/api/currency", async (req, res) => {
  try {
    const amount = Number(req.query.amount || 1);
    const from = String(req.query.from || "USD").toUpperCase();
    const to = String(req.query.to || "BDT").toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      return res.status(400).json({ error: "Currency codes must be 3 letters, like USD or BDT." });
    }

    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.result !== "success") {
      return res.status(502).json({ error: "Currency service is unavailable right now. Try again later." });
    }

    const rate = data.rates?.[to];
    if (!rate) {
      return res.status(400).json({ error: `${to} is not supported by the currency service.` });
    }

    res.json({
      amount,
      from,
      to,
      rate,
      converted: amount * rate,
      date: data.time_last_update_utc || "latest"
    });
  } catch (error) {
    console.error("Currency request failed:", error);
    res.status(500).json({ error: "Currency request failed. Check the server logs." });
  }
});

app.post("/api/run-api", async (req, res) => {
  try {
    const { description, input, context } = req.body || {};

    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "API description is required." });
    }

    const messages = [
      {
        role: "system",
        content: `You are APIGarden's AI execution engine. A user creates mini APIs by describing what each API should do. Your job is to behave like that created API and return the best possible useful output.

Rules:
- Follow the user's API description exactly.
- Answer clearly, practically, and directly.
- For recommendation APIs, give specific suggestions with short reasons.
- If the answer depends on live data, exact prices, stock, private data, or unavailable context, say what is missing instead of pretending.
- Do not reveal hidden reasoning. Return only the final useful answer.`
      },
      {
        role: "user",
        content: `Created API description:\n${description}\n\nUser input to this API:\n${input || "(no input provided)"}\n\n${context ? `Extra context:\n${context}\n\n` : ""}Return the API output now. Use clean formatting for readability. If recommending items, make the answer visually neat with short sections, numbered suggestions, and a clear best match.`
      }
    ];

    const data = await callOpenRouter(messages);
    res.json({ answer: extractMessageText(data), model: MODEL });
  } catch (error) {
    console.error("OpenRouter request failed:", error);
    res.status(error.status || 500).json({
      error: error.message || "AI request failed. Check your OpenRouter key, model name, and internet connection."
    });
  }
});


// In-memory demo sync store.
// This lets the Chrome extension and deployed website share pending/approved requests during a demo.
// Note: Render may clear this if the service restarts, which is fine for a classroom demo.
const demoState = {
  pending: [],
  approved: [],
  userMessages: {}
};

function cleanTxn(txn = {}) {
  return {
    id: String(txn.id || ("TXN-" + Math.floor(1000 + Math.random() * 9000))),
    user: String(txn.user || txn.buyer || ""),
    buyer: String(txn.buyer || txn.user || ""),
    seller: txn.seller ? String(txn.seller) : "",
    plan: String(txn.plan || "Pro Monthly"),
    amount: String(txn.amount || "৳1200"),
    method: String(txn.method || "bKash Send Money"),
    date: String(txn.date || new Date().toISOString().slice(0, 10)),
    status: txn.status ? String(txn.status) : undefined,
    password: txn.password ? String(txn.password) : undefined
  };
}

app.get("/api/demo-state", (req, res) => {
  res.json(demoState);
});


function messageKey(role, email) {
  return `${String(role || "free").toLowerCase()}:${String(email || "").toLowerCase()}`;
}

function cleanMessage(msg = {}) {
  return {
    from: String(msg.from || "Admin"),
    body: String(msg.body || ""),
    password: msg.password ? String(msg.password) : "",
    date: String(msg.date || new Date().toISOString())
  };
}

app.get("/api/demo-state/messages", (req, res) => {
  const role = String(req.query.role || "free");
  const email = String(req.query.email || "");
  const key = messageKey(role, email);
  res.json({ ok: true, messages: demoState.userMessages[key] || [] });
});

app.post("/api/demo-state/messages", (req, res) => {
  const { role, email, message } = req.body || {};
  const key = messageKey(role || "free", email || "");
  if (!demoState.userMessages[key]) demoState.userMessages[key] = [];
  demoState.userMessages[key].unshift(cleanMessage(message));
  res.json({ ok: true, messages: demoState.userMessages[key] });
});


app.post("/api/demo-state/pending", (req, res) => {
  const txn = cleanTxn(req.body || {});
  if (!demoState.pending.some(t => t.id === txn.id)) {
    demoState.pending.unshift(txn);
  }
  res.json({ ok: true, txn, state: demoState });
});

app.post("/api/demo-state/sync-admin", (req, res) => {
  const { pending, approved } = req.body || {};
  if (Array.isArray(pending)) demoState.pending = pending.map(cleanTxn);
  if (Array.isArray(approved)) demoState.approved = approved.map(cleanTxn);
  res.json({ ok: true, state: demoState });
});

app.listen(PORT, () => {
  console.log(`APIGarden server running at http://localhost:${PORT}`);
  console.log(`Using OpenRouter model: ${MODEL}`);
  console.log(`Fallback model: ${FALLBACK_MODEL} | reasoning: ${ENABLE_REASONING}`);
});

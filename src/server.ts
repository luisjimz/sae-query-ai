import "dotenv/config";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { testConnection } from "./db.js";
import { runAgentStream } from "./agent.js";
import type { StoreFileFn } from "./agent.js";
import { isSafeQuery } from "./utils.js";
import {
  listSessions,
  loadSession,
  saveSession,
  deleteSession,
  createSession,
} from "./sessions.js";
import crypto from "crypto";

// --- File store (in-memory) ---

interface FileEntry {
  buffer: Buffer;
  filename: string;
  contentType: string;
  createdAt: number;
}

const fileStore = new Map<string, FileEntry>();

const storeFile: StoreFileFn = (entry) => {
  const id = crypto.randomUUID();
  fileStore.set(id, { ...entry, createdAt: Date.now() });
  return `/api/download/${id}`;
};

// Cleanup expired files every 10 min (expire after 30 min)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, f] of fileStore) {
    if (f.createdAt < cutoff) fileStore.delete(id);
  }
}, 10 * 60 * 1000);

const app = new Hono();

// --- Autenticación básica ---
const AUTH_USER = process.env.AUTH_USER || "admin";
const AUTH_PASS = process.env.AUTH_PASSWORD;

if (AUTH_PASS) {
  app.use("*", basicAuth({ username: AUTH_USER, password: AUTH_PASS }));
  console.log(`Autenticación activada (usuario: ${AUTH_USER})`);
} else {
  console.warn("ADVERTENCIA: AUTH_PASSWORD no configurada. La app está sin protección.");
}

// --- Session management (file-based) ---
const MAX_HISTORY = 10; // últimos 10 intercambios enviados al agente como contexto

// --- API Routes ---

app.get("/api/health", async (c) => {
  const result = await testConnection();
  return c.json(result, result.ok ? 200 : 503);
});

app.post("/api/ask", async (c) => {
  const body = await c.req.json<{ question: string; sessionId?: string }>();
  const { question, sessionId: reqSessionId } = body;

  if (!question || question.trim().length === 0) {
    return c.json({ error: "La pregunta no puede estar vacía" }, 400);
  }

  // Load or create session
  const sessionId = reqSessionId || crypto.randomUUID();
  const session = (reqSessionId ? loadSession(reqSessionId) : null) ?? createSession(sessionId);

  // Build agent history: only last MAX_HISTORY exchanges
  const historySlice = session.history.slice(-MAX_HISTORY * 2);

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({
        event: "session",
        data: JSON.stringify({ sessionId }),
      });

      const result = await runAgentStream(
        question,
        historySlice,
        isSafeQuery,
        storeFile,
        (event) => {
          stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          }).catch(() => {});
        }
      );

      console.log(`[ask] sessionId=${sessionId} toolCalls=${result.toolCallCount}`);

      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({
          type: "done",
          sql: result.sql,
          rowCount: result.rowCount,
          results: result.results,
        }),
      });

      // Persist to session file
      session.history.push(
        { role: "user", content: question },
        { role: "assistant", content: result.answer }
      );
      session.exchanges.push({
        question,
        answer: result.answer,
        sql: result.sql,
        rowCount: result.rowCount,
        results: result.results.slice(0, 20),
        timestamp: Date.now(),
      });
      if (session.title === "Nueva conversación") {
        session.title = question.slice(0, 80);
      }
      session.lastActive = Date.now();
      saveSession(session);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      console.error("Error en /api/ask:", message);
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ type: "error", message }),
      }).catch(() => {});
    }
  });
});

// --- Session API ---

app.get("/api/sessions", (c) => {
  return c.json(listSessions());
});

app.get("/api/sessions/:id", (c) => {
  const id = c.req.param("id");
  const session = loadSession(id);
  if (!session) {
    return c.json({ error: "Sesión no encontrada" }, 404);
  }
  return c.json({
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    lastActive: session.lastActive,
    exchanges: session.exchanges,
  });
});

app.delete("/api/sessions/:id", (c) => {
  const id = c.req.param("id");
  const deleted = deleteSession(id);
  if (!deleted) {
    return c.json({ error: "Sesión no encontrada" }, 404);
  }
  return c.json({ ok: true });
});

// --- File download ---

app.get("/api/download/:id", (c) => {
  const id = c.req.param("id");
  const entry = fileStore.get(id);
  if (!entry) {
    return c.json({ error: "Archivo no encontrado o expirado." }, 404);
  }
  return new Response(new Uint8Array(entry.buffer), {
    headers: {
      "Content-Type": entry.contentType,
      "Content-Disposition": `attachment; filename="${entry.filename}"`,
    },
  });
});

// --- Frontend UI ---

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SAE Query AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    header {
      background: #1a1a2e;
      border-bottom: 1px solid #2a2a4a;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .sidebar-toggle {
      background: none;
      border: 1px solid #333;
      color: #aab;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0.3rem 0.5rem;
      border-radius: 6px;
      line-height: 1;
    }
    .sidebar-toggle:hover { background: #2a2a4a; color: #e0e0e0; }

    header h1 {
      font-size: 1.4rem;
      color: #7c83ff;
      font-weight: 600;
    }

    header .subtitle {
      font-size: 0.85rem;
      color: #888;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #555;
      margin-left: auto;
      flex-shrink: 0;
    }

    .status-dot.online { background: #4caf50; }
    .status-dot.offline { background: #f44336; }

    .app-container {
      flex: 1;
      display: flex;
      min-height: 0;
      overflow: hidden;
    }

    /* --- Sidebar --- */
    .sidebar {
      width: 280px;
      background: #141425;
      border-right: 1px solid #2a2a4a;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
      transition: margin-left 0.2s ease;
    }
    .sidebar.hidden {
      margin-left: -280px;
    }
    .sidebar-header {
      padding: 0.75rem;
      border-bottom: 1px solid #2a2a4a;
    }
    .new-chat-btn {
      width: 100%;
      background: #7c83ff;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.6rem 1rem;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.9rem;
      transition: background 0.2s;
    }
    .new-chat-btn:hover { background: #6a71e0; }
    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }
    .session-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: all 0.15s;
    }
    .session-item:hover { background: #1a1a3a; }
    .session-item.active {
      background: #1e1e3a;
      border-left-color: #7c83ff;
    }
    .session-item-text {
      flex: 1;
      min-width: 0;
    }
    .session-item-title {
      font-size: 0.85rem;
      color: #ccc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-item.active .session-item-title { color: #fff; }
    .session-item-date {
      font-size: 0.7rem;
      color: #666;
      margin-top: 0.15rem;
    }
    .session-delete {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      opacity: 0;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .session-item:hover .session-delete { opacity: 1; }
    .session-delete:hover { background: #4a2a2a; color: #ff6b6b; }
    .session-empty {
      text-align: center;
      color: #555;
      font-size: 0.82rem;
      padding: 2rem 1rem;
    }

    @media (max-width: 768px) {
      .sidebar {
        position: absolute;
        z-index: 10;
        height: calc(100vh - 56px);
        top: 56px;
        left: 0;
      }
      .sidebar.hidden { margin-left: -280px; }
      header .subtitle { display: none; }
    }

    main {
      flex: 1;
      min-height: 0;
      min-width: 0;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      overflow: hidden;
    }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .suggestions button {
      background: #1e1e3a;
      color: #aab;
      border: 1px solid #333;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .suggestions button:hover {
      background: #2a2a5a;
      border-color: #7c83ff;
      color: #e0e0e0;
    }

    .messages {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
      scroll-behavior: smooth;
    }

    .message {
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      padding: 1.25rem;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      background: #1e2a4a;
      border-color: #2a3a6a;
      align-self: flex-end;
      max-width: 80%;
    }

    .message.user .label { color: #7c83ff; }

    .message .label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #4caf50;
      margin-bottom: 0.5rem;
    }

    .message .answer { line-height: 1.6; }
    .message .answer p { margin-bottom: 0.5rem; }
    .message .answer p:last-child { margin-bottom: 0; }
    .message .answer h2 { font-size: 1.15rem; color: #7c83ff; margin: 0.75rem 0 0.4rem; }
    .message .answer h3 { font-size: 1.05rem; color: #7c83ff; margin: 0.6rem 0 0.3rem; }
    .message .answer h4 { font-size: 0.95rem; color: #9a9eff; margin: 0.5rem 0 0.25rem; }
    .message .answer strong { color: #fff; }
    .message .answer em { color: #bbb; font-style: italic; }
    .message .answer code { background: #0d0d1a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; color: #c8c8ff; }
    .message .answer ul { margin: 0.4rem 0; padding-left: 1.5rem; }
    .message .answer ol { margin: 0.4rem 0; padding-left: 1.5rem; }
    .message .answer li { margin-bottom: 0.25rem; }
    .message .answer hr { border: none; border-top: 1px solid #2a2a4a; margin: 0.75rem 0; }

    .message .answer table.md-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
      margin: 0.5rem 0;
      display: table;
    }
    .message .answer .md-table th {
      background: #1e1e3a;
      color: #aab;
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 2px solid #3a3a5a;
      white-space: nowrap;
      font-weight: 600;
    }
    .message .answer .md-table td {
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid #222;
      white-space: nowrap;
    }
    .message .answer .md-table tr:nth-child(even) td { background: #151528; }
    .message .answer .md-table tr:hover td { background: #1a1a3a; }
    .message .answer .md-table-wrap { overflow-x: auto; margin: 0.5rem 0; }

    .message .toggle-details {
      background: none;
      border: none;
      color: #7c83ff;
      cursor: pointer;
      font-size: 0.8rem;
      margin-top: 0.75rem;
      padding: 0;
    }
    .message .toggle-details:hover { text-decoration: underline; }

    .message .details {
      display: none;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #2a2a4a;
    }
    .message .details.show { display: block; }

    .message .details .sql-box {
      background: #0d0d1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 0.75rem;
      font-family: 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.82rem;
      color: #c8c8ff;
      overflow-x: auto;
      margin-bottom: 0.75rem;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .message .details .row-count {
      font-size: 0.8rem;
      color: #888;
      margin-bottom: 0.5rem;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.78rem;
      overflow-x: auto;
      display: block;
    }
    .results-table th {
      background: #1e1e3a;
      color: #aab;
      padding: 0.5rem;
      text-align: left;
      position: sticky;
      top: 0;
      border-bottom: 1px solid #444;
      white-space: nowrap;
    }
    .results-table td {
      padding: 0.4rem 0.5rem;
      border-bottom: 1px solid #222;
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .results-table tr:hover td { background: #1a1a2e; }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #333;
      border-top-color: #7c83ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .stream-status { margin-bottom: 0.75rem; }
    .stream-status:empty { display: none; }
    .stream-status-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.82rem;
      color: #888;
      padding: 0.2rem 0;
    }
    .stream-status-item .spinner { width: 14px; height: 14px; border-width: 2px; }

    .status-icon {
      font-weight: bold;
      width: 14px;
      text-align: center;
      flex-shrink: 0;
    }
    .status-icon.success { color: #4caf50; }
    .status-icon.error { color: #f44336; }

    .input-area {
      position: sticky;
      bottom: 0;
      background: #0f0f0f;
      padding: 1rem 0;
    }

    .input-wrapper {
      display: flex;
      gap: 0.5rem;
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      padding: 0.5rem;
      transition: border-color 0.2s;
    }
    .input-wrapper:focus-within { border-color: #7c83ff; }
    .input-wrapper textarea {
      flex: 1;
      background: none;
      border: none;
      color: #e0e0e0;
      font-family: inherit;
      font-size: 0.95rem;
      resize: none;
      outline: none;
      padding: 0.5rem;
      min-height: 24px;
      max-height: 120px;
    }
    .input-wrapper button {
      background: #7c83ff;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.5rem 1.25rem;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.9rem;
      transition: background 0.2s;
      align-self: flex-end;
    }
    .input-wrapper button:hover { background: #6a71e0; }
    .input-wrapper button:disabled { background: #444; cursor: not-allowed; }

    .error-msg {
      background: #2e1a1a;
      border: 1px solid #4a2a2a;
      color: #ff6b6b;
      padding: 1rem;
      border-radius: 12px;
      animation: fadeIn 0.3s ease;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: #555;
      gap: 0.5rem;
      padding: 3rem 0;
    }
    .empty-state .icon { font-size: 3rem; opacity: 0.4; }
    .empty-state p { font-size: 0.95rem; }

    .download-btn {
      display: inline-block;
      background: #7c83ff;
      color: #fff;
      text-decoration: none;
      padding: 0.5rem 1.25rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      margin: 0.5rem 0;
      transition: background 0.2s;
    }
    .download-btn:hover { background: #6a71e0; }
  </style>
</head>
<body>
  <header>
    <button class="sidebar-toggle" onclick="toggleSidebar()" title="Historial">&#9776;</button>
    <h1>SAE Query AI</h1>
    <span class="subtitle">Consulta tu base de datos Aspel SAE con lenguaje natural</span>
    <div class="status-dot" id="statusDot" title="Verificando conexion..."></div>
  </header>

  <div class="app-container">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <button class="new-chat-btn" onclick="newChat()">+ Nueva conversacion</button>
      </div>
      <div class="session-list" id="sessionList">
        <div class="session-empty">Cargando historial...</div>
      </div>
    </aside>

    <main>
      <div class="suggestions" id="suggestions">
        <button onclick="ask(this.textContent)">Productos con existencia baja</button>
        <button onclick="ask(this.textContent)">Top 10 clientes por ventas</button>
        <button onclick="ask(this.textContent)">Facturas del ultimo mes</button>
        <button onclick="ask(this.textContent)">Productos mas vendidos</button>
        <button onclick="ask(this.textContent)">Clientes con saldo pendiente</button>
        <button onclick="ask(this.textContent)">Proveedores activos</button>
      </div>

      <div class="messages" id="messages">
        <div class="empty-state" id="emptyState">
          <div class="icon">&#128269;</div>
          <p>Escribe una pregunta sobre tu base de datos SAE</p>
          <p style="font-size:0.8rem">Ejemplo: "Cuantos productos tengo con existencia menor a 10?"</p>
        </div>
      </div>

      <div class="input-area">
        <div class="input-wrapper">
          <textarea
            id="questionInput"
            placeholder="Escribe tu pregunta aqui..."
            rows="1"
            onkeydown="handleKey(event)"
            oninput="autoResize(this)"
          ></textarea>
          <button id="sendBtn" onclick="send()">Preguntar</button>
        </div>
      </div>
    </main>
  </div>

  <script>
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('questionInput');
    const sendBtn = document.getElementById('sendBtn');
    const statusDot = document.getElementById('statusDot');
    const suggestionsEl = document.getElementById('suggestions');
    const sessionListEl = document.getElementById('sessionList');
    const sidebarEl = document.getElementById('sidebar');
    let isLoading = false;
    let sessionId = localStorage.getItem('sae_sessionId');

    // --- Init ---
    fetch('/api/health')
      .then(r => r.json())
      .then(d => {
        statusDot.classList.add(d.ok ? 'online' : 'offline');
        statusDot.title = d.message;
      })
      .catch(() => {
        statusDot.classList.add('offline');
        statusDot.title = 'No se pudo verificar la conexion';
      });

    loadSessionList();
    if (sessionId) {
      loadSessionHistory(sessionId);
    }

    // --- Sidebar ---
    function toggleSidebar() {
      sidebarEl.classList.toggle('hidden');
    }

    async function loadSessionList() {
      try {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        if (sessions.length === 0) {
          sessionListEl.innerHTML = '<div class="session-empty">Sin conversaciones previas</div>';
          return;
        }
        sessionListEl.innerHTML = '';
        sessions.forEach(function(s) {
          const el = document.createElement('div');
          el.className = 'session-item' + (s.id === sessionId ? ' active' : '');
          el.onclick = function(e) {
            if (e.target.closest('.session-delete')) return;
            selectSession(s.id);
          };
          const d = new Date(s.lastActive);
          const dateStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
            + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
          el.innerHTML = '<div class="session-item-text">'
            + '<div class="session-item-title">' + escapeHtml(s.title) + '</div>'
            + '<div class="session-item-date">' + dateStr + ' &middot; ' + s.exchangeCount + ' msg</div>'
            + '</div>'
            + '<button class="session-delete" onclick="deleteSessionById(\\'' + s.id + '\\')" title="Eliminar">&times;</button>';
          sessionListEl.appendChild(el);
        });
      } catch (e) {
        sessionListEl.innerHTML = '<div class="session-empty">Error cargando historial</div>';
      }
    }

    async function selectSession(id) {
      if (isLoading) return;
      sessionId = id;
      localStorage.setItem('sae_sessionId', id);
      await loadSessionHistory(id);
      loadSessionList();
      // Hide sidebar on mobile after selection
      if (window.innerWidth <= 768) sidebarEl.classList.add('hidden');
    }

    async function loadSessionHistory(id) {
      try {
        const res = await fetch('/api/sessions/' + id);
        if (!res.ok) {
          sessionId = null;
          localStorage.removeItem('sae_sessionId');
          return;
        }
        const data = await res.json();
        clearMessages();
        data.exchanges.forEach(function(ex) {
          appendExchange(ex.question, ex.answer, ex.sql, ex.rowCount, ex.results);
        });
        scrollToBottom();
      } catch (e) {
        sessionId = null;
        localStorage.removeItem('sae_sessionId');
      }
    }

    function newChat() {
      sessionId = null;
      localStorage.removeItem('sae_sessionId');
      clearMessages();
      loadSessionList();
      inputEl.focus();
      if (window.innerWidth <= 768) sidebarEl.classList.add('hidden');
    }

    async function deleteSessionById(id) {
      if (!confirm('Eliminar esta conversacion?')) return;
      await fetch('/api/sessions/' + id, { method: 'DELETE' });
      if (id === sessionId) {
        sessionId = null;
        localStorage.removeItem('sae_sessionId');
        clearMessages();
      }
      loadSessionList();
    }

    function clearMessages() {
      messagesEl.innerHTML = '<div class="empty-state" id="emptyState">'
        + '<div class="icon">&#128269;</div>'
        + '<p>Escribe una pregunta sobre tu base de datos SAE</p>'
        + '<p style="font-size:0.8rem">Ejemplo: "Cuantos productos tengo con existencia menor a 10?"</p>'
        + '</div>';
      suggestionsEl.style.display = 'flex';
    }

    function appendExchange(question, answer, sql, rowCount, results) {
      const es = document.getElementById('emptyState');
      if (es) es.remove();
      suggestionsEl.style.display = 'none';

      // User message
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userMsg.innerHTML = '<div class="label">Tu pregunta</div><div class="answer">' + escapeHtml(question) + '</div>';
      messagesEl.appendChild(userMsg);

      // Assistant message
      const msgEl = document.createElement('div');
      msgEl.className = 'message';
      msgEl.innerHTML = '<div class="label">Respuesta</div><div class="answer">' + renderMarkdown(answer) + '</div>';

      if (sql) {
        const detId = 'det-' + Math.random().toString(36).slice(2);
        let detailsHtml = '<div class="details" id="' + detId + '">';
        detailsHtml += '<div class="sql-box">' + escapeHtml(sql) + '</div>';
        detailsHtml += '<div class="row-count">' + (rowCount || 0) + ' resultado(s)</div>';
        if (results && results.length > 0) {
          const keys = Object.keys(results[0]);
          detailsHtml += '<table class="results-table"><thead><tr>';
          keys.forEach(function(k) { detailsHtml += '<th>' + escapeHtml(k) + '</th>'; });
          detailsHtml += '</tr></thead><tbody>';
          results.forEach(function(row) {
            detailsHtml += '<tr>';
            keys.forEach(function(k) {
              const val = row[k] == null ? '' : String(row[k]);
              detailsHtml += '<td title="' + escapeHtml(val) + '">' + escapeHtml(val) + '</td>';
            });
            detailsHtml += '</tr>';
          });
          detailsHtml += '</tbody></table>';
        }
        detailsHtml += '</div>';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-details';
        toggleBtn.textContent = 'Ver detalles tecnicos';
        toggleBtn.onclick = function() { toggleDetails(detId); };
        msgEl.appendChild(toggleBtn);
        msgEl.insertAdjacentHTML('beforeend', detailsHtml);
      }

      messagesEl.appendChild(msgEl);
    }

    // --- Input ---
    function handleKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function ask(text) {
      inputEl.value = text;
      send();
    }

    async function send() {
      const question = inputEl.value.trim();
      if (!question || isLoading) return;

      isLoading = true;
      sendBtn.disabled = true;
      inputEl.value = '';
      inputEl.style.height = 'auto';

      const es = document.getElementById('emptyState');
      if (es) es.remove();
      suggestionsEl.style.display = 'none';

      // User message
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userMsg.innerHTML = '<div class="label">Tu pregunta</div><div class="answer">' + escapeHtml(question) + '</div>';
      messagesEl.appendChild(userMsg);

      // Assistant message container
      const msgEl = document.createElement('div');
      msgEl.className = 'message';
      msgEl.innerHTML = '<div class="label">Respuesta</div>';

      const statusArea = document.createElement('div');
      statusArea.className = 'stream-status';
      msgEl.appendChild(statusArea);

      const answerArea = document.createElement('div');
      answerArea.className = 'answer';
      msgEl.appendChild(answerArea);

      messagesEl.appendChild(msgEl);
      scrollToBottom();

      let accText = '';
      let renderPending = false;
      let metaData = null;

      function scheduleRender() {
        if (!renderPending) {
          renderPending = true;
          requestAnimationFrame(() => {
            answerArea.innerHTML = renderMarkdown(accText);
            renderPending = false;
            scrollToBottom();
          });
        }
      }

      function completeSpinners() {
        statusArea.querySelectorAll('.stream-status-item .spinner').forEach(function(s) {
          const item = s.parentElement;
          s.remove();
          const icon = document.createElement('span');
          icon.className = 'status-icon success';
          icon.textContent = '\\u2713';
          item.insertBefore(icon, item.firstChild);
        });
      }

      function addStatus(text) {
        completeSpinners();
        const item = document.createElement('div');
        item.className = 'stream-status-item';
        item.innerHTML = '<div class="spinner"></div> ' + escapeHtml(text);
        statusArea.appendChild(item);
        scrollToBottom();
      }

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, sessionId }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error del servidor');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\\n\\n');
          buffer = parts.pop() || '';

          for (let pi = 0; pi < parts.length; pi++) {
            const part = parts[pi];
            if (!part.trim()) continue;
            const lines = part.split('\\n');
            let eventType = '';
            let eventData = '';
            for (let li = 0; li < lines.length; li++) {
              if (lines[li].startsWith('event: ')) eventType = lines[li].slice(7);
              else if (lines[li].startsWith('data: ')) eventData += lines[li].slice(6);
            }

            if (!eventType || !eventData) continue;
            let data;
            try { data = JSON.parse(eventData); } catch(e) { continue; }

            switch (eventType) {
              case 'session':
                if (data.sessionId) {
                  sessionId = data.sessionId;
                  localStorage.setItem('sae_sessionId', sessionId);
                }
                break;
              case 'status':
                addStatus(data.message);
                break;
              case 'tool_call': {
                const toolLabel = data.tool === 'query_database' ? 'Consultando base de datos...'
                  : data.tool === 'generate_file' ? 'Generando archivo...'
                  : 'Verificando conexion...';
                addStatus(toolLabel);
                break;
              }
              case 'tool_result': {
                const items = statusArea.querySelectorAll('.stream-status-item');
                const lastItem = items[items.length - 1];
                if (lastItem) {
                  const icon = data.success ? '\\u2713' : '\\u2717';
                  const cls = data.success ? 'success' : 'error';
                  lastItem.innerHTML = '<span class="status-icon ' + cls + '">' + icon + '</span> ' + escapeHtml(data.summary);
                }
                scrollToBottom();
                break;
              }
              case 'delta':
                if (!accText) completeSpinners();
                accText += data.text;
                scheduleRender();
                break;
              case 'done':
                metaData = data;
                completeSpinners();
                break;
              case 'error': {
                completeSpinners();
                const errEl = document.createElement('div');
                errEl.className = 'error-msg';
                errEl.textContent = 'Error: ' + (data.message || 'Error desconocido');
                msgEl.appendChild(errEl);
                scrollToBottom();
                break;
              }
            }
          }
        }

        // Final render
        if (accText) {
          answerArea.innerHTML = renderMarkdown(accText);
        }

        // Add details toggle
        if (metaData && metaData.sql) {
          const detId = 'det-' + Date.now();
          let detailsHtml = '<div class="details" id="' + detId + '">';
          detailsHtml += '<div class="sql-box">' + escapeHtml(metaData.sql) + '</div>';
          detailsHtml += '<div class="row-count">' + metaData.rowCount + ' resultado(s)</div>';

          if (metaData.results && metaData.results.length > 0) {
            const keys = Object.keys(metaData.results[0]);
            detailsHtml += '<table class="results-table"><thead><tr>';
            keys.forEach(function(k) { detailsHtml += '<th>' + escapeHtml(k) + '</th>'; });
            detailsHtml += '</tr></thead><tbody>';
            metaData.results.forEach(function(row) {
              detailsHtml += '<tr>';
              keys.forEach(function(k) {
                const val = row[k] == null ? '' : String(row[k]);
                detailsHtml += '<td title="' + escapeHtml(val) + '">' + escapeHtml(val) + '</td>';
              });
              detailsHtml += '</tr>';
            });
            detailsHtml += '</tbody></table>';
          }
          detailsHtml += '</div>';

          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'toggle-details';
          toggleBtn.textContent = 'Ver detalles tecnicos';
          toggleBtn.onclick = function() { toggleDetails(detId); };
          msgEl.appendChild(toggleBtn);
          msgEl.insertAdjacentHTML('beforeend', detailsHtml);
        }

        // Refresh sidebar to show new/updated session
        loadSessionList();

      } catch (err) {
        statusArea.innerHTML = '';
        answerArea.innerHTML = '';
        const errEl = document.createElement('div');
        errEl.className = 'error-msg';
        errEl.textContent = 'Error de conexion: ' + err.message;
        msgEl.appendChild(errEl);
      }

      isLoading = false;
      sendBtn.disabled = false;
      scrollToBottom();
      inputEl.focus();
    }

    // --- Utilities ---
    function scrollToBottom() {
      requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
    }

    function toggleDetails(id) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('show');
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function renderMarkdown(text) {
      const tables = [];
      const lines = text.split('\\n');
      const processed = [];
      let i = 0;

      while (i < lines.length) {
        if (lines[i].includes('|') && lines[i].trim().startsWith('|')) {
          const tableLines = [];
          while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]);
            i++;
          }
          if (tableLines.length >= 2) {
            const placeholder = '%%TABLE_' + tables.length + '%%';
            tables.push(renderTable(tableLines));
            processed.push(placeholder);
            continue;
          }
          tableLines.forEach(l => processed.push(l));
          continue;
        }
        processed.push(lines[i]);
        i++;
      }

      let html = escapeHtml(processed.join('\\n'));
      html = html.replace(/\\[([^\\]]+)\\]\\((\\/api\\/download\\/[^)]+)\\)/g, '<a class="download-btn" href="$2" download>$1</a>');
      html = html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      html = html.replace(/^---$/gm, '<hr>');
      html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
      html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)/g, '<em>$1</em>');
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/((?:<li>.*<\\/li>\\n?)+)/g, '<ul>$1</ul>');
      html = html.replace(/^\\d+\\.\\s+(.+)$/gm, '<li>$1</li>');
      html = html.replace(/\\n\\n/g, '</p><p>');
      html = html.replace(/\\n/g, '<br>');
      html = '<p>' + html + '</p>';
      tables.forEach((tableHtml, idx) => {
        html = html.replace('%%TABLE_' + idx + '%%', '</p>' + tableHtml + '<p>');
      });
      html = html.replace(/<p><\\/p>/g, '');
      return html;
    }

    function inlineMarkdown(text) {
      let h = escapeHtml(text);
      h = h.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      h = h.replace(/(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)/g, '<em>$1</em>');
      h = h.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      return h;
    }

    function renderTable(lines) {
      const parseRow = (line) => line.split('|').slice(1, -1).map(c => c.trim());
      const headers = parseRow(lines[0]);
      const isSeparator = (line) => /^[\\s|:-]+$/.test(line.replace(/-/g, ''));
      const dataStart = (lines.length > 1 && isSeparator(lines[1])) ? 2 : 1;
      let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headers.forEach(h => { html += '<th>' + inlineMarkdown(h) + '</th>'; });
      html += '</tr></thead><tbody>';
      for (let r = dataStart; r < lines.length; r++) {
        const cells = parseRow(lines[r]);
        if (cells.length === 0) continue;
        html += '<tr>';
        cells.forEach(c => { html += '<td>' + inlineMarkdown(c) + '</td>'; });
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    }

    inputEl.focus();
  </script>
</body>
</html>`;

app.get("/", (c) => {
  return c.html(HTML);
});

// --- Start server ---

const port = Number(process.env.PORT) || 3005;

console.log(`SAE Query AI iniciando en http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

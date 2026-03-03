import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { query } from "./db.js";
import { testConnection } from "./db.js";
import { generateSQL, interpretResults } from "./ai.js";
import type { ChatMessage } from "./ai.js";
import crypto from "crypto";

const app = new Hono();

// --- Session store (in-memory) ---
const MAX_HISTORY = 10; // últimos 10 intercambios por sesión

interface Session {
  history: ChatMessage[];
  lastActive: number;
}

const sessions = new Map<string, Session>();

function getSession(sessionId?: string): { id: string; session: Session } {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActive = Date.now();
    return { id: sessionId, session };
  }
  const id = crypto.randomUUID();
  const session: Session = { history: [], lastActive: Date.now() };
  sessions.set(id, session);
  return { id, session };
}

// Limpiar sesiones inactivas cada 30 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.lastActive < cutoff) sessions.delete(id);
  }
}, 10 * 60 * 1000);

// --- Validación de seguridad ---
const BLOCKED_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "EXECUTE",
  "GRANT",
  "REVOKE",
  "MERGE",
  "CALL",
];

function isSafeQuery(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith("SELECT")) return false;
  for (const keyword of BLOCKED_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) return false;
  }
  return true;
}

// --- API Routes ---

app.get("/api/health", async (c) => {
  const result = await testConnection();
  return c.json(result, result.ok ? 200 : 503);
});

app.post("/api/ask", async (c) => {
  try {
    const body = await c.req.json<{ question: string; sessionId?: string }>();
    const { question, sessionId: reqSessionId } = body;

    if (!question || question.trim().length === 0) {
      return c.json({ error: "La pregunta no puede estar vacía" }, 400);
    }

    const { id: sessionId, session } = getSession(reqSessionId);

    // 1. Generar SQL con Claude (con historial de conversación)
    const { sql, explanation } = await generateSQL(question, session.history);

    if (!sql) {
      // Guardar en historial incluso si no generó SQL
      session.history.push(
        { role: "user", content: question },
        { role: "assistant", content: `No se pudo generar SQL: ${explanation}` }
      );
      if (session.history.length > MAX_HISTORY * 2) {
        session.history = session.history.slice(-MAX_HISTORY * 2);
      }

      return c.json({
        sessionId,
        question,
        sql: "",
        rowCount: 0,
        results: [],
        answer: explanation,
      });
    }

    // 2. Validar seguridad del SQL
    if (!isSafeQuery(sql)) {
      return c.json(
        {
          error:
            "La query generada no es segura. Solo se permiten consultas SELECT.",
          sql,
        },
        403
      );
    }

    // 3. Ejecutar contra Firebird
    let results: Record<string, unknown>[];
    try {
      results = await query(sql);
    } catch (dbError) {
      const dbMsg = dbError instanceof Error ? dbError.message : "Error de base de datos";
      console.error("Error SQL:", sql, dbMsg);
      return c.json({
        sessionId,
        question,
        sql,
        rowCount: 0,
        results: [],
        answer: `Error al ejecutar la consulta en la base de datos: ${dbMsg}\n\nSQL generado: ${sql}`,
      });
    }
    const rowCount = results.length;

    // 4. Interpretar resultados con Claude
    const answer = await interpretResults(question, sql, results, rowCount);

    // 5. Guardar en historial
    session.history.push(
      { role: "user", content: question },
      { role: "assistant", content: `SQL: ${sql}\nResultados: ${rowCount} filas.\nRespuesta: ${answer}` }
    );
    if (session.history.length > MAX_HISTORY * 2) {
      session.history = session.history.slice(-MAX_HISTORY * 2);
    }

    return c.json({
      sessionId,
      question,
      sql,
      rowCount,
      results: results.slice(0, 20),
      answer,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("Error en /api/ask:", message);
    return c.json({ error: message }, 500);
  }
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
      min-height: 100vh;
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

    main {
      flex: 1;
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
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
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
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

    .message .answer {
      line-height: 1.6;
    }

    .message .answer p { margin-bottom: 0.5rem; }
    .message .answer p:last-child { margin-bottom: 0; }
    .message .answer h2 { font-size: 1.15rem; color: #7c83ff; margin: 0.75rem 0 0.4rem; }
    .message .answer h3 { font-size: 1.05rem; color: #7c83ff; margin: 0.6rem 0 0.3rem; }
    .message .answer h4 { font-size: 0.95rem; color: #9a9eff; margin: 0.5rem 0 0.25rem; }
    .message .answer strong { color: #fff; }
    .message .answer em { color: #bbb; font-style: italic; }
    .message .answer code { background: #0d0d1a; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; color: #c8c8ff; }
    .message .answer ul { margin: 0.4rem 0; padding-left: 1.5rem; }
    .message .answer li { margin-bottom: 0.25rem; }

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

    .loading {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1.25rem;
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      animation: fadeIn 0.3s ease;
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #333;
      border-top-color: #7c83ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .loading-text {
      color: #888;
      font-size: 0.9rem;
    }

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
  </style>
</head>
<body>
  <header>
    <h1>SAE Query AI</h1>
    <span class="subtitle">Consulta tu base de datos Aspel SAE con lenguaje natural</span>
    <div class="status-dot" id="statusDot" title="Verificando conexion..."></div>
  </header>

  <main>
    <div class="suggestions">
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

  <script>
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('questionInput');
    const sendBtn = document.getElementById('sendBtn');
    const statusDot = document.getElementById('statusDot');
    const emptyState = document.getElementById('emptyState');
    let isLoading = false;
    let sessionId = null;

    // Check health
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

      if (emptyState) emptyState.remove();

      // User message
      const userMsg = document.createElement('div');
      userMsg.className = 'message user';
      userMsg.innerHTML = '<div class="label">Tu pregunta</div><div class="answer">' + escapeHtml(question) + '</div>';
      messagesEl.appendChild(userMsg);

      // Loading
      const loadingEl = document.createElement('div');
      loadingEl.className = 'loading';
      loadingEl.innerHTML = '<div class="spinner"></div><span class="loading-text">Analizando pregunta y consultando base de datos...</span>';
      messagesEl.appendChild(loadingEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, sessionId }),
        });

        const data = await res.json();
        loadingEl.remove();

        if (data.sessionId) sessionId = data.sessionId;

        if (data.error) {
          const errEl = document.createElement('div');
          errEl.className = 'error-msg';
          errEl.textContent = 'Error: ' + data.error;
          messagesEl.appendChild(errEl);
        } else {
          const msgEl = document.createElement('div');
          msgEl.className = 'message';

          let detailsHtml = '';
          if (data.sql) {
            detailsHtml = '<div class="details" id="det-' + Date.now() + '">';
            detailsHtml += '<div class="sql-box">' + escapeHtml(data.sql) + '</div>';
            detailsHtml += '<div class="row-count">' + data.rowCount + ' resultado(s)</div>';

            if (data.results && data.results.length > 0) {
              const keys = Object.keys(data.results[0]);
              detailsHtml += '<table class="results-table"><thead><tr>';
              keys.forEach(k => { detailsHtml += '<th>' + escapeHtml(k) + '</th>'; });
              detailsHtml += '</tr></thead><tbody>';
              data.results.forEach(row => {
                detailsHtml += '<tr>';
                keys.forEach(k => {
                  const val = row[k] == null ? '' : String(row[k]);
                  detailsHtml += '<td title="' + escapeHtml(val) + '">' + escapeHtml(val) + '</td>';
                });
                detailsHtml += '</tr>';
              });
              detailsHtml += '</tbody></table>';
            }
            detailsHtml += '</div>';
          }

          const detId = 'det-' + Date.now();
          msgEl.innerHTML =
            '<div class="label">Respuesta</div>' +
            '<div class="answer">' + renderMarkdown(data.answer) + '</div>' +
            (data.sql ? '<button class="toggle-details" onclick="toggleDetails(\\'' + detId + '\\')">Ver detalles tecnicos</button>' : '') +
            detailsHtml.replace(/id="det-\\d+"/, 'id="' + detId + '"');

          messagesEl.appendChild(msgEl);
        }
      } catch (err) {
        loadingEl.remove();
        const errEl = document.createElement('div');
        errEl.className = 'error-msg';
        errEl.textContent = 'Error de conexion: ' + err.message;
        messagesEl.appendChild(errEl);
      }

      isLoading = false;
      sendBtn.disabled = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      inputEl.focus();
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
      let html = escapeHtml(text);
      // Headers
      html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
      html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
      // Bold
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)/g, '<em>$1</em>');
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      // Unordered lists
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/((?:<li>.*<\\/li>\\n?)+)/g, '<ul>$1</ul>');
      // Ordered lists
      html = html.replace(/^\\d+\\.\\s+(.+)$/gm, '<li>$1</li>');
      // Line breaks (double newline = paragraph)
      html = html.replace(/\\n\\n/g, '</p><p>');
      html = html.replace(/\\n/g, '<br>');
      return '<p>' + html + '</p>';
    }

    inputEl.focus();
  </script>
</body>
</html>`;

app.get("/", (c) => {
  return c.html(HTML);
});

// --- Start server ---

const port = Number(process.env.PORT) || 3000;

console.log(`SAE Query AI iniciando en http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

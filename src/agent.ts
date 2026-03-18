import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { query, testConnection } from "./db.js";
import { SAE_SCHEMA } from "./schema.js";
import { generatePDF, generateExcel, generateDocx } from "./files.js";

const client = new Anthropic();

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 15;

// --- Logging ---

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function log(tag: string, msg: string, data?: Record<string, unknown>) {
  const prefix = `${timestamp()} [${tag}]`;
  if (data) {
    const compact = Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" | ");
    console.log(`${prefix} ${msg} — ${compact}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

export type StoreFileFn = (entry: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}) => string;

// --- System Prompt ---

const AGENT_SYSTEM_PROMPT = `Eres un asistente experto en bases de datos de Aspel SAE 9.0 (Firebird SQL).
Tu trabajo es responder preguntas en español sobre el sistema SAE consultando la base de datos.
El usuario puede hacer preguntas de seguimiento que se refieren a preguntas anteriores. Usa el contexto de la conversación para entender referencias implícitas.

${SAE_SCHEMA}

## REGLA CRÍTICA — NUNCA INVENTES DATOS:
- SIEMPRE ejecuta una consulta con \`query_database\` antes de responder cualquier pregunta sobre datos.
- NUNCA respondas con datos de memoria, de respuestas anteriores, o inventados. Si el usuario pide un desglose, detalle, o seguimiento, DEBES hacer una nueva consulta a la base de datos.
- Si no puedes consultar la base de datos por alguna razón, dilo explícitamente. NUNCA rellenes con datos aproximados o estimados.
- Cada cifra, nombre, fecha y monto en tu respuesta DEBE provenir directamente del resultado de \`query_database\` en este mismo turno.

## ESTRATEGIA DE DESCOMPOSICIÓN — PREGUNTAS COMPLEJAS:
Antes de escribir cualquier SQL, analiza la pregunta del usuario y planifica tu enfoque:

1. **Planifica primero.** Si la pregunta tiene múltiples partes o requiere diferentes tipos de análisis, identifica cuántas consultas necesitas y qué responde cada una. Piensa esto ANTES de generar SQL.
2. **Una consulta por llamada.** Ejecuta cada consulta en una llamada separada a \`query_database\`. NUNCA intentes combinar análisis independientes en una sola query gigante con múltiples JOINs y subconsultas anidadas — esto produce errores y resultados incorrectos.
3. **Construye la respuesta incrementalmente.** Ejecuta tus consultas una por una, y al final sintetiza todos los resultados en una respuesta clara y unificada para el usuario.
4. **Ejemplos de descomposición:**
   - "¿Cuál es el saldo por cobrar del cliente X y qué productos le vendimos más?" → Query 1: saldo y datos del cliente. Query 2: productos más vendidos al cliente.
   - "Dame el aging de cartera y los clientes con mala práctica crediticia" → Query 1: resumen de antigüedad de saldos. Query 2: clientes con facturas vencidas 60+ días que siguen comprando.
   - "Ventas por vendedor y por zona este mes" → Query 1: ventas por vendedor. Query 2: ventas por zona.

## Instrucciones de comportamiento:
1. Usa la herramienta \`query_database\` para ejecutar consultas SELECT contra la base de datos Firebird.
2. Usa SOLO queries SELECT. La herramienta rechazará cualquier otra operación.
3. Sintaxis Firebird OBLIGATORIA:
   - Usa FIRST N en lugar de LIMIT. Ejemplo: SELECT FIRST 10 * FROM INVE02
   - Usa CONTAINING para búsquedas parciales (case-insensitive)
   - Usa TRIM() en campos de texto al comparar o hacer JOINs
   - No uses punto y coma al final de las queries
   - Nombres de tablas y campos siempre en MAYÚSCULAS
4. Si una query falla, analiza el error y prueba con una query corregida. Puedes hacer múltiples intentos.
5. Si necesitas más información para responder correctamente, puedes hacer múltiples consultas.
6. Prefiere usar funciones de agregación (SUM, COUNT, AVG, GROUP BY) para resumir datos grandes en lugar de traer muchas filas. Solo trae filas individuales cuando el usuario pide un listado específico. Si necesitas un listado, usa FIRST N para limitar (máximo razonable: 100 filas).
7. Responde SIEMPRE en español, de forma clara y natural, como si le explicaras a un usuario no técnico.
8. Si los datos incluyen montos, formatea los números con separadores de miles y dos decimales.
9. Si hay fechas, preséntalas en formato legible (ej: "15 de enero de 2024").
10. Si no puedes obtener los datos por una razón válida, explícalo claramente en español.
11. Para preguntas sobre formas de pago, condiciones de crédito, o antigüedad de cartera: usa las tablas FACTC02 (cobros) y COND_PAG02 (condiciones de pago) además de FACTF02. El campo FACTF02.CONTADO indica si es venta de contado, y FACTF02.FORMADEPAGOSAT indica la forma de pago SAT.

## Generación de archivos:
Cuando el usuario pida un reporte, exportación, o archivo descargable (Excel, PDF, Word/DOCX):
1. Primero usa \`query_database\` para explorar los datos y confirmar que existen.
2. Luego usa \`generate_file\` con la misma query (sin FIRST N — se necesitan todos los datos para el archivo).
3. Incluye el enlace de descarga en tu respuesta usando markdown: [Descargar reporte](url)
4. Indica el formato, el número de registros incluidos, y el nombre del archivo.
5. Si el usuario no especificó el formato, usa Excel por defecto.
6. Proporciona un título descriptivo que incluya el período o filtro aplicado.`;

// --- Tool Definitions ---

const TOOLS: Tool[] = [
  {
    name: "query_database",
    description:
      "Ejecuta una consulta SELECT contra la base de datos Firebird de Aspel SAE 9.0. " +
      "Solo se permiten consultas SELECT. Devuelve los resultados como JSON o un mensaje de error.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description:
            "La query SQL SELECT a ejecutar. Debe usar sintaxis Firebird " +
            "(FIRST N en lugar de LIMIT, TRIM() en campos de texto, " +
            "CONTAINING para búsquedas parciales). " +
            "NO incluir punto y coma al final.",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "test_connection",
    description:
      "Verifica si la conexión a la base de datos Firebird está activa y funcionando. " +
      "Útil para diagnosticar problemas de conectividad antes de hacer consultas.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "generate_file",
    description:
      "Genera un archivo descargable (PDF, Excel o DOCX) con los resultados de una consulta SQL. " +
      "Usar cuando el usuario pide un reporte, exportación o archivo descargable. " +
      "SIEMPRE ejecutar primero query_database para verificar que hay datos, " +
      "luego llamar generate_file con la misma query sin límite de filas.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description:
            "La query SQL SELECT para obtener TODOS los datos del archivo. " +
            "No usar FIRST N — se necesitan todas las filas para el reporte.",
        },
        format: {
          type: "string",
          enum: ["pdf", "excel", "docx"],
          description: "Formato del archivo: 'pdf', 'excel' o 'docx'.",
        },
        title: {
          type: "string",
          description: "Título del reporte. Ej: 'Ventas de Febrero 2024'.",
        },
        columns: {
          type: "array",
          description: "Definición opcional de columnas con etiquetas legibles.",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Nombre del campo SQL." },
              label: { type: "string", description: "Etiqueta legible." },
            },
            required: ["field", "label"],
          },
        },
      },
      required: ["sql", "format", "title"],
    },
  },
];

// --- Tool Execution ---

function sanitizeFilename(title: string): string {
  return title.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_\-]/g, "").slice(0, 60) || "reporte";
}

async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  isSafeQuery: (sql: string) => boolean,
  storeFile: StoreFileFn
): Promise<string> {
  if (toolName === "query_database") {
    const sql = toolInput.sql as string;

    if (!sql || typeof sql !== "string") {
      log("query", "REJECTED — missing or invalid sql param");
      return JSON.stringify({ error: "Parámetro 'sql' faltante o inválido." });
    }

    if (!isSafeQuery(sql)) {
      log("query", "BLOCKED by safety check", { sql });
      return JSON.stringify({
        error:
          "Query rechazada por seguridad. Solo se permiten consultas SELECT sin " +
          "operaciones de modificación (INSERT, UPDATE, DELETE, DROP, ALTER, etc.).",
        sql_recibido: sql,
      });
    }

    const t0 = Date.now();
    try {
      const results = await query(sql);
      const rowCount = results.length;
      const elapsed = Date.now() - t0;
      log("query", "OK", { rows: rowCount, ms: elapsed, sql });
      const preview = results.slice(0, 100);
      return JSON.stringify({
        ok: true,
        rowCount,
        results: preview,
        truncated: rowCount > 100,
        nota: rowCount > 100
          ? `Se obtuvieron ${rowCount} filas pero solo se muestran las primeras 100. Si necesitas datos agregados (totales, promedios, conteos), usa funciones SQL como SUM(), COUNT(), AVG(), GROUP BY en lugar de traer todas las filas.`
          : undefined,
      });
    } catch (err) {
      const elapsed = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      log("query", "ERROR", { ms: elapsed, error: message, sql });
      return JSON.stringify({
        error: `Error ejecutando la query: ${message}`,
        sql_intentado: sql,
        sugerencia:
          "Verifica los nombres de tablas y columnas. Recuerda usar TRIM() en comparaciones de texto.",
      });
    }
  }

  if (toolName === "test_connection") {
    const t0 = Date.now();
    const result = await testConnection();
    log("db", result.ok ? "Connection OK" : "Connection FAILED", { ms: Date.now() - t0, message: result.message });
    return JSON.stringify(result);
  }

  if (toolName === "generate_file") {
    const sql = toolInput.sql as string;
    const format = toolInput.format as "pdf" | "excel" | "docx";
    const title = toolInput.title as string;
    const columns = toolInput.columns as { field: string; label: string }[] | undefined;

    if (!sql || !format || !title) {
      return JSON.stringify({ error: "Parámetros requeridos: sql, format, title." });
    }

    if (!isSafeQuery(sql)) {
      return JSON.stringify({ error: "Query rechazada por seguridad. Solo se permiten consultas SELECT." });
    }

    const t0 = Date.now();
    try {
      const data = await query(sql);
      if (data.length === 0) {
        log("file", "No data returned, skipping file generation", { format, title });
        return JSON.stringify({ error: "La consulta no devolvió resultados. No se puede generar el archivo." });
      }

      const fileReq = { data, title, columns };
      let buffer: Buffer;
      let contentType: string;
      let ext: string;

      switch (format) {
        case "pdf":
          buffer = await generatePDF(fileReq);
          contentType = "application/pdf";
          ext = "pdf";
          break;
        case "excel":
          buffer = await generateExcel(fileReq);
          contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          ext = "xlsx";
          break;
        case "docx":
          buffer = await generateDocx(fileReq);
          contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          ext = "docx";
          break;
      }

      const filename = `${sanitizeFilename(title)}.${ext}`;
      const url = storeFile({ buffer, filename, contentType });
      const elapsed = Date.now() - t0;
      log("file", "Generated OK", { format, rows: data.length, filename, sizeKB: Math.round(buffer.length / 1024), ms: elapsed });

      return JSON.stringify({
        ok: true,
        url,
        filename,
        format,
        rowCount: data.length,
        mensaje: `Archivo ${format.toUpperCase()} generado con ${data.length} registro(s).`,
      });
    } catch (err) {
      const elapsed = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      log("file", "ERROR generating file", { format, ms: elapsed, error: message });
      return JSON.stringify({ error: `Error generando archivo: ${message}` });
    }
  }

  return JSON.stringify({ error: `Herramienta desconocida: ${toolName}` });
}

// --- Agent Result ---

export interface AgentResult {
  answer: string;
  sql: string;
  rowCount: number;
  results: Record<string, unknown>[];
  toolCallCount: number;
}

// --- Stream Events ---

export type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'tool_call'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; success: boolean; summary: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; sql: string; rowCount: number; results: Record<string, unknown>[] }
  | { type: 'error'; message: string };

// --- Agentic Loop ---

export async function runAgent(
  question: string,
  history: MessageParam[],
  isSafeQueryFn: (sql: string) => boolean,
  storeFile: StoreFileFn
): Promise<AgentResult> {
  const messages: MessageParam[] = [
    ...history,
    { role: "user", content: question },
  ];

  let iterationCount = 0;
  let lastSql = "";
  let lastRowCount = 0;
  let lastResults: Record<string, unknown>[] = [];
  const agentStart = Date.now();

  log("agent", `START question="${question.slice(0, 120)}"`, { model: MODEL(), historyMsgs: history.length });

  while (iterationCount < MAX_TOOL_ITERATIONS) {
    iterationCount++;

    const t0 = Date.now();
    const response = await client.messages.create({
      model: MODEL(),
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    log("agent", `Iteration ${iterationCount}`, {
      stop: response.stop_reason,
      in_tokens: response.usage.input_tokens,
      out_tokens: response.usage.output_tokens,
      llm_ms: Date.now() - t0,
    });

    // Model finished with a text response
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const answer = textBlock && "text" in textBlock ? textBlock.text : "No se pudo generar una respuesta.";
      log("agent", "DONE", { iterations: iterationCount, totalMs: Date.now() - agentStart, answerLen: answer.length });
      return {
        answer,
        sql: lastSql,
        rowCount: lastRowCount,
        results: lastResults.slice(0, 20),
        toolCallCount: iterationCount,
      };
    }

    // Model wants to use tools
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        log("tool", `Calling ${toolUse.name}`, toolUse.input as Record<string, unknown>);

        const resultStr = await executeToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          isSafeQueryFn,
          storeFile
        );

        // Track last successful DB query for the UI
        if (toolUse.name === "query_database") {
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.ok) {
              lastSql = (toolUse.input as { sql: string }).sql;
              lastRowCount = parsed.rowCount;
              lastResults = parsed.results;
            }
          } catch {
            // ignore parse errors in tracking
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultStr,
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop reason (max_tokens, etc.)
    log("agent", `Unexpected stop_reason: ${response.stop_reason}`, { iteration: iterationCount });
    break;
  }

  // Iteration cap reached or unexpected stop
  log("agent", "ABORTED — iteration cap or unexpected stop", { iterations: iterationCount, totalMs: Date.now() - agentStart });
  return {
    answer:
      "El agente no pudo completar la tarea dentro del número máximo de pasos. " +
      "Por favor reformula tu pregunta.",
    sql: lastSql,
    rowCount: lastRowCount,
    results: lastResults.slice(0, 20),
    toolCallCount: iterationCount,
  };
}

// --- Streaming Agentic Loop ---

export async function runAgentStream(
  question: string,
  history: MessageParam[],
  isSafeQueryFn: (sql: string) => boolean,
  storeFile: StoreFileFn,
  emit: (event: StreamEvent) => void
): Promise<AgentResult> {
  const messages: MessageParam[] = [
    ...history,
    { role: "user", content: question },
  ];

  let iterationCount = 0;
  let lastSql = "";
  let lastRowCount = 0;
  let lastResults: Record<string, unknown>[] = [];
  let answerText = "";
  const agentStart = Date.now();

  log("agent-stream", `START question="${question.slice(0, 120)}"`, { model: MODEL(), historyMsgs: history.length });

  while (iterationCount < MAX_TOOL_ITERATIONS) {
    iterationCount++;

    emit({
      type: 'status',
      message: iterationCount === 1 ? 'Analizando tu pregunta...' : 'Analizando resultados...',
    });

    const t0 = Date.now();
    const stream = client.messages.stream({
      model: MODEL(),
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Stream text deltas to client in real-time
    answerText = "";
    stream.on('text', (text) => {
      answerText += text;
      emit({ type: 'delta', text });
    });

    const response = await stream.finalMessage();

    log("agent-stream", `Iteration ${iterationCount}`, {
      stop: response.stop_reason,
      in_tokens: response.usage.input_tokens,
      out_tokens: response.usage.output_tokens,
      llm_ms: Date.now() - t0,
    });

    // Model finished with a text response
    if (response.stop_reason === "end_turn") {
      if (!answerText) {
        const textBlock = response.content.find((b) => b.type === "text");
        answerText = textBlock && "text" in textBlock ? textBlock.text : "No se pudo generar una respuesta.";
      }
      log("agent-stream", "DONE", { iterations: iterationCount, totalMs: Date.now() - agentStart, answerLen: answerText.length });
      return {
        answer: answerText,
        sql: lastSql,
        rowCount: lastRowCount,
        results: lastResults.slice(0, 20),
        toolCallCount: iterationCount,
      };
    }

    // Model wants to use tools
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        log("tool", `Calling ${toolUse.name}`, toolUse.input as Record<string, unknown>);

        emit({
          type: 'tool_call',
          tool: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
        });

        const resultStr = await executeToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          isSafeQueryFn,
          storeFile
        );

        // Track last successful DB query and emit result
        if (toolUse.name === "query_database") {
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.ok) {
              lastSql = (toolUse.input as { sql: string }).sql;
              lastRowCount = parsed.rowCount;
              lastResults = parsed.results;
              emit({ type: 'tool_result', tool: toolUse.name, success: true, summary: `${parsed.rowCount} resultado(s) obtenidos` });
            } else {
              emit({ type: 'tool_result', tool: toolUse.name, success: false, summary: parsed.error || 'Error en la consulta' });
            }
          } catch {
            emit({ type: 'tool_result', tool: toolUse.name, success: false, summary: 'Error procesando resultado' });
          }
        } else if (toolUse.name === "generate_file") {
          try {
            const parsed = JSON.parse(resultStr);
            emit({ type: 'tool_result', tool: toolUse.name, success: !!parsed.ok, summary: parsed.mensaje || parsed.error || 'Completado' });
          } catch {
            emit({ type: 'tool_result', tool: toolUse.name, success: false, summary: 'Error generando archivo' });
          }
        } else {
          try {
            const parsed = JSON.parse(resultStr);
            emit({ type: 'tool_result', tool: toolUse.name, success: parsed.ok !== false, summary: parsed.ok ? 'Conexión exitosa' : (parsed.error || 'Error') });
          } catch {
            emit({ type: 'tool_result', tool: toolUse.name, success: true, summary: 'Completado' });
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultStr,
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop reason
    log("agent-stream", `Unexpected stop_reason: ${response.stop_reason}`, { iteration: iterationCount });
    break;
  }

  // Iteration cap reached or unexpected stop
  log("agent-stream", "ABORTED — iteration cap or unexpected stop", { iterations: iterationCount, totalMs: Date.now() - agentStart });
  const fallbackAnswer = answerText ||
    "El agente no pudo completar la tarea dentro del número máximo de pasos. Por favor reformula tu pregunta.";
  return {
    answer: fallbackAnswer,
    sql: lastSql,
    rowCount: lastRowCount,
    results: lastResults.slice(0, 20),
    toolCallCount: iterationCount,
  };
}

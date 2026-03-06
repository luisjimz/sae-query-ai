import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { query, testConnection } from "./db.js";
import { SAE_SCHEMA } from "./schema.js";

const client = new Anthropic();

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 5;

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
10. Si no puedes obtener los datos por una razón válida, explícalo claramente en español.`;

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
];

// --- Tool Execution ---

async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  isSafeQuery: (sql: string) => boolean
): Promise<string> {
  if (toolName === "query_database") {
    const sql = toolInput.sql as string;

    if (!sql || typeof sql !== "string") {
      return JSON.stringify({ error: "Parámetro 'sql' faltante o inválido." });
    }

    if (!isSafeQuery(sql)) {
      return JSON.stringify({
        error:
          "Query rechazada por seguridad. Solo se permiten consultas SELECT sin " +
          "operaciones de modificación (INSERT, UPDATE, DELETE, DROP, ALTER, etc.).",
        sql_recibido: sql,
      });
    }

    try {
      const results = await query(sql);
      const rowCount = results.length;
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
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        error: `Error ejecutando la query: ${message}`,
        sql_intentado: sql,
        sugerencia:
          "Verifica los nombres de tablas y columnas. Recuerda usar TRIM() en comparaciones de texto.",
      });
    }
  }

  if (toolName === "test_connection") {
    const result = await testConnection();
    return JSON.stringify(result);
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

// --- Agentic Loop ---

export async function runAgent(
  question: string,
  history: MessageParam[],
  isSafeQueryFn: (sql: string) => boolean
): Promise<AgentResult> {
  const messages: MessageParam[] = [
    ...history,
    { role: "user", content: question },
  ];

  let iterationCount = 0;
  let lastSql = "";
  let lastRowCount = 0;
  let lastResults: Record<string, unknown>[] = [];

  while (iterationCount < MAX_TOOL_ITERATIONS) {
    iterationCount++;

    const response = await client.messages.create({
      model: MODEL(),
      max_tokens: 4096,
      system: AGENT_SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    console.log(
      `[agent] Iteración ${iterationCount} | stop_reason: ${response.stop_reason} | ` +
        `input_tokens: ${response.usage.input_tokens} | output_tokens: ${response.usage.output_tokens}`
    );

    // Model finished with a text response
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const answer = textBlock && "text" in textBlock ? textBlock.text : "No se pudo generar una respuesta.";
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
        console.log(`[agent] Ejecutando tool: ${toolUse.name}`, toolUse.input);

        const resultStr = await executeToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          isSafeQueryFn
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
    break;
  }

  // Iteration cap reached or unexpected stop
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

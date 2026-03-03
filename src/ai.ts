import { SAE_SCHEMA } from "./schema.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = () => process.env.OPENROUTER_API_KEY || "";
const MODEL = () => process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function chat(
  label: string,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
  const totalChars = systemPrompt.length + messages.reduce((acc, m) => acc + m.content.length, 0);
  const estimatedInputTokens = Math.ceil(totalChars / 4);
  console.log(`[${label}] Enviando ~${estimatedInputTokens} tokens (estimado) | mensajes: ${messages.length} | max_tokens: ${maxTokens}`);

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${err}`);
  }

  const data = (await res.json()) as OpenRouterResponse;

  if (data.usage) {
    console.log(
      `[${label}] Tokens usados → input: ${data.usage.prompt_tokens} | output: ${data.usage.completion_tokens} | total: ${data.usage.total_tokens}`
    );
  }

  return data.choices[0]?.message?.content || "";
}

const SYSTEM_PROMPT = `Eres un asistente experto en bases de datos de Aspel SAE 9.0 (Firebird SQL).
Tu trabajo es convertir preguntas en español sobre el sistema SAE a queries SQL válidas para Firebird.
El usuario puede hacer preguntas de seguimiento que se refieren a preguntas anteriores. Usa el contexto de la conversación para entender referencias implícitas.

${SAE_SCHEMA}

## Reglas ESTRICTAS:
1. SOLO genera queries SELECT. NUNCA INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, EXECUTE, GRANT o REVOKE.
2. Usa sintaxis Firebird: FIRST N en lugar de LIMIT, CONTAINING para búsquedas parciales, TRIM() para comparaciones de texto.
3. Siempre limita los resultados con FIRST (máximo 50 filas) para evitar consultas muy grandes.
4. Usa TRIM() en campos de texto al hacer comparaciones o JOINs.
5. Responde SIEMPRE en formato JSON con exactamente esta estructura:
{
  "sql": "SELECT ...",
  "explanation": "Breve explicación de lo que hace la query"
}
6. Si la pregunta no tiene relación con la base de datos o no puedes generar un query válido, responde:
{
  "sql": "",
  "explanation": "Explicación de por qué no se puede generar la query"
}
7. NO incluyas comentarios SQL (--) ni punto y coma al final.
8. Los nombres de tablas y campos siempre en MAYÚSCULAS.`;

interface SQLResult {
  sql: string;
  explanation: string;
}

export async function generateSQL(
  question: string,
  history: ChatMessage[] = []
): Promise<SQLResult> {
  const messages: ChatMessage[] = [
    ...history,
    {
      role: "user",
      content: `Genera un query SQL de Firebird para responder esta pregunta: "${question}"\n\nResponde SOLO con el JSON, sin markdown ni texto adicional.`,
    },
  ];

  const text = await chat("generateSQL", SYSTEM_PROMPT, messages, 1024);

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed: SQLResult = JSON.parse(cleaned);
    return parsed;
  } catch {
    return {
      sql: "",
      explanation: "No se pudo interpretar la respuesta del modelo.",
    };
  }
}

export async function interpretResults(
  question: string,
  sql: string,
  results: Record<string, unknown>[],
  rowCount: number
): Promise<string> {
  const resultsPreview = results.slice(0, 20);

  return chat(
    "interpretResults",
    `Eres un asistente que interpreta resultados de consultas SQL de un sistema Aspel SAE 9.0 (sistema administrativo empresarial mexicano).
Debes responder en español, de forma clara y natural, como si le explicaras los datos a un usuario no técnico.
Si los datos incluyen montos, formatea los números con separadores de miles y dos decimales.
Si hay fechas, preséntalas en formato legible (ej: "15 de enero de 2024").
Si no hay resultados, explica qué podría significar.`,
    [
      {
        role: "user",
        content: `El usuario preguntó: "${question}"

Se ejecutó este SQL: ${sql}

Se obtuvieron ${rowCount} resultado(s). Aquí están los datos (máximo 20 filas):

${JSON.stringify(resultsPreview, null, 2)}

Interpreta estos resultados de forma clara y natural en español. Si hay muchos datos, haz un resumen útil.`,
      },
    ],
    2048
  );
}

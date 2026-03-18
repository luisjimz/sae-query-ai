import Firebird from "node-firebird";

const QUERY_TIMEOUT_MS = 30_000; // 30s max per query
const CONNECT_TIMEOUT_MS = 10_000; // 10s max to connect

const options: Firebird.Options = {
  host: process.env.FB_HOST || "127.0.0.1",
  port: Number(process.env.FB_PORT) || 3050,
  database: process.env.FB_DATABASE || "",
  user: process.env.FB_USER || "SYSDBA",
  password: process.env.FB_PASSWORD || "masterkey",
  lowercase_keys: false,
  pageSize: 4096,
};

// Use a connection pool to avoid opening/closing connections per query
const pool = Firebird.pool(5, options);

function getConnection(): Promise<Firebird.Database> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: no se pudo obtener conexión en ${CONNECT_TIMEOUT_MS}ms`));
    }, CONNECT_TIMEOUT_MS);

    pool.get((err, db) => {
      clearTimeout(timer);
      if (err) {
        reject(new Error(`Error conectando a Firebird: ${err.message}`));
        return;
      }
      resolve(db);
    });
  });
}

export async function query(sql: string): Promise<Record<string, unknown>[]> {
  const db = await getConnection();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      db.detach();
      reject(new Error(`Timeout: query excedió ${QUERY_TIMEOUT_MS}ms — ${sql.slice(0, 100)}`));
    }, QUERY_TIMEOUT_MS);

    db.query(sql, [], (err, result) => {
      clearTimeout(timer);
      db.detach();

      if (err) {
        reject(new Error(`Error ejecutando query: ${err.message}`));
        return;
      }

      resolve((result as Record<string, unknown>[]) || []);
    });
  });
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  let db: Firebird.Database;
  try {
    db = await getConnection();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      db.detach();
      resolve({ ok: false, message: `Timeout: test query excedió ${QUERY_TIMEOUT_MS}ms` });
    }, QUERY_TIMEOUT_MS);

    db.query("SELECT 1 FROM RDB$DATABASE", [], (err) => {
      clearTimeout(timer);
      db.detach();

      if (err) {
        resolve({ ok: false, message: `Error en query de prueba: ${err.message}` });
        return;
      }

      resolve({ ok: true, message: "Conexión exitosa a Firebird" });
    });
  });
}

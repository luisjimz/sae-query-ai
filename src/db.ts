import Firebird from "node-firebird";

const options: Firebird.Options = {
  host: process.env.FB_HOST || "127.0.0.1",
  port: Number(process.env.FB_PORT) || 3050,
  database: process.env.FB_DATABASE || "",
  user: process.env.FB_USER || "SYSDBA",
  password: process.env.FB_PASSWORD || "masterkey",
  lowercase_keys: false,
  pageSize: 4096,
};

export function query(sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) {
        reject(new Error(`Error conectando a Firebird: ${err.message}`));
        return;
      }

      db.query(sql, [], (err, result) => {
        db.detach();

        if (err) {
          reject(new Error(`Error ejecutando query: ${err.message}`));
          return;
        }

        resolve((result as Record<string, unknown>[]) || []);
      });
    });
  });
}

export function testConnection(): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    Firebird.attach(options, (err, db) => {
      if (err) {
        resolve({ ok: false, message: `No se pudo conectar: ${err.message}` });
        return;
      }

      db.query("SELECT 1 FROM RDB$DATABASE", [], (err) => {
        db.detach();

        if (err) {
          resolve({ ok: false, message: `Error en query de prueba: ${err.message}` });
          return;
        }

        resolve({ ok: true, message: "Conexión exitosa a Firebird" });
      });
    });
  });
}

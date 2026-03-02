# SAE Query AI

Asistente web para consultar una base de datos de **Aspel SAE 9.0** (Firebird) usando lenguaje natural, impulsado por Claude AI.

## Flujo

```
Usuario pregunta en español
  → Claude genera SQL (Firebird)
  → Se ejecuta contra la BD (solo lectura)
  → Claude interpreta los resultados
  → Respuesta en lenguaje natural
```

## Requisitos

- Node.js 18+
- Acceso a una base de datos Firebird de Aspel SAE 9.0
- API key de Anthropic

## Instalación

```bash
npm install
```

## Configuración

Copia `.env.example` a `.env` y ajusta los valores:

```bash
cp .env.example .env
```

Variables requeridas:

| Variable | Descripción |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic |
| `FB_HOST` | Host del servidor Firebird |
| `FB_PORT` | Puerto de Firebird (default: 3050) |
| `FB_DATABASE` | Ruta al archivo .FDB |
| `FB_USER` | Usuario de Firebird (default: SYSDBA) |
| `FB_PASSWORD` | Password de Firebird |
| `PORT` | Puerto del servidor web (default: 3000) |

## Uso

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm run build
npm start
```

Abre `http://localhost:3000` en tu navegador.

## Seguridad

- Solo se ejecutan queries `SELECT`. Cualquier otro tipo de query es bloqueado.
- La validación se realiza tanto en el prompt del LLM como en el código del servidor.
- Usa siempre una **copia** del archivo `.FDB`, nunca el archivo original en producción.
- La API key de Anthropic solo existe en el servidor, nunca se expone al cliente.

## Stack

- **Backend**: Node.js + Hono + TypeScript
- **Database**: Firebird via node-firebird
- **LLM**: Claude Sonnet via @anthropic-ai/sdk
- **Frontend**: HTML/CSS/JS inline (sin framework, sin build step)

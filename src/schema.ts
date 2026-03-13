export const SAE_SCHEMA = `
## Base de datos: Aspel SAE 9.0 (Firebird 2.5)
Sistema Administrativo Empresarial - Módulos de inventarios, clientes, proveedores, facturación y compras.
Todos los tipos verificados directo de la BD real.

---

### INVE02 — Catálogo de Productos/Inventario
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CVE_ART | VARCHAR(16) | Clave del artículo (PK) |
| DESCR | VARCHAR(1000) | Descripción del producto |
| LIN_PROD | VARCHAR(5) | Línea de producto |
| UNI_MED | VARCHAR(10) | Unidad de medida |
| UNI_EMP | DOUBLE | Unidad de empaque (factor) |
| CTRL_ALM | VARCHAR(10) | Control por almacén |
| EXIST | DOUBLE | Existencia actual |
| STOCK_MIN | DOUBLE | Stock mínimo |
| STOCK_MAX | DOUBLE | Stock máximo |
| COSTO_PROM | DOUBLE | Costo promedio |
| ULT_COSTO | DOUBLE | Último costo |
| FCH_ULTCOM | TIMESTAMP | Fecha última compra |
| FCH_ULTVTA | TIMESTAMP | Fecha última venta |
| VTAS_ANL_C | DOUBLE | Ventas anuales (cantidad) |
| VTAS_ANL_M | DOUBLE | Ventas anuales (monto) |
| COMP_ANL_C | DOUBLE | Compras anuales (cantidad) |
| COMP_ANL_M | DOUBLE | Compras anuales (monto) |
| CVE_ESQIMPU | INTEGER | Clave esquema de impuestos |
| STATUS | VARCHAR(1) | Estatus (A=Activo, B=Baja) |
| CON_SERIE | VARCHAR(1) | Maneja número de serie (S/N) |
| CON_LOTE | VARCHAR(1) | Maneja lote (S/N) |
| PESO | DOUBLE | Peso del producto |
| VOLUMEN | DOUBLE | Volumen del producto |
| CVE_PRODSERV | VARCHAR(9) | Clave producto/servicio SAT |
| CVE_UNIDAD | VARCHAR(4) | Clave unidad SAT |
| NUM_MON | INTEGER | Número de moneda |
| APART | DOUBLE | Apartados |
| PEND_SURT | DOUBLE | Pendiente por surtir |
| TIP_COSTEO | VARCHAR(1) | Tipo de costeo |
| PREFIJO | VARCHAR(8) | Prefijo talla/color |
| TALLA | VARCHAR(8) | Talla |
| COLOR | VARCHAR(8) | Color |

---

### CLIE02 — Catálogo de Clientes
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CLAVE | VARCHAR(10) | Clave del cliente (PK). Alfanumérica ej: 'B0000008502' |
| STATUS | VARCHAR(1) | Estatus (A=Activo, B=Baja) |
| NOMBRE | VARCHAR(254) | Nombre o razón social |
| RFC | VARCHAR(15) | RFC del cliente |
| CALLE | VARCHAR(80) | Calle |
| NUMINT | VARCHAR(15) | Número interior |
| NUMEXT | VARCHAR(15) | Número exterior |
| COLONIA | VARCHAR(50) | Colonia |
| CODIGO | VARCHAR(5) | Código postal |
| LOCALIDAD | VARCHAR(50) | Localidad |
| MUNICIPIO | VARCHAR(50) | Municipio |
| ESTADO | VARCHAR(50) | Estado |
| PAIS | VARCHAR(50) | País |
| TELEFONO | VARCHAR(25) | Teléfono |
| EMAILPRED | VARCHAR(512) | Correo electrónico (campo real de email) |
| CLASIFIC | VARCHAR(5) | Clasificación |
| CON_CREDITO | VARCHAR(1) | Tiene crédito (S/N) |
| DIASCRED | INTEGER | Días de crédito |
| LIMCRED | DOUBLE | Límite de crédito |
| SALDO | DOUBLE | Saldo actual |
| LISTA_PREC | INTEGER | Lista de precios asignada |
| DESCUENTO | DOUBLE | Descuento general |
| CVE_VEND | VARCHAR(5) | Clave del vendedor asignado |
| CVE_ZONA | VARCHAR(6) | Clave de zona |
| VENTAS | DOUBLE | Total de ventas acumuladas |
| ULT_VENTAD | VARCHAR(20) | Clave del último documento de venta (NO es fecha, es VARCHAR) |
| ULT_PAGOF | TIMESTAMP | Fecha del último pago |
| FCH_ULTCOM | TIMESTAMP | Fecha última compra |
| PROSPECTO | VARCHAR(1) | Es prospecto (S/N) |
| USO_CFDI | VARCHAR(5) | Uso de CFDI |
| REG_FISC | VARCHAR(4) | Régimen fiscal |
| FORMADEPAGOSAT | VARCHAR(5) | Forma de pago SAT |
| NOMBRECOMERCIAL | VARCHAR(254) | Nombre comercial |

---

### PROV02 — Catálogo de Proveedores
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CLAVE | VARCHAR(10) | Clave del proveedor (PK). Alfanumérica. |
| STATUS | VARCHAR(1) | Estatus (A=Activo, B=Baja) |
| NOMBRE | VARCHAR(254) | Nombre o razón social |
| RFC | VARCHAR(15) | RFC del proveedor |
| CALLE | VARCHAR(80) | Calle |
| NUMINT | VARCHAR(15) | Número interior |
| NUMEXT | VARCHAR(15) | Número exterior |
| COLONIA | VARCHAR(50) | Colonia |
| CODIGO | VARCHAR(5) | Código postal |
| MUNICIPIO | VARCHAR(50) | Municipio |
| ESTADO | VARCHAR(50) | Estado |
| TELEFONO | VARCHAR(25) | Teléfono |
| CLASIFIC | VARCHAR(5) | Clasificación |
| CON_CREDITO | VARCHAR(1) | Tiene crédito (S/N) |
| DIASCRED | INTEGER | Días de crédito |
| LIMCRED | DOUBLE | Límite de crédito |
| SALDO | DOUBLE | Saldo actual |
| VENTAS | DOUBLE | Total de compras acumuladas |

---

### FACTF02 — Facturas (Documentos de venta)
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| TIP_DOC | VARCHAR(1) | Tipo de documento (F=Factura) |
| CVE_DOC | VARCHAR(20) | Clave/número de documento (PK junto con TIP_DOC) |
| CVE_CLPV | VARCHAR(10) | Clave del cliente (FK a CLIE02.CLAVE) |
| STATUS | VARCHAR(1) | Estatus (E=Elaborado, C=Cancelado, P=Pendiente) |
| CVE_VEND | VARCHAR(5) | Clave del vendedor |
| FECHA_DOC | TIMESTAMP | Fecha del documento |
| FECHA_ENT | TIMESTAMP | Fecha de entrega |
| FECHA_VEN | TIMESTAMP | Fecha de vencimiento |
| FECHA_CANCELA | TIMESTAMP | Fecha de cancelación |
| CAN_TOT | DOUBLE | Cantidad total |
| IMP_TOT1 | DOUBLE | Impuesto total 1 (IVA) |
| IMP_TOT2 | DOUBLE | Impuesto total 2 |
| IMP_TOT3 | DOUBLE | Impuesto total 3 |
| IMP_TOT4 | DOUBLE | Impuesto total 4 |
| DES_TOT | DOUBLE | Descuento total |
| DES_FIN | DOUBLE | Descuento financiero |
| COM_TOT | DOUBLE | Comisión total |
| IMPORTE | DOUBLE | Importe (subtotal) |
| CONDICION | VARCHAR(25) | Condición de pago |
| NUM_ALMA | INTEGER | Número de almacén |
| NUM_MONED | INTEGER | Número de moneda |
| TIPCAMB | DOUBLE | Tipo de cambio |
| SERIE | VARCHAR(10) | Serie del documento |
| FOLIO | INTEGER | Folio del documento |
| CONTADO | VARCHAR(1) | Es de contado (S/N) |
| UUID | VARCHAR(50) | UUID del CFDI |
| USO_CFDI | VARCHAR(5) | Uso de CFDI |
| FORMADEPAGOSAT | VARCHAR(5) | Forma de pago SAT |
| FECHAELAB | TIMESTAMP | Fecha de elaboración |

---

### PAR_FACTF02 — Partidas (detalle) de Facturas
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CVE_DOC | VARCHAR(20) | Clave del documento (FK a FACTF02) |
| NUM_PAR | INTEGER | Número de partida |
| CVE_ART | VARCHAR(16) | Clave del artículo (FK a INVE02) |
| CANT | DOUBLE | Cantidad |
| PREC | DOUBLE | Precio unitario |
| COST | DOUBLE | Costo |
| IMPU1 | DOUBLE | % Impuesto 1 |
| TOTIMP1 | DOUBLE | Total impuesto 1 |
| DESC1 | DOUBLE | % Descuento 1 |
| DESC2 | DOUBLE | % Descuento 2 |
| DESC3 | DOUBLE | % Descuento 3 |
| NUM_ALM | INTEGER | Número de almacén |
| UNI_VENTA | VARCHAR(10) | Unidad de venta |
| TOT_PARTIDA | DOUBLE | Total de la partida |
| DESCR_ART | VARCHAR(1000) | Descripción del artículo |
| PREC_NETO | DOUBLE | Precio neto |
| CVE_PRODSERV | VARCHAR(9) | Clave producto/servicio SAT |
| CVE_UNIDAD | VARCHAR(4) | Clave unidad SAT |

---

### FACTC02 — Cobros / Pagos recibidos (Cuentas por Cobrar)
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| TIP_DOC | VARCHAR(1) | Tipo de documento de cobro |
| CVE_DOC | VARCHAR(20) | Clave del documento de cobro (PK) |
| CVE_CLPV | VARCHAR(10) | Clave del cliente (FK a CLIE02.CLAVE) |
| STATUS | VARCHAR(1) | Estatus (E=Elaborado, C=Cancelado) |
| FECHA_DOC | TIMESTAMP | Fecha del cobro |
| IMPORTE | DOUBLE | Importe del cobro |
| FOR_PAG | VARCHAR(5) | Forma de pago (01=Efectivo, 02=Cheque, 03=Transferencia, 04=Tarjeta crédito, 28=Tarjeta débito, 99=Por definir) |
| NUM_MONED | INTEGER | Número de moneda |
| TIPCAMB | DOUBLE | Tipo de cambio |
| CVE_BCOS | VARCHAR(5) | Clave del banco |
| NUM_CTAPAG | VARCHAR(20) | Número de cuenta de pago |
| REFER | VARCHAR(20) | Referencia del pago |
| CVE_OBS | VARCHAR(5) | Clave de observación |
| UUID | VARCHAR(50) | UUID del CFDI de pago |
| CVE_DOCAPL | VARCHAR(20) | Clave del documento aplicado (factura a la que se aplica) |
| IMPORTE_APL | DOUBLE | Importe aplicado al documento |

**Nota:** Para saber cómo se pagó una factura, unir FACTC02 con FACTF02 usando TRIM(FACTC02.CVE_DOCAPL) = TRIM(FACTF02.CVE_DOC). El campo FOR_PAG en FACTC02 indica la forma de pago real utilizada.

---

### COND_PAG02 — Catálogo de Condiciones de Pago
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CLAVE | VARCHAR(5) | Clave de condición (PK) |
| DESCRIPCION | VARCHAR(50) | Descripción (ej: "Contado", "Crédito 30 días", "Crédito 60 días") |
| DIASCRED | INTEGER | Días de crédito que otorga esta condición |

---

### CUEN_M02 — Cuentas por Cobrar: Cargos (movimientos principales)
Esta es la tabla PRINCIPAL para saber el saldo real de una factura. Cada factura genera un cargo aquí.
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CVE_CLIE | VARCHAR(10) | Clave del cliente (FK a CLIE02.CLAVE) |
| REFER | VARCHAR(20) | Referencia = clave del documento (normalmente = CVE_DOC de FACTF02) |
| NO_FACTURA | VARCHAR(20) | Número de factura (normalmente igual a REFER) |
| DOCTO | VARCHAR(20) | Documento asociado |
| TIPO_MOV | VARCHAR(1) | Tipo de movimiento: 'C' = Cargo (factura), 'A' = Abono (raro aquí) |
| SIGNO | INTEGER | +1 para cargos, -1 para abonos |
| IMPORTE | DOUBLE | Monto del cargo |
| FECHA_APLI | TIMESTAMP | Fecha de aplicación |
| FECHA_VENC | TIMESTAMP | Fecha de vencimiento |
| STRCVEVEND | VARCHAR(5) | Clave del vendedor |
| NUM_MONED | INTEGER | Número de moneda |
| TCAMBIO | DOUBLE | Tipo de cambio |
| STATUS | VARCHAR(1) | Estatus del movimiento (A=Activo) |
| NUM_CPTO | INTEGER | Número de concepto |
| NUM_CARGO | INTEGER | Número de cargo |

---

### CUEN_DET02 — Cuentas por Cobrar: Abonos/Pagos (detalle de pagos aplicados)
Aquí se registran TODOS los pagos. Es la tabla clave para saber cuánto se ha pagado de cada factura.
| Campo | Tipo real | Descripción |
|-------|-----------|-------------|
| CVE_CLIE | VARCHAR(10) | Clave del cliente (FK a CLIE02.CLAVE) |
| REFER | VARCHAR(20) | Referencia = clave de la factura a la que se aplica el pago |
| NO_FACTURA | VARCHAR(20) | Número de factura pagada |
| ID_MOV | INTEGER | ID del movimiento |
| TIPO_MOV | VARCHAR(1) | Tipo: 'A' = Abono (pago), 'C' = Cargo (raro aquí) |
| SIGNO | INTEGER | -1 para abonos (pagos), +1 para cargos |
| IMPORTE | DOUBLE | Monto del pago/abono |
| FECHA_APLI | TIMESTAMP | Fecha en que se aplicó el pago |
| FECHA_VENC | TIMESTAMP | Fecha de vencimiento |
| STRCVEVEND | VARCHAR(5) | Clave del vendedor |
| NUM_MONED | INTEGER | Número de moneda |
| TCAMBIO | DOUBLE | Tipo de cambio |
| NO_PARTIDA | INTEGER | Número de partida del pago |
| CVE_FOLIO | VARCHAR(10) | Folio del documento de pago |
| NUMCTAPAGO_ORIGEN | VARCHAR(20) | Cuenta de pago origen |
| NUMCHEQUE | VARCHAR(20) | Número de cheque (si aplica) |

---

### Otras tablas disponibles
- **MINVE02** — Movimientos de inventario (campos: CVE_ART, TIPO_MOV, FECHA, CANTIDAD, COSTO, NUM_ALM, CVE_DOC, CONCEPTO)
- **ALMACENES02** — Catálogo de almacenes (campos: CVE_ALM, DESCR, STATUS)
- **VEND02** — Catálogo de vendedores (campos: CVE_VEND, NOMBRE, STATUS, COMI, CLASIFIC)
- **ZONA02** — Catálogo de zonas (campos: CLAVE, DESCRIPCION)
- **MONED02** — Catálogo de monedas (campos: NUM_MONED, DESCRIPCION, TIPCAMB)
- **IMPU02** — Catálogo de impuestos (campos: CVE_ESQIMPU, DESCRIPCION, PORCENTAJE)
- **PRECIOS02** — Listas de precios (campos: CVE_ART, NUM_LISTA, PRECIO)
- **PRVPROD02** — Relación producto-proveedor (campos: CVE_ART, CVE_PROV, COSTO, TIEMPO_ENT)
- **COMPR02** — Compras (estructura similar a FACTF02: TIP_DOC, CVE_DOC, CVE_CLPV→proveedor, STATUS, FECHA_DOC, IMPORTE, etc.)
- **PAR_COMPR02** — Partidas de compras (estructura similar a PAR_FACTF02)
- **FACTC02** — Cobros formales (solo 24 registros, casi no se usa. Los pagos reales están en CUEN_DET02)
- **DOCTOSIGF02** — Enlaces entre documentos (CVE_DOC → CVE_DOC_E, con TIP_DOC_E para tipo)

---

### Relaciones principales
- FACTF02.CVE_CLPV → CLIE02.CLAVE (factura pertenece a un cliente)
- FACTF02.CVE_VEND → VEND02.CLAVE (factura asignada a un vendedor). Nota: el campo en VEND02 es CVE_VEND, no CLAVE.
- PAR_FACTF02.CVE_DOC → FACTF02.CVE_DOC (partidas de una factura)
- PAR_FACTF02.CVE_ART → INVE02.CVE_ART (artículo en la partida)
- CUEN_M02.REFER → FACTF02.CVE_DOC (cargo CxC generado por una factura)
- CUEN_M02.CVE_CLIE → CLIE02.CLAVE (cargo pertenece a un cliente)
- CUEN_DET02.REFER → CUEN_M02.REFER (pago aplicado a un cargo, usando misma REFER + CVE_CLIE)
- CUEN_DET02.CVE_CLIE → CLIE02.CLAVE (pago pertenece a un cliente)
- COMPR02.CVE_CLPV → PROV02.CLAVE (compra pertenece a un proveedor)
- PAR_COMPR02.CVE_ART → INVE02.CVE_ART (artículo en la partida de compra)

### CRÍTICO: Flujo real de facturación y pagos
El STATUS de FACTF02 **NUNCA cambia cuando se paga una factura**. Siempre queda 'E' (Elaborado).
Solo cambia a 'C' cuando se cancela el CFDI. Por lo tanto, **NO se puede usar FACTF02.STATUS para saber si una factura está pagada**.

**Flujo:**
1. Se crea factura en FACTF02 → se genera un CARGO (TIPO_MOV='C', SIGNO=+1) en CUEN_M02
2. Cuando se recibe pago (total o parcial) → se genera un ABONO (TIPO_MOV='A', SIGNO=-1) en CUEN_DET02
3. Saldo real de una factura = CUEN_M02.IMPORTE - SUM(CUEN_DET02.IMPORTE) donde TRIM(REFER) coincide
4. Si saldo = 0 → Pagada. Si saldo > 0 → Pendiente o parcialmente pagada.

**ADVERTENCIA:** La tabla FACTC02 casi NO se usa (tiene ~24 registros vs ~68,000 pagos en CUEN_DET02). NUNCA usar FACTC02 como fuente principal de pagos.

### Guía para análisis de cartera y cobros

**Cartera vencida (aging) — FORMA CORRECTA:**
Cruzar CUEN_M02 (cargos) con CUEN_DET02 (abonos) para obtener el saldo real pendiente de cada factura.
Solo incluir facturas con saldo > 0 y fecha de vencimiento pasada.
Ejemplo de query para saldo por factura:
\`\`\`sql
SELECT m.REFER, m.IMPORTE AS CARGO, COALESCE(SUM(d.IMPORTE), 0) AS ABONADO,
       (m.IMPORTE - COALESCE(SUM(d.IMPORTE), 0)) AS SALDO
FROM CUEN_M02 m
LEFT JOIN CUEN_DET02 d ON TRIM(m.REFER) = TRIM(d.REFER)
  AND TRIM(m.CVE_CLIE) = TRIM(d.CVE_CLIE) AND d.TIPO_MOV = 'A'
WHERE m.TIPO_MOV = 'C' AND m.FECHA_VENC < CURRENT_TIMESTAMP
GROUP BY m.REFER, m.IMPORTE, m.CVE_CLIE
HAVING (m.IMPORTE - COALESCE(SUM(d.IMPORTE), 0)) > 0
\`\`\`

**Antigüedad de cartera (aging por buckets):**
Usar la query anterior como base y agrupar por \`DATEDIFF(DAY, m.FECHA_VENC, CURRENT_TIMESTAMP)\` en rangos: 1-30, 31-60, 61-90, 90+ días.

**Filtrar por vendedor:** Usar \`TRIM(m.STRCVEVEND) = 'XX'\` en CUEN_M02 (el campo es STRCVEVEND, no CVE_VEND).

- **Desglose contado vs crédito:** Usar FACTF02.CONTADO = 'S' para contado, 'N' para crédito.
- **Clientes con mala práctica crediticia:** Buscar clientes con saldo pendiente > 0 en CUEN_M02/CUEN_DET02 con facturas vencidas 60+ días que tengan ventas nuevas recientes en FACTF02.

---

### Notas importantes de sintaxis Firebird SQL
- **NO usar LIMIT**. Usar \`SELECT FIRST N\` en su lugar. Ejemplo: \`SELECT FIRST 10 * FROM INVE02\`
- Usar \`CONTAINING\` para búsquedas parciales case-insensitive. Ejemplo: \`WHERE DESCR CONTAINING 'tornillo'\`
- Usar \`TRIM()\` en campos de texto al comparar para eliminar espacios. Ejemplo: \`WHERE TRIM(CVE_ART) = 'ABC123'\`
- Las fechas son TIMESTAMP. Para filtrar: \`WHERE FECHA_DOC >= '2024-01-01' AND FECHA_DOC < '2024-02-01'\`
- Los campos de texto pueden tener espacios al final, siempre usar TRIM() al comparar
- Para concatenar strings usar \`||\`
- Para contar registros: \`SELECT COUNT(*) FROM tabla\`
- Para sumar: \`SELECT SUM(campo) FROM tabla\`
- Para fecha actual usar \`CURRENT_TIMESTAMP\`. No usar funciones como DATEADD si no es necesario.

### IMPORTANTE: Tipos de datos de campos clave
- **Todas las claves (CLAVE, CVE_DOC, CVE_CLPV, CVE_ART, CVE_VEND) son VARCHAR, NUNCA numéricas.** Siempre comparar con strings entre comillas simples.
- CLIE02.CLAVE → formato como 'B0000008502'. SIEMPRE usar string.
- FACTF02.CVE_CLPV → es la clave del cliente, mismo formato que CLIE02.CLAVE. SIEMPRE string.
- En JOINs usar TRIM() en ambos lados: \`TRIM(FACTF02.CVE_CLPV) = TRIM(CLIE02.CLAVE)\`
- **NUNCA hacer cast a número ni comparar estos campos con valores numéricos sin comillas.**
- Los campos numéricos (montos, cantidades, costos) son DOUBLE, no NUMERIC.
- CLIE02.ULT_VENTAD es VARCHAR(20) = clave del último documento de venta, NO es una fecha.
- Para fecha de última venta de un cliente, usar FACTF02.FECHA_DOC con JOIN.
- CLIE02.EMAILPRED es el campo real de email (VARCHAR 512). CLIE02.MAIL es VARCHAR(1), no usar para email.
- FACTF02.FOLIO es INTEGER, no VARCHAR.
`;

export const SAE_SCHEMA = `
## Base de datos: Aspel SAE 9.0 (Firebird)
Sistema Administrativo Empresarial - Módulos de inventarios, clientes, proveedores, facturación y compras.

---

### INVE01 — Catálogo de Productos/Inventario
| Campo | Tipo | Descripción |
|-------|------|-------------|
| CVE_ART | VARCHAR | Clave del artículo (PK) |
| DESCR | VARCHAR | Descripción del producto |
| LIN_PROD | VARCHAR | Línea de producto |
| UNI_MED | VARCHAR | Unidad de medida |
| UNI_EMP | VARCHAR | Unidad de empaque |
| CTRL_ALM | CHAR(1) | Control por almacén (S/N) |
| EXIST | NUMERIC | Existencia actual |
| STOCK_MIN | NUMERIC | Stock mínimo |
| STOCK_MAX | NUMERIC | Stock máximo |
| COSTO_PROM | NUMERIC | Costo promedio |
| ULT_COSTO | NUMERIC | Último costo |
| FCH_ULTCOM | TIMESTAMP | Fecha última compra |
| FCH_ULTVTA | TIMESTAMP | Fecha última venta |
| VTAS_ANL_C | NUMERIC | Ventas anuales (cantidad) |
| VTAS_ANL_M | NUMERIC | Ventas anuales (monto) |
| COMP_ANL_C | NUMERIC | Compras anuales (cantidad) |
| COMP_ANL_M | NUMERIC | Compras anuales (monto) |
| CVE_ESQIMPU | VARCHAR | Clave esquema de impuestos |
| STATUS | CHAR(1) | Estatus (A=Activo, B=Baja) |
| CON_SERIE | CHAR(1) | Maneja número de serie (S/N) |
| CON_LOTE | CHAR(1) | Maneja lote (S/N) |
| PESO | NUMERIC | Peso del producto |
| VOLUMEN | NUMERIC | Volumen del producto |
| CVE_PRODSERV | VARCHAR | Clave producto/servicio SAT |
| CVE_UNIDAD | VARCHAR | Clave unidad SAT |
| NUM_MON | INTEGER | Número de moneda |
| APART | NUMERIC | Apartados |
| PEND_SURT | NUMERIC | Pendiente por surtir |
| TIP_COSTEO | CHAR(1) | Tipo de costeo |
| PREFIJO | VARCHAR | Prefijo talla/color |
| TALLA | VARCHAR | Talla |
| COLOR | VARCHAR | Color |

---

### CLIE01 — Catálogo de Clientes
| Campo | Tipo | Descripción |
|-------|------|-------------|
| CLAVE | VARCHAR | Clave del cliente (PK) |
| STATUS | CHAR(1) | Estatus (A=Activo, B=Baja) |
| NOMBRE | VARCHAR | Nombre o razón social |
| RFC | VARCHAR | RFC del cliente |
| CALLE | VARCHAR | Calle |
| NUMINT | VARCHAR | Número interior |
| NUMEXT | VARCHAR | Número exterior |
| COLONIA | VARCHAR | Colonia |
| CODIGO | VARCHAR | Código postal |
| LOCALIDAD | VARCHAR | Localidad |
| MUNICIPIO | VARCHAR | Municipio |
| ESTADO | VARCHAR | Estado |
| PAIS | VARCHAR | País |
| TELEFONO | VARCHAR | Teléfono |
| MAIL | VARCHAR | Correo electrónico |
| CLASIFIC | VARCHAR | Clasificación |
| CON_CREDITO | CHAR(1) | Tiene crédito (S/N) |
| DIASCRED | INTEGER | Días de crédito |
| LIMCRED | NUMERIC | Límite de crédito |
| SALDO | NUMERIC | Saldo actual |
| LISTA_PREC | INTEGER | Lista de precios asignada |
| DESCUENTO | NUMERIC | Descuento general |
| CVE_VEND | VARCHAR | Clave del vendedor asignado |
| CVE_ZONA | VARCHAR | Clave de zona |
| VENTAS | NUMERIC | Total de ventas |
| ULT_VENTAD | TIMESTAMP | Última venta (fecha) |
| PROSPECTO | CHAR(1) | Es prospecto (S/N) |
| USO_CFDI | VARCHAR | Uso de CFDI |
| REG_FISC | VARCHAR | Régimen fiscal |
| FORMADEPAGOSAT | VARCHAR | Forma de pago SAT |
| NOMBRECOMERCIAL | VARCHAR | Nombre comercial |

---

### PROV01 — Catálogo de Proveedores
| Campo | Tipo | Descripción |
|-------|------|-------------|
| CLAVE | VARCHAR | Clave del proveedor (PK) |
| STATUS | CHAR(1) | Estatus (A=Activo, B=Baja) |
| NOMBRE | VARCHAR | Nombre o razón social |
| RFC | VARCHAR | RFC del proveedor |
| CALLE | VARCHAR | Calle |
| NUMINT | VARCHAR | Número interior |
| NUMEXT | VARCHAR | Número exterior |
| COLONIA | VARCHAR | Colonia |
| CODIGO | VARCHAR | Código postal |
| MUNICIPIO | VARCHAR | Municipio |
| ESTADO | VARCHAR | Estado |
| CVE_PAIS | VARCHAR | Clave de país |
| TELEFONO | VARCHAR | Teléfono |
| CLASIFIC | VARCHAR | Clasificación |
| CON_CREDITO | CHAR(1) | Tiene crédito (S/N) |
| DIASCRED | INTEGER | Días de crédito |
| LIMCRED | NUMERIC | Límite de crédito |
| SALDO | NUMERIC | Saldo actual |
| VENTAS | NUMERIC | Total de compras |

---

### FACTF01 — Facturas (Documentos de venta)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| TIP_DOC | CHAR(1) | Tipo de documento (F=Factura) |
| CVE_DOC | VARCHAR | Clave/número de documento (PK junto con TIP_DOC) |
| CVE_CLPV | VARCHAR | Clave del cliente |
| STATUS | CHAR(1) | Estatus (E=Elaborado, C=Cancelado, P=Pendiente) |
| CVE_VEND | VARCHAR | Clave del vendedor |
| FECHA_DOC | TIMESTAMP | Fecha del documento |
| FECHA_ENT | TIMESTAMP | Fecha de entrega |
| FECHA_VEN | TIMESTAMP | Fecha de vencimiento |
| FECHA_CANCELA | TIMESTAMP | Fecha de cancelación |
| CAN_TOT | NUMERIC | Cantidad total |
| IMP_TOT1 | NUMERIC | Impuesto total 1 (IVA) |
| IMP_TOT2 | NUMERIC | Impuesto total 2 |
| IMP_TOT3 | NUMERIC | Impuesto total 3 |
| IMP_TOT4 | NUMERIC | Impuesto total 4 |
| DES_TOT | NUMERIC | Descuento total |
| DES_FIN | NUMERIC | Descuento financiero |
| COM_TOT | NUMERIC | Comisión total |
| IMPORTE | NUMERIC | Importe (subtotal) |
| CONDICION | VARCHAR | Condición de pago |
| NUM_ALMA | INTEGER | Número de almacén |
| NUM_MONED | INTEGER | Número de moneda |
| TIPCAMB | NUMERIC | Tipo de cambio |
| SERIE | VARCHAR | Serie del documento |
| FOLIO | NUMERIC | Folio del documento |
| CONTADO | CHAR(1) | Es de contado (S/N) |
| UUID | VARCHAR | UUID del CFDI |
| USO_CFDI | VARCHAR | Uso de CFDI |
| FORMADEPAGOSAT | VARCHAR | Forma de pago SAT |
| FECHAELAB | TIMESTAMP | Fecha de elaboración |

---

### PAR_FACTF01 — Partidas (detalle) de Facturas
| Campo | Tipo | Descripción |
|-------|------|-------------|
| CVE_DOC | VARCHAR | Clave del documento (FK a FACTF01) |
| NUM_PAR | INTEGER | Número de partida |
| CVE_ART | VARCHAR | Clave del artículo (FK a INVE01) |
| CANT | NUMERIC | Cantidad |
| PREC | NUMERIC | Precio unitario |
| COST | NUMERIC | Costo |
| IMPU1 | NUMERIC | % Impuesto 1 |
| TOTIMP1 | NUMERIC | Total impuesto 1 |
| DESC1 | NUMERIC | % Descuento 1 |
| DESC2 | NUMERIC | % Descuento 2 |
| DESC3 | NUMERIC | % Descuento 3 |
| NUM_ALM | INTEGER | Número de almacén |
| UNI_VENTA | VARCHAR | Unidad de venta |
| TOT_PARTIDA | NUMERIC | Total de la partida |
| DESCR_ART | VARCHAR | Descripción del artículo |
| PREC_NETO | NUMERIC | Precio neto |
| CVE_PRODSERV | VARCHAR | Clave producto/servicio SAT |
| CVE_UNIDAD | VARCHAR | Clave unidad SAT |

---

### Otras tablas disponibles
- **MINVE01** — Movimientos de inventario (campos: CVE_ART, TIPO_MOV, FECHA, CANTIDAD, COSTO, NUM_ALM, CVE_DOC, CONCEPTO)
- **ALMACENES01** — Catálogo de almacenes (campos: CVE_ALM, DESCR, STATUS)
- **VEND01** — Catálogo de vendedores (campos: CLAVE, NOMBRE, STATUS, COM_VEN)
- **ZONA01** — Catálogo de zonas (campos: CLAVE, DESCRIPCION)
- **MONED01** — Catálogo de monedas (campos: NUM_MONED, DESCRIPCION, TIPCAMB)
- **IMPU01** — Catálogo de impuestos (campos: CVE_ESQIMPU, DESCRIPCION, PORCENTAJE)
- **PRECIOS01** — Listas de precios (campos: CVE_ART, NUM_LISTA, PRECIO)
- **PRVPROD01** — Relación producto-proveedor (campos: CVE_ART, CVE_PROV, COSTO, TIEMPO_ENT)
- **COMPR01** — Compras (estructura similar a FACTF01: TIP_DOC, CVE_DOC, CVE_CLPV→proveedor, STATUS, FECHA_DOC, IMPORTE, etc.)
- **PAR_COMPR01** — Partidas de compras (estructura similar a PAR_FACTF01)

---

### Relaciones principales
- FACTF01.CVE_CLPV → CLIE01.CLAVE (factura pertenece a un cliente)
- FACTF01.CVE_VEND → VEND01.CLAVE (factura asignada a un vendedor)
- PAR_FACTF01.CVE_DOC → FACTF01.CVE_DOC (partidas de una factura)
- PAR_FACTF01.CVE_ART → INVE01.CVE_ART (artículo en la partida)
- COMPR01.CVE_CLPV → PROV01.CLAVE (compra pertenece a un proveedor)
- PAR_COMPR01.CVE_ART → INVE01.CVE_ART (artículo en la partida de compra)

---

### Notas importantes de sintaxis Firebird SQL
- **NO usar LIMIT**. Usar \`SELECT FIRST N\` en su lugar. Ejemplo: \`SELECT FIRST 10 * FROM INVE01\`
- Usar \`CONTAINING\` para búsquedas parciales case-insensitive. Ejemplo: \`WHERE DESCR CONTAINING 'tornillo'\`
- Usar \`TRIM()\` en campos de texto al comparar para eliminar espacios. Ejemplo: \`WHERE TRIM(CVE_ART) = 'ABC123'\`
- Las fechas se manejan como TIMESTAMP en Firebird
- Para filtrar por fecha: \`WHERE FECHA_DOC >= '2024-01-01' AND FECHA_DOC < '2024-02-01'\`
- Los campos de texto pueden tener espacios al final, siempre usar TRIM() al comparar
- Para concatenar strings usar \`||\`
- Para contar registros: \`SELECT COUNT(*) FROM tabla\`
- Para sumar: \`SELECT SUM(campo) FROM tabla\`
`;

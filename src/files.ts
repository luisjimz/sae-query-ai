import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  HeadingLevel, TextRun, WidthType,
} from "docx";

export interface ColumnDef {
  field: string;
  label: string;
}

export interface FileRequest {
  data: Record<string, unknown>[];
  title: string;
  columns?: ColumnDef[];
}

function deriveColumns(data: Record<string, unknown>[]): ColumnDef[] {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((field) => ({ field, label: field }));
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") return val.toLocaleString("es-MX");
  if (val instanceof Date) return val.toLocaleDateString("es-MX");
  return String(val);
}

// --- PDF ---

export function generatePDF(req: FileRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { data, title } = req;
    const cols = req.columns ?? deriveColumns(data);

    const doc = new PDFDocument({
      margin: 40,
      size: "LETTER",
      layout: cols.length > 6 ? "landscape" : "portrait",
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.font("Helvetica-Bold").fontSize(16).text(title, { align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#666666")
      .text(`Generado el ${new Date().toLocaleString("es-MX")} | ${data.length} registro(s)`, { align: "center" })
      .moveDown(1);

    // Table dimensions
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = Math.floor(pageWidth / cols.length);
    const rowHeight = 18;
    const headerHeight = 22;

    // Header row
    const tableTop = doc.y;
    doc.rect(doc.page.margins.left, tableTop, pageWidth, headerHeight).fill("#1a1a2e");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
    cols.forEach((col, i) => {
      const x = doc.page.margins.left + i * colWidth;
      doc.text(col.label, x + 3, tableTop + 6, { width: colWidth - 6, ellipsis: true, lineBreak: false });
    });

    // Data rows
    doc.font("Helvetica").fontSize(8).fillColor("#000000");
    let y = tableTop + headerHeight;

    data.forEach((row, rowIndex) => {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      if (rowIndex % 2 === 0) {
        doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill("#f5f5f5");
      }

      doc.fillColor("#000000");
      cols.forEach((col, i) => {
        const x = doc.page.margins.left + i * colWidth;
        doc.text(formatValue(row[col.field]), x + 3, y + 4, { width: colWidth - 6, ellipsis: true, lineBreak: false });
      });

      y += rowHeight;
    });

    doc.end();
  });
}

// --- Excel ---

export async function generateExcel(req: FileRequest): Promise<Buffer> {
  const { data, title } = req;
  const cols = req.columns ?? deriveColumns(data);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SAE Query AI";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Reporte");

  // Title row
  const titleRow = sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, cols.length);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF7C83FF" } };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 28;

  // Subtitle
  const subtitle = `Generado: ${new Date().toLocaleString("es-MX")} | ${data.length} registro(s)`;
  const subtitleRow = sheet.addRow([subtitle]);
  sheet.mergeCells(2, 1, 2, cols.length);
  subtitleRow.getCell(1).font = { size: 9, color: { argb: "FF888888" } };
  subtitleRow.getCell(1).alignment = { horizontal: "center" };

  // Spacer
  sheet.addRow([]);

  // Headers
  const headerRow = sheet.addRow(cols.map((c) => c.label));
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A2E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Data rows
  data.forEach((row, idx) => {
    const values = cols.map((c) => {
      const v = row[c.field];
      return typeof v === "number" ? v : formatValue(v);
    });
    const dataRow = sheet.addRow(values);

    if (idx % 2 === 1) {
      dataRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5FF" } };
      });
    }

    dataRow.eachCell((cell, colNum) => {
      const field = cols[colNum - 1]?.field ?? "";
      if (typeof row[field] === "number") {
        const isCurrency = /monto|importe|precio|costo|saldo|total|venta|pago/i.test(field);
        cell.numFmt = isCurrency ? '"$"#,##0.00' : "#,##0.##";
      }
    });
  });

  // Auto-fit columns
  sheet.columns.forEach((column, idx) => {
    let maxLen = cols[idx]?.label.length ?? 10;
    data.slice(0, 100).forEach((row) => {
      const val = formatValue(row[cols[idx]?.field ?? ""]);
      if (val.length > maxLen) maxLen = val.length;
    });
    column.width = Math.min(maxLen + 2, 40);
  });

  // Freeze headers
  sheet.views = [{ state: "frozen" as const, xSplit: 0, ySplit: 4 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// --- DOCX ---

export async function generateDocx(req: FileRequest): Promise<Buffer> {
  const { data, title } = req;
  const cols = req.columns ?? deriveColumns(data);

  const totalDxa = 9360;
  const colWidthDxa = Math.floor(totalDxa / cols.length);

  const headerRow = new TableRow({
    tableHeader: true,
    children: cols.map((col) =>
      new TableCell({
        width: { size: colWidthDxa, type: WidthType.DXA },
        shading: { fill: "1A1A2E" },
        children: [new Paragraph({
          children: [new TextRun({ text: col.label, bold: true, color: "FFFFFF", size: 18 })],
        })],
      })
    ),
  });

  const dataRows = data.map((row, idx) =>
    new TableRow({
      children: cols.map((col) =>
        new TableCell({
          width: { size: colWidthDxa, type: WidthType.DXA },
          shading: idx % 2 === 1 ? { fill: "F5F5FF" } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: formatValue(row[col.field]), size: 16 })],
          })],
        })
      ),
    })
  );

  const document = new Document({
    sections: [{
      properties: {
        page: {
          size: cols.length > 6
            ? { width: 15840, height: 12240 }
            : { width: 12240, height: 15840 },
        },
      },
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, alignment: "center" }),
        new Paragraph({
          alignment: "center",
          children: [new TextRun({
            text: `Generado: ${new Date().toLocaleString("es-MX")} | ${data.length} registro(s)`,
            color: "888888", size: 16,
          })],
        }),
        new Paragraph({ text: "" }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }),
      ],
    }],
  });

  return await Packer.toBuffer(document);
}

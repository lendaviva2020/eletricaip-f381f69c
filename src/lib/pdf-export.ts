import jsPDF from "jspdf";

interface BomItem {
  part_number: string | null;
  description?: string | null;
  manufacturer?: string | null;
  quantity: number | string;
  unit?: string | null;
  unit_price_brl?: number | string | null;
}

interface ProjectMeta {
  name: string;
  client?: string | null;
  description?: string | null;
  status?: string | null;
}

export function buildProjectPdf(opts: {
  project: ProjectMeta;
  bom: BomItem[];
  totalBRL: number;
  authorName?: string | null;
  norm?: string;
}): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("EletricAI · Memorial Descritivo", margin, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} · ${opts.norm ?? "NBR 5410 / NBR 5444"}`,
    margin,
    y,
  );
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Project block
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Identificação do projeto", margin, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const meta: Array<[string, string]> = [
    ["Projeto", opts.project.name],
    ["Cliente", opts.project.client ?? "—"],
    ["Status", opts.project.status ?? "—"],
    ["Responsável", opts.authorName ?? "—"],
  ];
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "bold");
    doc.text(`${k}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, margin + 30, y);
    y += 5;
  }
  if (opts.project.description) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Descrição:", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(opts.project.description, pageW - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 5;
  }

  // BOM
  y += 6;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Lista de materiais (BOM)", margin, y);
  y += 6;

  const cols = [
    { label: "Part Number", w: 38 },
    { label: "Descrição", w: 70 },
    { label: "Fab.", w: 25 },
    { label: "Qtd", w: 14, align: "right" as const },
    { label: "R$ unit.", w: 18, align: "right" as const },
    { label: "Subtotal", w: 20, align: "right" as const },
  ];
  doc.setFontSize(8);
  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y - 4, pageW - 2 * margin, 6, "F");
  let x = margin;
  doc.setFont("helvetica", "bold");
  for (const c of cols) {
    doc.text(c.label, c.align === "right" ? x + c.w - 2 : x + 1, y, {
      align: c.align ?? "left",
    });
    x += c.w;
  }
  y += 4;
  doc.setFont("helvetica", "normal");

  for (const it of opts.bom) {
    if (y > pageH - 30) {
      doc.addPage();
      y = margin;
    }
    const qty = Number(it.quantity);
    const price = Number(it.unit_price_brl ?? 0);
    const subtotal = qty * price;
    const row = [
      it.part_number ?? "—",
      it.description ?? "—",
      it.manufacturer ?? "—",
      qty.toString(),
      price ? price.toFixed(2) : "—",
      subtotal ? subtotal.toFixed(2) : "—",
    ];
    x = margin;
    cols.forEach((c, i) => {
      const txt = doc.splitTextToSize(String(row[i]), c.w - 2);
      doc.text(txt[0] ?? "", c.align === "right" ? x + c.w - 2 : x + 1, y, {
        align: c.align ?? "left",
      });
      x += c.w;
    });
    y += 5;
  }

  // Total
  y += 2;
  doc.setDrawColor(180);
  doc.line(margin, y, pageW - margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(`Total estimado: R$ ${opts.totalBRL.toFixed(2)}`, pageW - margin, y, {
    align: "right",
  });

  // Footer
  const footer = `EletricAI · Documento gerado automaticamente · página `;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${footer}${i}/${pages}`, pageW / 2, pageH - 8, { align: "center" });
  }

  return doc;
}

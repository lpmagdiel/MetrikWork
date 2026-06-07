function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeFilename(value) {
  return String(value || "reporte")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "reporte";
}

function buildRows(rows = []) {
  return rows
    .map(
      (row) => `
        <tr>
          ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
        </tr>
      `,
    )
    .join("");
}

function buildSection(section) {
  const headers = section.headers || [];
  const rows = section.rows?.length ? section.rows : [["Sin datos"]];
  const colspan = Math.max(headers.length, rows[0]?.length || 1);

  return `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <table>
        ${
          headers.length
            ? `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`
            : ""
        }
        <tbody>
          ${
            section.rows?.length
              ? buildRows(rows)
              : `<tr><td colspan="${colspan}">Sin datos</td></tr>`
          }
        </tbody>
      </table>
    </section>
  `;
}

function buildSignatures(signatures = []) {
  if (!signatures.length) return "";

  return `
    <section class="signatures" aria-label="Firmas">
      ${signatures
        .map(
          (signature) => `
            <div class="signature-box">
              <div class="signature-line"></div>
              <strong>${escapeHtml(signature.label)}</strong>
              <span>${escapeHtml(signature.name || "")}</span>
              <small>${escapeHtml(signature.note || "Nombre, firma y fecha")}</small>
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function buildReportHtml({ title, subtitle = "", meta = [], sections = [], signatures = [] }, options = {}) {
  const generatedAt = new Date().toLocaleString("es-ES");
  const includeActions = options.includeActions !== false;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      background: #f3f4f6;
      color: #172033;
      font-family: Arial, Helvetica, sans-serif;
    }
    .actions {
      max-width: 1100px;
      margin: 0 auto 14px;
      text-align: right;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    button {
      border: 0;
      background: #172033;
      color: #fff;
      padding: 10px 16px;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: #e5e7eb;
      color: #172033;
    }
    .page {
      max-width: 1100px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #dde1e7;
      padding: 30px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 2px solid #172033;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    h1, h2, p { margin: 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 16px; margin: 24px 0 10px; }
    .muted { color: #647084; font-size: 13px; margin-top: 5px; }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .meta div {
      border: 1px solid #dde1e7;
      padding: 11px;
      min-height: 58px;
    }
    .label {
      display: block;
      color: #647084;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .value {
      font-size: 14px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #dde1e7;
      padding: 8px;
      vertical-align: top;
      text-align: left;
    }
    th {
      background: #f8fafc;
      color: #334155;
      font-size: 11px;
      text-transform: uppercase;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 40px;
      margin-top: 58px;
      break-inside: avoid;
    }
    .signature-box {
      min-height: 112px;
      display: grid;
      align-content: end;
      gap: 5px;
    }
    .signature-line {
      border-top: 1px solid #172033;
      margin-bottom: 6px;
    }
    .signature-box strong {
      font-size: 13px;
    }
    .signature-box span,
    .signature-box small {
      color: #647084;
      font-size: 12px;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .page { border: 0; max-width: none; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  ${
    includeActions
      ? `<div class="actions">
          <button onclick="window.print()">Guardar / imprimir PDF</button>
          <button class="secondary" onclick="window.close()">Cerrar</button>
        </div>`
      : ""
  }
  <main class="page">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <p class="muted">Generado: ${escapeHtml(generatedAt)}</p>
    </header>
    ${
      meta.length
        ? `<section class="meta">${meta
            .map(
              (item) => `
                <div>
                  <span class="label">${escapeHtml(item.label)}</span>
                  <span class="value">${escapeHtml(item.value)}</span>
                </div>
              `,
            )
            .join("")}</section>`
        : ""
    }
    ${sections.map(buildSection).join("")}
    ${buildSignatures(signatures)}
  </main>
</body>
</html>`;
}

export function openPrintableReport(report) {
  if (typeof window === "undefined") return false;
  const reportWindow = window.open("", "_blank", "width=1100,height=1200");
  if (!reportWindow) return false;
  reportWindow.document.open();
  reportWindow.document.write(buildReportHtml(report, { includeActions: true }));
  reportWindow.document.close();
  reportWindow.focus();
  return true;
}

export function downloadExcelReport(report, filename) {
  if (typeof document === "undefined") return false;
  const html = buildReportHtml(report, { includeActions: false });
  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${normalizeFilename(filename || report.title)}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

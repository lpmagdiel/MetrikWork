import { openPrintableReport } from "./reportExport.js";
import psLogo from "../assets/ps-logo.png";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(amount, currency = "EUR") {
  const numeric = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2
    }).format(numeric);
  } catch (error) {
    return `${numeric.toFixed(2)} ${currency || "EUR"}`;
  }
}

function formatNumberEs(value) {
  const numeric = Number(value) || 0;
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numeric);
}

function formatDateLong(value) {
  if (!value) return "";
  // Admite "YYYY-MM-DD" o ISO completo.
  const text = String(value);
  const datePart = text.includes("T") ? text.slice(0, 10) : text;
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return text;
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return `${day} de ${months[month - 1]} de ${year}`;
}

const METHOD_LABELS = {
  transfer: "Transferencia",
  cash: "Efectivo",
  card: "Tarjeta",
  bizum: "Bizum",
  direct_debit: "Domiciliación",
  other: "Otro"
};

const STATUS_LABELS = {
  pending: "Pendiente",
  paid: "Pagado",
  overdue: "Vencido",
  cancelled: "Cancelado"
};

function buildContactLines(party = {}) {
  const lines = [];
  if (party.taxId) lines.push(`<strong>NIF/CIF:</strong> ${escapeHtml(party.taxId)}`);
  if (party.email) lines.push(escapeHtml(party.email));
  if (party.phone) lines.push(escapeHtml(party.phone));
  if (party.address) lines.push(escapeHtml(party.address));
  return lines.join("<br/>");
}

function buildPeriodLabel(charge = {}) {
  const start = formatDateLong(charge.startDate);
  const end = formatDateLong(charge.endDate || charge.dueDate);
  if (!start && !end) return "";
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}

/**
 * Construye el HTML del PDF de la factura siguiendo el formato de la
 * plantilla de la empresa: encabezado "FACTURA Nº..." con el logo PS,
 * bloque de empresa/cliente, tabla con líneas de detalle, bloque de
 * totales con subtotal/IVA/total, datos de contacto al pie y firmas.
 *
 * Se inyecta en `openPrintableReport` que aporta el botón "Guardar /
 * imprimir PDF" y los media queries de impresión.
 *
 * @param {object} options
 * @param {object} options.charge          Cobro con `client`, `company`, etc.
 * @param {object} [options.team]          Equipo (para nombre/empresa por defecto)
 * @returns {object} payload compatible con openPrintableReport
 */
export function buildInvoiceReport({ charge = {}, team = {} } = {}) {
  const company = charge.company || {};
  const client = charge.client || {};

  const companyName = company.name || team?.name || team?.team || "Empresa";
  const clientName = client.name || "Cliente";

  const invoiceNumber = charge.invoiceNumber || "—";
  const title = `FACTURA Nº ${invoiceNumber}`;

  const issueDate = formatDateLong(
    charge.issuedAt
      ? String(charge.issuedAt).slice(0, 10)
      : charge.dueDate || charge.endDate || charge.startDate || new Date().toISOString().slice(0, 10)
  );

  // --- Totales (subtotal + IVA) ---------------------------------------
  const amount = Number(charge.amount) || 0;
  const currency = charge.currency || "MXN";
  const taxRate = Number(charge.taxRate);
  const hasTax = Number.isFinite(taxRate) && taxRate > 0;
  const taxAmount = hasTax ? Math.round(amount * taxRate) / 100 : 0;
  const totalWithTax = amount + taxAmount;

  // --- Cabecera con logo PS --------------------------------------------
  const headerHtml = `
    <header class="invoice-header">
      <div class="invoice-header-left">
        <h1 class="invoice-title">${escapeHtml(title)}</h1>
        <div class="invoice-meta-row">
          <div>
            <span class="label">Fecha</span>
            <span class="value">${escapeHtml(issueDate)}</span>
          </div>
          <div>
            <span class="label">Cliente</span>
            <span class="value">${escapeHtml(clientName)}</span>
          </div>
        </div>
      </div>
      <div class="invoice-header-right">
        <img src="${escapeHtml(psLogo)}" alt="PS logo" class="invoice-logo" />
      </div>
    </header>
  `;

  // --- Tabla de líneas de la factura -----------------------------------
  // El cobro puede traer `items` o un único `title` con su descripción.
  // Para facturas reales, una sola línea suele bastar; si el cargo no
  // tiene `items`, mostramos el título y descripción como una fila.
  const items = Array.isArray(charge.items) && charge.items.length > 0
    ? charge.items
    : [
        {
          title: charge.title || "Servicio",
          description: charge.description || "",
          quantity: 1,
          unitPrice: amount,
          total: amount
        }
      ];

  const descriptionColTitle = items.length > 1
    ? "Descripción"
    : "Concepto";

  const itemRows = items.map((item) => {
    const title = item.title || item.concept || "";
    const description = item.description || item.notes || "";
    const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    const unitPrice = Number(item.unitPrice ?? item.price) || 0;
    const total = Number(item.total) > 0 ? Number(item.total) : unitPrice * quantity;

    const body = [
      `<strong>${escapeHtml(title)}</strong>`,
      description ? `<small>${escapeHtml(description)}</small>` : ""
    ]
      .filter(Boolean)
      .join("<br/>");

    return [body, formatNumberEs(quantity), formatMoney(unitPrice, currency), formatMoney(total, currency)];
  });

  // --- Bloque de totales -----------------------------------------------
  const totalsSection = {
    title: "Totales",
    custom: true,
    rows: [],
    totalsBlocks: [
      {
        rows: [
          ["Base imponible", formatMoney(amount, currency)],
          ...(hasTax
            ? [
                [`IVA ${escapeHtml(formatNumberEs(taxRate))}%`, formatMoney(taxAmount, currency)]
              ]
            : []),
          ["<strong>TOTAL</strong>", `<strong>${escapeHtml(formatMoney(totalWithTax, currency))}</strong>`]
        ]
      }
    ]
  };

  const sections = [
    {
      title: descriptionColTitle,
      custom: true,
      headers: ["Descripción", "Cantidad", "Precio unitario", "Importe"],
      rows: itemRows,
      className: "invoice-lines-table"
    },
    totalsSection
  ];

  // --- Datos de contacto de empresa y cliente -------------------------
  const contactSection = `
    <section class="invoice-parties">
      <div class="invoice-party">
        <h3>Datos de la empresa</h3>
        <p class="party-name">${escapeHtml(companyName)}</p>
        <p>${buildContactLines(company) || "<span class='muted'>Sin datos</span>"}</p>
      </div>
      <div class="invoice-party">
        <h3>Datos del cliente</h3>
        <p class="party-name">${escapeHtml(clientName)}</p>
        <p>${buildContactLines(client) || "<span class='muted'>Sin datos</span>"}</p>
      </div>
    </section>
  `;

  // --- Datos de pago (método / banco / IBAN / bizum) ------------------
  const methodLabel = METHOD_LABELS[charge.method] || charge.method || "";
  const paymentSection = `
    <section class="invoice-payment">
      <h3>Datos de pago</h3>
      <table class="invoice-payment-table">
        <thead>
          <tr><th>Método</th><th>Banco</th><th>IBAN / cuenta</th><th>Bizum</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(methodLabel)}</td>
            <td>${escapeHtml(company.bankName || "")}</td>
            <td>${escapeHtml(company.iban || "")}</td>
            <td>${escapeHtml(company.bizum || "")}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;

  // --- Pie: periodo, método y datos de contacto -----------------------
  const metaInfo = [];
  if (charge.status) {
    metaInfo.push(
      `<p><strong>Estado:</strong> ${escapeHtml(STATUS_LABELS[charge.status] || charge.status)}</p>`
    );
  }
  if (charge.dueDate || charge.endDate || charge.startDate) {
    metaInfo.push(
      `<p><strong>Periodo:</strong> ${escapeHtml(buildPeriodLabel(charge))}</p>`
    );
  }
  if (methodLabel) {
    metaInfo.push(`<p><strong>Forma de pago:</strong> ${escapeHtml(methodLabel)}</p>`);
  }
  if (charge.notes) {
    metaInfo.push(`<p class="invoice-notes">${escapeHtml(charge.notes)}</p>`);
  }

  const footerHtml = `
    ${metaInfo.length ? `<section class="invoice-meta-info">${metaInfo.join("")}</section>` : ""}
    ${paymentSection}
    ${contactSection}
  `;

  const customStyles = `
    /* --- Cabecera con logo ----------------------------------------- */
    .invoice-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 2px solid #172033;
      padding-bottom: 18px;
      margin-bottom: 18px;
    }
    .invoice-header-left { flex: 1; min-width: 0; }
    .invoice-title {
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 0.02em;
      margin: 0 0 14px;
    }
    .invoice-meta-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      max-width: 520px;
    }
    .invoice-meta-row .label {
      display: block;
      color: #647084;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .invoice-meta-row .value {
      font-size: 14px;
      font-weight: 700;
      color: #172033;
    }
    .invoice-logo {
      width: 110px;
      height: auto;
      object-fit: contain;
    }

    /* --- Tabla de líneas ------------------------------------------- */
    .invoice-lines-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 13px;
    }
    .invoice-lines-table th,
    .invoice-lines-table td {
      border-bottom: 1px solid #dde1e7;
      padding: 10px 12px;
      vertical-align: top;
      text-align: left;
    }
    .invoice-lines-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
    }
    .invoice-lines-table th:nth-child(2),
    .invoice-lines-table th:nth-child(3),
    .invoice-lines-table th:nth-child(4),
    .invoice-lines-table td:nth-child(2),
    .invoice-lines-table td:nth-child(3),
    .invoice-lines-table td:nth-child(4) {
      text-align: right;
      width: 16%;
    }
    .invoice-lines-table td:nth-child(1) { width: 52%; }
    .invoice-lines-table small {
      display: block;
      margin-top: 2px;
      color: #647084;
      font-size: 11px;
      font-style: italic;
    }

    /* --- Bloque de totales ---------------------------------------- */
    .invoice-totals {
      margin-top: 18px;
      display: flex;
      justify-content: flex-end;
    }
    .invoice-totals table {
      width: min(100%, 380px);
      border-collapse: collapse;
      font-size: 14px;
    }
    .invoice-totals td {
      padding: 8px 12px;
      border-bottom: 1px solid #dde1e7;
    }
    .invoice-totals td:last-child {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .invoice-totals tr:last-child td {
      background: #f1f5f9;
      border-top: 2px solid #172033;
      border-bottom: 2px solid #172033;
      font-size: 16px;
      font-weight: 800;
    }

    /* --- Datos de pago y de contacto ------------------------------ */
    .invoice-payment { margin-top: 28px; }
    .invoice-payment h3 {
      margin: 0 0 8px;
      font-size: 12px;
      letter-spacing: 0.06em;
      color: #334155;
      text-transform: uppercase;
    }
    .invoice-payment-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .invoice-payment-table th,
    .invoice-payment-table td {
      border: 1px solid #dde1e7;
      padding: 8px 10px;
      text-align: left;
      vertical-align: middle;
    }
    .invoice-payment-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 11px;
      text-transform: uppercase;
    }
    .invoice-parties {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
      margin-top: 28px;
    }
    .invoice-party {
      padding: 14px 16px;
      border: 1px solid #dde1e7;
      border-radius: 6px;
      background: #f8fafc;
      font-size: 13px;
      line-height: 1.55;
    }
    .invoice-party h3 {
      margin: 0 0 6px;
      font-size: 11px;
      letter-spacing: 0.06em;
      color: #334155;
      text-transform: uppercase;
    }
    .invoice-party .party-name {
      margin: 0 0 6px;
      font-weight: 800;
      color: #172033;
      font-size: 14px;
    }
    .invoice-party p { margin: 0; }
    .invoice-meta-info {
      margin-top: 24px;
      text-align: center;
      font-size: 13px;
      line-height: 1.5;
    }
    .invoice-meta-info p { margin: 3px 0; }
    .invoice-notes {
      font-style: italic;
      color: #475569;
      max-width: 600px;
      margin: 8px auto 0;
    }

    @media print {
      .invoice-parties { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `;

  return {
    title,
    subtitle: "",
    headerHtml,
    meta: [],
    sections,
    customStyles,
    footerHtml,
    signatures: [
      { label: "Firma de la empresa", name: companyName },
      { label: "Firma del cliente", name: clientName }
    ],
    renderSection(section) {
      // Sección "Totales" con bloques a la derecha.
      if (section.totalsBlocks) {
        const blocks = section.totalsBlocks
          .map(
            (block) => `
              <table>
                <tbody>
                  ${block.rows
                    .map(
                      (row) => `<tr>${row
                        .map(
                          (cell, i) =>
                            `<td${i === 1 ? ' class="amount"' : ""}>${cell}</td>`
                        )
                        .join("")}</tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `
          )
          .join("");

        return `
          <section>
            <h2>${escapeHtml(section.title)}</h2>
            <div class="invoice-totals">${blocks}</div>
          </section>
        `;
      }

      // Sección de líneas estándar.
      const headers = section.headers || [];
      const dataRows = section.rows || [];
      const className = section.className || "";

      const headerHtml2 = headers.length
        ? `<thead><tr>${headers
            .map((h, i) => `<th${i === 0 ? ' class="desc"' : ""}>${escapeHtml(h)}</th>`)
            .join("")}</tr></thead>`
        : "";

      const bodyRows = dataRows
        .map((row) => {
          const isHtmlRow = row.some(
            (cell) => typeof cell === "string" && /<[a-z]/i.test(cell)
          );
          const cells = row
            .map((cell, i) => {
              const isHtml = typeof cell === "string" && /<[a-z]/i.test(cell);
              return `<td${i === 0 ? ' class="desc"' : ""}>${isHtml ? cell : escapeHtml(cell ?? "")}</td>`;
            })
            .join("");
          return `<tr${isHtmlRow ? ' class="rich"' : ""}>${cells}</tr>`;
        })
        .join("");

      return `
        <section>
          <h2>${escapeHtml(section.title)}</h2>
          <table class="${escapeHtml(className)}">
            ${headerHtml2}
            <tbody>${bodyRows}</tbody>
          </table>
        </section>
      `;
    }
  };
}

/**
 * Abre una ventana nueva con la factura lista para imprimir o "Guardar
 * como PDF" desde el diálogo del navegador.
 *
 * @returns {boolean} true si la ventana se abrió correctamente.
 */
export function openInvoiceReport({ charge, team } = {}) {
  const report = buildInvoiceReport({ charge, team });
  return openPrintableReport(report);
}
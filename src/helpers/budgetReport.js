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

function formatDateLong(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day)
    .toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    .replace(/^(\d{1,2})/, (d) => `${d}`);
}

function formatNumberEs(value) {
  const numeric = Number(value) || 0;
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numeric);
}

function buildCompanyInfo(company = {}) {
  const lines = [];
  if (company.email) lines.push(escapeHtml(company.email));
  if (company.phone) {
    const address = company.address ? `    ${escapeHtml(company.address)}` : "";
    lines.push(`${escapeHtml(company.phone)}${address}`);
  } else if (company.address) {
    lines.push(escapeHtml(company.address));
  }
  return lines.join("<br/>");
}

/**
 * Construye el HTML del presupuesto siguiendo el formato de la plantilla
 * de referencia (PRESUPUESTO NNNN con tabla Mano de obra / Materiales,
 * bloque de total, condiciones y datos de contacto al pie).
 *
 * El HTML se inyecta en el helper genérico `openPrintableReport` que
 * añade la cabecera "PRESUPUESTO NNNN", el botón "Guardar / imprimir PDF"
 * y los media queries de impresión.
 *
 * @param {object} options
 * @param {object} options.budget        Datos del presupuesto
 * @param {Array}  options.checklist     Items del checklist (mano de obra / materiales)
 * @param {object} [options.company]     Datos de la empresa para el pie
 * @param {string} [options.budgetNumber] Número del presupuesto (por defecto = id)
 * @returns {object} payload compatible con openPrintableReport
 */
export function buildBudgetReport({ budget, checklist = [], company = {}, budgetNumber } = {}) {
  const number = budgetNumber || budget?.id?.slice(0, 6)?.toUpperCase() || "00000";
  const title = `PRESUPUESTO Nº ${number}`;
  const subtitle = budget?.title || "";

  const clientName = budget?.clientName || budget?.clientSnapshot?.name || "Cliente";
  const clientAddress = budget?.clientSnapshot?.address || "";
  const clientLine = clientAddress
    ? `${escapeHtml(clientName)}<br/>${escapeHtml(clientAddress)}`
    : escapeHtml(clientName);

  const issueDate = formatDateLong(
    budget?.createdAt ? String(budget.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  // --- Cuerpo: tabla de items del checklist -------------------------------
  const rows = (checklist || []).map((item) => {
    const description = [
      `<strong>${escapeHtml(item.title || "")}</strong>`,
      item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ""
    ]
      .filter(Boolean)
      .join("<br/>");

    const laborCell = item.includesLabor ? "<span class=\"check\">✓</span>" : "";
    const materialsCell = item.includesMaterials ? "<span class=\"check\">✓</span>" : "";

    return [
      description,
      laborCell,
      materialsCell
    ];
  });

  // Rellenamos hasta 10 filas vacías para mantener la estética de la
  // plantilla original (líneas en blanco hasta el total).
  const minRows = 10;
  while (rows.length < minRows) {
    rows.push(["", "", ""]);
  }

  // --- Total + IVA -------------------------------------------------------
  const amount = Number(budget?.amount) || 0;
  const currency = budget?.currency || "EUR";
  const taxRate = Number(budget?.taxRate);
  const hasTax = Number.isFinite(taxRate) && taxRate > 0;
  const taxAmount = hasTax ? Math.round(amount * taxRate) / 100 : 0;
  const totalWithTax = amount + taxAmount;

  const totalRow = hasTax
    ? [
        `TOTAL: ${escapeHtml(formatNumberEs(amount))} ${escapeHtml(
          currency
        )} Sin IVA`,
        `IVA ${escapeHtml(formatNumberEs(taxRate))}% = ${escapeHtml(
          formatNumberEs(taxAmount)
        )} ${escapeHtml(currency)}`,
        `<strong>${escapeHtml(formatMoney(totalWithTax, currency))}</strong>`
      ]
    : [
        `TOTAL: ${escapeHtml(formatMoney(amount, currency))}`,
        "",
        ""
      ];

  // --- Condiciones (tiempo estimado / forma de pago) --------------------
  const conditions = [];
  if (budget?.estimatedTime) {
    conditions.push(
      `<p><strong>Tiempo estimado del trabajo:</strong> ${escapeHtml(budget.estimatedTime)}</p>`
    );
  }
  if (budget?.paymentTerms) {
    conditions.push(
      `<p><strong>Forma de pago:</strong> ${escapeHtml(budget.paymentTerms)}</p>`
    );
  } else if (budget?.notes) {
    conditions.push(`<p>${escapeHtml(budget.notes)}</p>`);
  }

  // --- Datos de contacto al pie ----------------------------------------
  const companyInfoHtml = buildCompanyInfo(company);

  return {
    title,
    subtitle,
    headerHtml: `
      <header class="budget-header">
        <div class="budget-header-left">
          <h1 class="budget-title">${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="budget-header-subtitle">${escapeHtml(subtitle)}</p>` : ""}
          <div class="budget-meta-row">
            <div>
              <span class="label">Nº</span>
              <span class="value">${escapeHtml(number)}</span>
            </div>
            <div>
              <span class="label">Fecha</span>
              <span class="value">${escapeHtml(issueDate)}</span>
            </div>
            <div>
              <span class="label">Cliente</span>
              <span class="value">${clientLine}</span>
            </div>
          </div>
        </div>
        <div class="budget-header-right">
          <img src="${escapeHtml(psLogo)}" alt="PS logo" class="budget-logo" />
        </div>
      </header>
    `,
    meta: [],
    sections: [
      {
        title: "Descripción de los Trabajos",
        custom: true,
        headers: ["Descripción", "Mano de obra / Materiales de obra", "Artefactos materiales"],
        rows,
        totalsRow: totalRow,
        renderSection(section) {
          const headers = section.headers || [];
          const dataRows = section.rows || [];
          const totalsRow = section.totalsRow;

          const headerHtml = headers.length
            ? `<thead><tr>${headers
                .map((h, i) => `<th${i === 0 ? ' class="desc"' : ""}>${escapeHtml(h)}</th>`)
                .join("")}</tr></thead>`
            : "";

          const bodyRows = dataRows
            .map((row) => {
              const isHtmlRow = row.some((cell) => typeof cell === "string" && /<[a-z]/i.test(cell));
              const cells = row
                .map((cell, i) => {
                  const isHtml = typeof cell === "string" && /<[a-z]/i.test(cell);
                  return `<td${i === 0 ? ' class="desc"' : ""}>${isHtml ? cell : escapeHtml(cell ?? "")}</td>`;
                })
                .join("");
              return `<tr${isHtmlRow ? ' class="rich"' : ""}>${cells}</tr>`;
            })
            .join("");

          const totalsHtml = totalsRow
            ? `<tr class="totals">${totalsRow
                .map((cell, i) => `<td${i === 0 ? ' class="desc"' : ""}>${cell}</td>`)
                .join("")}</tr>`
            : "";

          return `
            <section>
              <h2>${escapeHtml(section.title)}</h2>
              <table class="budget-items-table">
                ${headerHtml}
                <tbody>${bodyRows}${totalsHtml}</tbody>
              </table>
            </section>
          `;
        }
      }
    ],
    signatures: [],
    footerHtml: `
      ${conditions.length ? `<section class="budget-conditions">${conditions.join("")}</section>` : ""}
      ${
        companyInfoHtml
          ? `<section class="budget-contact">
              <h3>DATOS DE CONTACTO</h3>
              <p>${companyInfoHtml}</p>
            </section>`
          : ""
      }
    `,
    customStyles: `
      /* Cabecera con logo PS */
      .budget-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        border-bottom: 2px solid #172033;
        padding-bottom: 18px;
        margin-bottom: 22px;
      }
      .budget-header-left { flex: 1; min-width: 0; }
      .budget-title {
        margin: 0 0 4px;
        font-size: 30px;
        font-weight: 900;
        letter-spacing: 0.02em;
      }
      .budget-header-subtitle {
        margin: 0 0 14px;
        color: #475569;
        font-size: 14px;
      }
      .budget-meta-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        max-width: 620px;
      }
      .budget-meta-row .label {
        display: block;
        color: #647084;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .budget-meta-row .value {
        font-size: 13px;
        font-weight: 700;
        color: #172033;
        line-height: 1.4;
      }
      .budget-logo {
        width: 110px;
        height: auto;
        object-fit: contain;
      }
      .budget-conditions {
        margin-top: 40px;
        font-size: 14px;
        line-height: 1.6;
        text-align: center;
      }
      .budget-conditions p { margin: 4px 0; }
      .budget-contact {
        margin-top: 50px;
        padding: 14px 18px;
        background: #f1f5f9;
        border-radius: 6px;
        font-size: 13px;
      }
      .budget-contact h3 {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.06em;
        color: #334155;
      }
      .budget-contact p { margin: 0; line-height: 1.6; color: #1f2937; }

      /* Tabla principal del presupuesto con columna de checks */
      .budget-items-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
        font-size: 13px;
      }
      .budget-items-table th,
      .budget-items-table td {
        border-bottom: 1px solid #dde1e7;
        padding: 10px 12px;
        vertical-align: middle;
        text-align: left;
      }
      .budget-items-table th {
        background: #f8fafc;
        color: #475569;
        font-size: 11px;
        text-transform: none;
        font-weight: 700;
      }
      .budget-items-table th:nth-child(2),
      .budget-items-table th:nth-child(3),
      .budget-items-table td:nth-child(2),
      .budget-items-table td:nth-child(3) {
        text-align: center;
        width: 22%;
      }
      .budget-items-table td:nth-child(1) {
        width: 56%;
      }
      .budget-items-table .check {
        font-size: 22px;
        line-height: 1;
        color: #172033;
        font-weight: 900;
      }
      .budget-items-table small {
        display: block;
        margin-top: 2px;
        color: #647084;
        font-size: 11px;
        font-style: italic;
      }
      .budget-items-table tr.totals td {
        background: #f1f5f9;
        font-weight: 700;
        border-top: 2px solid #172033;
        border-bottom: 2px solid #172033;
      }
      .budget-items-table tr.totals td:nth-child(2) {
        text-align: right;
      }
    `
  };
}

/**
 * Abre una ventana nueva con el presupuesto formateado listo para
 * imprimir o "Guardar como PDF" desde el diálogo del navegador.
 *
 * @returns {boolean} true si la ventana se abrió correctamente.
 */
export function openBudgetReport({ budget, checklist = [], company = {}, budgetNumber, targetWindow = null } = {}) {
  const report = buildBudgetReport({ budget, checklist, company, budgetNumber });
  return openPrintableReport(report, targetWindow);
}
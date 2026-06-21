<script>
    import { Banknote, ChevronDown, ChevronLeft, Copy, DollarSign, Filter, CheckCircle, AlertCircle, Eye, History, Landmark, Printer, Download, MapPin, Smartphone } from "lucide-svelte";
    import { selectedTeam, selectedTeamId, userStore, hasTeamPermission } from "../data/stores.js";
    import { getTeamPaymentsData, registerTeamPayment } from "../data/teamPayments.js";
    import { getBankName } from "../helpers/banks.js";
    import { createNotification } from "../data/notifications.js";
    import { navigateTo } from "../router.js";
    import Toast from "../components/Toast.svelte";
    import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
    import { downloadExcelReport, openPrintableReport } from "../helpers/reportExport.js";
    import { formatGpsCoordinates, geocodeAddress, normalizeCoordinates } from "../helpers/navigation.js";

    let team = $derived($selectedTeam);
    let teamId = $derived(team?.id || $selectedTeamId);
    let canViewPayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "view"));
    let canCreatePayments = $derived(hasTeamPermission(team, $userStore?.uid, "payments", "create"));
    let memberBalances = $state([]);
    let isLoading = $state(true);
    let showToast = $state(false);
    let messageToast = $state("");
    let typeToast = $state("success");
    
    // Filters
    let filterStatus = $state("all"); // 'all', 'paid', 'unpaid'
    
    // Payment Modal
    let showPaymentModal = $state(false);
    let selectedMember = $state(null);
    let selectedPrivateProfile = $derived(selectedMember?.privateProfile || {});
    let paymentType = $state("total"); // 'total' or 'partial'
    let paymentMethod = $state("cash");
    let paymentAmount = $state(0);
    let isSaving = $state(false);
    
    // Details Modal
    let showDetailsModal = $state(false);
    let selectedMemberDetails = $state(null);
    let expandedMemberId = $state(null);
    let showAdditionalPaymentInfo = $state(false);
    let workLocationAddresses = $state({});
    const resolvingLocationAddressIds = new Set();
    const paymentMethodLabels = {
        cash: "Efectivo",
        transfer: "Transferencia",
        bizum: "Bizum",
    };

    let filteredMembers = $derived.by(() => {
        if (filterStatus === 'paid') return memberBalances.filter(m => m.balance <= 0.01);
        if (filterStatus === 'unpaid') return memberBalances.filter(m => m.balance > 0.01);
        return memberBalances;
    });

    let pendingPaymentSummary = $derived.by(() => {
        const membersWithBalance = memberBalances.filter((member) => Number(member.balance) > 0.01);
        const totalToPay = membersWithBalance.reduce((acc, member) => acc + (Number(member.balance) || 0), 0);
        return {
            totalToPay,
            memberCount: membersWithBalance.length,
        };
    });

    async function loadData() {
        if (!team?.id || !canViewPayments) return;
        isLoading = true;
        try {
            memberBalances = await getTeamPaymentsData(team.id);
        } catch (e) {
            showNotification("Error al cargar datos", "error");
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (team?.id) {
            loadData();
        }
    });

    $effect(() => {
        const detailWorks = getDetailWorks(selectedMemberDetails);
        if (!showDetailsModal || !detailWorks.length) return;

        const pendingWorks = detailWorks.filter((work) => {
            const key = getWorkAddressKey(work);
            return getWorkMemberGps(work) &&
                !work.memberLocationAddress &&
                !workLocationAddresses[key] &&
                !resolvingLocationAddressIds.has(key);
        });

        if (pendingWorks.length) {
            resolveWorkLocationAddresses(pendingWorks);
        }
    });

    function showNotification(msg, type = "success") {
        messageToast = msg;
        typeToast = type;
        showToast = true;
        setTimeout(() => showToast = false, 3000);
    }

    function goToTeamHome() {
        navigateTo(teamId ? `/teams/${teamId}` : "/teams");
    }

    function openPaymentModal(member) {
        selectedMember = member;
        paymentType = "total";
        paymentMethod = "cash";
        paymentAmount = member.balance;
        showPaymentModal = true;
    }

    $effect(() => {
        if (paymentType === 'total' && selectedMember) {
            paymentAmount = selectedMember.balance;
        }
    });

    async function handlePayment(shouldPrint = false) {
        if (!team?.id || !selectedMember || !canCreatePayments) return;
        if (paymentAmount <= 0) {
            showNotification("El monto debe ser mayor a 0", "error");
            return;
        }
        
        isSaving = true;
        let receiptWindow = null;
        try {
            const memberSnapshot = selectedMember;
            const amountToPay = Number(paymentAmount) || 0;
            const coveredWorks = getPaymentCoveredWorks(memberSnapshot, amountToPay);
            if (shouldPrint) {
                receiptWindow = openReceiptWindow();
            }
            const payment = await registerTeamPayment(
                team.id,
                selectedMember.id,
                amountToPay,
                paymentType,
                $userStore,
                paymentMethod,
                {
                    balanceBefore: memberSnapshot.balance,
                    balanceAfter: Math.max((Number(memberSnapshot.balance) || 0) - amountToPay, 0),
                    pendingWorkDaysBefore: memberSnapshot.pendingWorkDays,
                    pendingOvertimeHoursBefore: memberSnapshot.pendingOvertimeHours,
                    coveredWorks,
                },
            );
            
            // Notificar al usuario
            const title = "Pago Recibido";
            const message = `Has recibido un pago de ${formatMoney(amountToPay)} del equipo "${team.name}"`;
            await createNotification(selectedMember.id, title, message, {
                url: `/teams/${team.id}/payments`,
                type: "payment_received",
                sourceId: payment?.id || "",
                teamId: team.id,
            });
            
            showNotification("Pago registrado exitosamente");
            showPaymentModal = false;
            if (shouldPrint) {
                generatePaymentReceipt({ ...memberSnapshot, receiptWorks: coveredWorks }, payment, receiptWindow);
            }
            await loadData();
        } catch (e) {
            console.error("Error registering payment:", e);
            if (receiptWindow && !receiptWindow.closed) {
                receiptWindow.close();
            }
            showNotification("Error al registrar pago", "error");
        } finally {
            isSaving = false;
        }
    }

    function openDetailsModal(member) {
        selectedMemberDetails = member;
        showDetailsModal = true;
    }

    function toggleMemberDetails(memberId) {
        expandedMemberId = expandedMemberId === memberId ? null : memberId;
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: team?.projectBudgetCurrency || 'MXN',
        }).format(Number(amount) || 0);
    }

    function formatDate(value) {
        if (!value) return "-";
        return new Date(value).toLocaleDateString("es-ES", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    }

    function formatDateTime(value) {
        if (!value) return "-";
        return new Date(value).toLocaleString("es-ES", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatMetric(value, decimals = 2) {
        const numericValue = Number(value) || 0;
        return Number.isInteger(numericValue)
            ? String(numericValue)
            : numericValue.toFixed(decimals).replace(/\.?0+$/, "");
    }

    function getWorkTypeLabel(work) {
        if (work.type === "full-day") return "Día completo";
        if (work.type === "half-day") return "Medio día";
        if (work.type === "variable") return "Jornada variable";
        if (work.type === "overtime") return "Horas extra";
        return "Jornada";
    }

    function getPaymentMethodLabel(method) {
        return paymentMethodLabels[method] || "No indicado";
    }

    async function copyPaymentValue(value, label) {
        const text = String(value || "").trim();
        if (!text) {
            showNotification(`${label} no disponible`, "error");
            return;
        }

        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else if (typeof document !== "undefined") {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                textarea.remove();
            } else {
                throw new Error("Clipboard unavailable");
            }
            showNotification(`${label} copiado`);
        } catch (error) {
            showNotification(`No se pudo copiar ${label.toLowerCase()}`, "error");
        }
    }

    function getWorkUnits(work) {
        if (Number.isFinite(Number(work?.workUnits))) return Number(work.workUnits);
        if (work.type === "full-day") return 1;
        if (work.type === "half-day") return 0.5;
        if (work.type === "variable") return (Number(work.variableHours || work.durationHours) || 0) / 8;
        return 0;
    }

    function getPendingWorkUnits(work) {
        return Number.isFinite(Number(work?.pendingWorkUnits))
            ? Number(work.pendingWorkUnits)
            : getWorkUnits(work);
    }

    function getPendingOvertimeHours(work) {
        return Number.isFinite(Number(work?.pendingOvertimeHours))
            ? Number(work.pendingOvertimeHours)
            : Number(work.overtimeHours) || 0;
    }

    function getWorkAmount(work, member, mode = "total") {
        if (Number.isFinite(Number(work?.paymentAppliedAmount))) return Number(work.paymentAppliedAmount);
        if (mode === "pending" && Number.isFinite(Number(work?.pendingAmount))) return Number(work.pendingAmount);
        if (Number.isFinite(Number(work?.workAmount))) return Number(work.workAmount);
        const base = getWorkUnits(work) * (Number(member?.dailyRate) || 0);
        const extra = (Number(work.overtimeHours) || 0) * (Number(member?.extraHourRate) || 0);
        return base + extra;
    }

    function getPaymentCoveredWorks(member, amount) {
        let remainingAmount = Number(amount) || 0;

        return (member?.pendingWorks || []).flatMap((work) => {
            if (remainingAmount <= 0) return [];

            const pendingAmount = Math.max(0, Number(work.pendingAmount) || 0);
            if (pendingAmount <= 0) return [];

            const paymentAppliedAmount = Math.min(pendingAmount, remainingAmount);
            const appliedRatio = pendingAmount > 0 ? paymentAppliedAmount / pendingAmount : 0;
            remainingAmount -= paymentAppliedAmount;

            return [{
                ...work,
                paymentAppliedAmount,
                pendingAmountBeforePayment: pendingAmount,
                pendingAmount: paymentAppliedAmount,
                pendingWorkUnits: (Number(work.pendingWorkUnits) || 0) * appliedRatio,
                pendingOvertimeHours: (Number(work.pendingOvertimeHours) || 0) * appliedRatio,
            }];
        });
    }

    function getDetailWorks(member) {
        if (Number(member?.balance) > 0.01) return member?.pendingWorks || [];
        return member?.works || [];
    }

    function getDetailWorksTitle(member) {
        return Number(member?.balance) > 0.01 ? "Jornadas pendientes" : "Jornadas registradas";
    }

    function getWorkAddressKey(work) {
        return work?.id || `${work?.userId || "member"}-${work?.date || "date"}-${work?.createdAt || ""}`;
    }

    function getWorkMemberGps(work) {
        return normalizeCoordinates(work?.memberGps);
    }

    function getWorkMemberLocationLabel(work) {
        const gps = getWorkMemberGps(work);
        if (!gps) return "";

        return work?.memberLocationAddress ||
            workLocationAddresses[getWorkAddressKey(work)] ||
            formatGpsCoordinates(gps);
    }

    function getWorkMemberLocationUrl(work) {
        const gps = getWorkMemberGps(work);
        if (!gps) return "";
        return `https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lon}`;
    }

    async function resolveWorkLocationAddresses(works) {
        const resolvedEntries = await Promise.all(
            works.map(async (work) => {
                const key = getWorkAddressKey(work);
                const gps = getWorkMemberGps(work);
                if (!gps) return null;

                resolvingLocationAddressIds.add(key);
                try {
                    return [key, await geocodeAddress(gps)];
                } catch (error) {
                    return [key, formatGpsCoordinates(gps)];
                } finally {
                    resolvingLocationAddressIds.delete(key);
                }
            }),
        );

        const nextAddresses = Object.fromEntries(resolvedEntries.filter(Boolean));
        if (Object.keys(nextAddresses).length) {
            workLocationAddresses = { ...workLocationAddresses, ...nextAddresses };
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function openReceiptWindow() {
        if (typeof window === "undefined") return null;
        return window.open("", "_blank", "width=900,height=1200");
    }

    function generatePaymentReceipt(member, payment, receiptWindow = null) {
        const targetWindow = receiptWindow || openReceiptWindow();
        if (!targetWindow) {
            showNotification("El navegador bloqueó la ventana del comprobante", "error");
            return;
        }

        const balanceBefore = Number(member?.balance) || 0;
        const paymentAmountValue = Number(payment?.amount) || 0;
        const balanceAfter = Math.max(balanceBefore - paymentAmountValue, 0);
        const paymentsBeforeThis = Math.max((Number(member?.totalPaid) || 0), 0);
        const works = member?.receiptWorks || member?.pendingWorks || [];
        const payments = member?.payments || [];
        const receiptNumber = payment?.id || `TEMP-${Date.now()}`;
        const teamName = team?.name || team?.team || "Equipo";
        const company = team?.companyProfile || {};
        const companyName = company.name || teamName;
        const memberName = member?.name || member?.email || "Usuario";
        const registeredBy = payment?.registeredByName || $userStore?.name || $userStore?.email || "Usuario";
        const paymentMethodLabel = getPaymentMethodLabel(payment?.method);
        const generatedAt = new Date().toISOString();

        const workRows = works.map((work) => `
            <tr>
                <td>${escapeHtml(work.date || "-")}</td>
                <td>${escapeHtml(getWorkTypeLabel(work))}</td>
                <td>${escapeHtml(formatMetric(getPendingWorkUnits(work)))}</td>
                <td>${escapeHtml(formatMetric(getPendingOvertimeHours(work)))}h</td>
                <td>${escapeHtml(work.taskTitle || work.note || "")}</td>
                <td>${escapeHtml(getWorkMemberLocationLabel(work) || "Sin GPS")}</td>
                <td class="money">${escapeHtml(formatMoney(getWorkAmount(work, member, "pending")))}</td>
            </tr>
        `).join("");

        const paymentRows = payments.map((item) => `
            <tr>
                <td>${escapeHtml(formatDate(item.date))}</td>
                <td>${escapeHtml(item.type === "total" ? "Pago total" : "Pago parcial")}</td>
                <td>${escapeHtml(getPaymentMethodLabel(item.method))}</td>
                <td>${escapeHtml(item.registeredByName || "-")}</td>
                <td class="money">${escapeHtml(formatMoney(item.amount))}</td>
            </tr>
        `).join("");

        const receiptHtml = `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8" />
    <title>Comprobante de pago ${escapeHtml(receiptNumber)}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            padding: 32px;
            color: #172033;
            background: #f3f4f6;
            font-family: Arial, Helvetica, sans-serif;
        }
        .page {
            max-width: 920px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #dde1e7;
            padding: 32px;
        }
        header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #172033;
            padding-bottom: 20px;
            margin-bottom: 24px;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: 28px; }
        h2 { font-size: 16px; margin: 28px 0 10px; }
        .muted { color: #647084; font-size: 13px; }
        .receipt-id { text-align: right; }
        .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 18px;
        }
        .box {
            border: 1px solid #dde1e7;
            padding: 14px;
            min-height: 74px;
        }
        .label {
            display: block;
            color: #647084;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .value { font-size: 16px; font-weight: 700; }
        .summary {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin: 18px 0;
        }
        .summary .box { min-height: 0; }
        .money { text-align: right; white-space: nowrap; }
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
        }
        th {
            background: #f8fafc;
            color: #334155;
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
        }
        .total-row td {
            background: #f8fafc;
            font-weight: 700;
        }
        .signatures {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 48px;
            margin-top: 48px;
        }
        .signature-line {
            border-top: 1px solid #172033;
            padding-top: 8px;
            text-align: center;
            font-size: 12px;
        }
        .actions {
            max-width: 920px;
            margin: 0 auto 16px;
            text-align: right;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        button {
            border: 0;
            background: #172033;
            color: #ffffff;
            padding: 10px 16px;
            font-weight: 700;
            cursor: pointer;
        }
        button.secondary {
            background: #e5e7eb;
            color: #172033;
        }
        @media print {
            body { padding: 0; background: #ffffff; }
            .page { border: 0; max-width: none; }
            .actions { display: none; }
        }
    </style>
</head>
<body>
    <div class="actions">
        <button onclick="window.print()">Guardar / imprimir PDF</button>
        <button class="secondary" onclick="window.close()">Cerrar</button>
    </div>
    <main class="page">
        <header>
            <div>
                <h1>Comprobante de pago</h1>
                <p class="muted">MetricWork · ${escapeHtml(companyName)}</p>
            </div>
            <div class="receipt-id">
                <strong>No. ${escapeHtml(receiptNumber)}</strong>
                <p class="muted">Generado: ${escapeHtml(formatDateTime(generatedAt))}</p>
            </div>
        </header>

        <section class="grid">
            <div class="box">
                <span class="label">Empresa</span>
                <span class="value">${escapeHtml(companyName)}</span>
            </div>
            <div class="box">
                <span class="label">NIF/CIF empresa</span>
                <span class="value">${escapeHtml(company.taxId || "Sin dato")}</span>
            </div>
            <div class="box">
                <span class="label">Equipo</span>
                <span class="value">${escapeHtml(teamName)}</span>
            </div>
            <div class="box">
                <span class="label">Miembro</span>
                <span class="value">${escapeHtml(memberName)}</span>
            </div>
            <div class="box">
                <span class="label">Registrado por</span>
                <span class="value">${escapeHtml(registeredBy)}</span>
            </div>
            <div class="box">
                <span class="label">Fecha del pago</span>
                <span class="value">${escapeHtml(formatDateTime(payment?.date))}</span>
            </div>
            <div class="box">
                <span class="label">Forma de pago</span>
                <span class="value">${escapeHtml(paymentMethodLabel)}</span>
            </div>
        </section>

        <section class="summary">
            <div class="box">
                <span class="label">Tarifa diaria</span>
                <span class="value">${escapeHtml(formatMoney(member?.dailyRate || 0))}</span>
            </div>
            <div class="box">
                <span class="label">Hora extra</span>
                <span class="value">${escapeHtml(formatMoney(member?.extraHourRate || 0))}</span>
            </div>
            <div class="box">
                <span class="label">Días pendientes</span>
                <span class="value">${escapeHtml(formatMetric(member?.pendingWorkDays ?? member?.totalWorkDays))}</span>
            </div>
            <div class="box">
                <span class="label">Horas extra pendientes</span>
                <span class="value">${escapeHtml(formatMetric(member?.pendingOvertimeHours ?? member?.totalOvertimeHours))}h</span>
            </div>
        </section>

        <h2>Resumen económico</h2>
        <table>
            <tbody>
                <tr><td>Total generado por jornadas</td><td class="money">${escapeHtml(formatMoney(member?.totalEarned || 0))}</td></tr>
                <tr><td>Pagado anteriormente</td><td class="money">${escapeHtml(formatMoney(paymentsBeforeThis))}</td></tr>
                <tr><td>Saldo antes de este pago</td><td class="money">${escapeHtml(formatMoney(balanceBefore))}</td></tr>
                <tr><td>Tipo de pago</td><td class="money">${escapeHtml(payment?.type === "total" ? "Pago total" : "Pago parcial")}</td></tr>
                <tr><td>Forma de pago</td><td class="money">${escapeHtml(paymentMethodLabel)}</td></tr>
                <tr class="total-row"><td>Monto pagado</td><td class="money">${escapeHtml(formatMoney(paymentAmountValue))}</td></tr>
                <tr class="total-row"><td>Saldo posterior</td><td class="money">${escapeHtml(formatMoney(balanceAfter))}</td></tr>
            </tbody>
        </table>

        <h2>Jornadas cubiertas por este pago</h2>
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Días</th>
                    <th>Horas extra</th>
                    <th>Nota / tarea</th>
                    <th>Ubicación GPS</th>
                    <th class="money">Importe</th>
                </tr>
            </thead>
            <tbody>
                ${workRows || `<tr><td colspan="7">No hay jornadas pendientes asociadas a este pago.</td></tr>`}
            </tbody>
        </table>

        <h2>Pagos previos registrados</h2>
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Forma de pago</th>
                    <th>Registrado por</th>
                    <th class="money">Importe</th>
                </tr>
            </thead>
            <tbody>
                ${paymentRows || `<tr><td colspan="5">No hay pagos previos registrados.</td></tr>`}
            </tbody>
        </table>

        <section class="signatures">
            <div class="signature-line">Firma del responsable</div>
            <div class="signature-line">Firma del miembro</div>
        </section>
    </main>
</body>
</html>`;

        targetWindow.document.open();
        targetWindow.document.write(receiptHtml);
        targetWindow.document.close();
        targetWindow.focus();
    }

    function createPaymentsReport() {
        const teamName = team?.name || team?.team || "Equipo";
        const statusLabel =
            filterStatus === "paid"
                ? "Pagados"
                : filterStatus === "unpaid"
                    ? "No pagados"
                    : "Todos";
        const totals = filteredMembers.reduce(
            (acc, member) => {
                acc.earned += Number(member.totalEarned) || 0;
                acc.paid += Number(member.totalPaid) || 0;
                acc.balance += Number(member.balance) || 0;
                acc.workDays += Number(member.pendingWorkDays) || 0;
                acc.overtime += Number(member.pendingOvertimeHours) || 0;
                return acc;
            },
            { earned: 0, paid: 0, balance: 0, workDays: 0, overtime: 0 },
        );

        return {
            title: "Reporte de pagos y tiempo",
            subtitle: `MetricWork - ${teamName}`,
            meta: [
                { label: "Equipo", value: teamName },
                { label: "Filtro", value: statusLabel },
                { label: "Integrantes", value: filteredMembers.length },
                { label: "Moneda", value: team?.projectBudgetCurrency || "MXN" },
                { label: "Generado por", value: $userStore?.name || $userStore?.email || "Usuario" },
            ],
            sections: [
                {
                    title: "Resumen",
                    headers: ["Indicador", "Valor"],
                    rows: [
                        ["Total ganado", formatMoney(totals.earned)],
                        ["Total pagado", formatMoney(totals.paid)],
                        ["Saldo pendiente", formatMoney(totals.balance)],
                        ["Dias pendientes", formatMetric(totals.workDays)],
                        ["Horas extra pendientes", `${formatMetric(totals.overtime)}h`],
                    ],
                },
                {
                    title: "Balance por integrante",
                    headers: ["Integrante", "Dias pendientes", "Horas extra pendientes", "Tarifa diaria", "Hora extra", "Total ganado", "Pagado", "Saldo", "Estado"],
                    rows: filteredMembers.map((member) => [
                        member?.name || member?.email || "Usuario",
                        formatMetric(member.pendingWorkDays),
                        `${formatMetric(member.pendingOvertimeHours)}h`,
                        formatMoney(member.dailyRate),
                        formatMoney(member.extraHourRate),
                        formatMoney(member.totalEarned),
                        formatMoney(member.totalPaid),
                        formatMoney(member.balance),
                        member.balance > 0.01 ? "Pendiente" : "Al dia",
                    ]),
                },
                {
                    title: "Detalle de jornadas pendientes",
                    headers: ["Integrante", "Fecha", "Tipo", "Dias", "Horas extra", "Nota / tarea", "Ubicación GPS", "Importe"],
                    rows: filteredMembers.flatMap((member) =>
                        (member.pendingWorks || []).map((work) => [
                            member?.name || member?.email || "Usuario",
                            formatDate(work.date),
                            getWorkTypeLabel(work),
                            formatMetric(getPendingWorkUnits(work)),
                            `${formatMetric(getPendingOvertimeHours(work))}h`,
                            work.taskTitle || work.note || "",
                            getWorkMemberLocationLabel(work) || "Sin GPS",
                            formatMoney(getWorkAmount(work, member, "pending")),
                        ]),
                    ),
                },
                {
                    title: "Detalle de pagos",
                    headers: ["Integrante", "Fecha", "Tipo", "Forma de pago", "Registrado por", "Monto"],
                    rows: filteredMembers.flatMap((member) =>
                        (member.payments || []).map((payment) => [
                            member?.name || member?.email || "Usuario",
                            formatDateTime(payment.date),
                            payment.type === "total" ? "Pago total" : "Pago parcial",
                            getPaymentMethodLabel(payment.method),
                            payment.registeredByName || "-",
                            formatMoney(payment.amount),
                        ]),
                    ),
                },
            ],
        };
    }

    function handleExportPaymentsPdf() {
        const opened = openPrintableReport(createPaymentsReport());
        if (!opened) showNotification("El navegador bloqueo la ventana del reporte", "error");
    }

    function handleExportPaymentsExcel() {
        const teamName = team?.name || team?.team || "equipo";
        downloadExcelReport(createPaymentsReport(), `reporte-pagos-${teamName}`);
    }
</script>

<div class="payments-container">
    <Toast message={messageToast} type={typeToast} show={showToast} />
    
    <header>
        <TitleHeader title="Pagos del Equipo" description={team?.name || ""} action={goToTeamHome} />
    </header>

    {#if !canViewPayments}
        <div class="empty-state">
            <AlertCircle size={48} color="var(--danger-color)" />
            <h2>Acceso Denegado</h2>
            <p>No tienes permiso para ver los pagos de este equipo.</p>
        </div>
    {:else if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Cargando información de pagos...</p>
        </div>
    {:else}
        <div class="content">
            <div class="filters-card">
                <div class="filter-group">
                    <Filter size={18} />
                    <span>Filtrar por:</span>
                    <select bind:value={filterStatus}>
                        <option value="all">Todos</option>
                        <option value="unpaid">No Pagados (con saldo)</option>
                        <option value="paid">Pagados</option>
                    </select>
                </div>
                
                <div class="additional-info">
                    <button
                        type="button"
                        class="info-toggle"
                        onclick={() => showAdditionalPaymentInfo = !showAdditionalPaymentInfo}
                        aria-expanded={showAdditionalPaymentInfo}
                    >
                        <span>Información adicional</span>
                        <ChevronDown size={16} class={showAdditionalPaymentInfo ? "open" : ""} />
                    </button>

                    {#if showAdditionalPaymentInfo}
                        <div class="summary-stats">
                            <div class="stat">
                                <span class="stat-label">Total a pagar</span>
                                <span class="stat-value danger">
                                    {formatMoney(pendingPaymentSummary.totalToPay)}, de {pendingPaymentSummary.memberCount}
                                    {pendingPaymentSummary.memberCount === 1 ? "miembro" : "miembros"}
                                </span>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="export-actions">
                    <button type="button" onclick={handleExportPaymentsPdf}>
                        <Download size={17} />
                        <span>Exportar PDF</span>
                    </button>
                    <button type="button" onclick={handleExportPaymentsExcel}>
                        <Download size={17} />
                        <span>Exportar Excel</span>
                    </button>
                </div>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Integrante</th>
                            <th>Días pendientes</th>
                            <th>Horas extra pendientes</th>
                            <th>Total Ganado</th>
                            <th>Pagado</th>
                            <th>Saldo Pendiente</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredMembers as member}
                            <tr>
                                <td class="member-cell">
                                    <div class="avatar">{(member?.name || member?.email || "?").charAt(0).toUpperCase()}</div>
                                    <span>{member?.name || member?.email || "Usuario"}</span>
                                </td>
                                <td>{formatMetric(member.pendingWorkDays)}</td>
                                <td>{formatMetric(member.pendingOvertimeHours)}h</td>
                                <td>{formatMoney(member.totalEarned)}</td>
                                <td>{formatMoney(member.totalPaid)}</td>
                                <td class="balance-cell">
                                    <span class="badge {member.balance > 0.01 ? 'unpaid' : 'paid'}">
                                        {member.balance > 0.01 ? 'No Pagado' : 'Pagado'} ({formatMoney(member.balance)})
                                    </span>
                                </td>
                                <td>
                                    <div class="actions-cell">
                                        <button class="icon-btn details" onclick={() => openDetailsModal(member)} title="Ver detalles">
                                            <Eye size={18} />
                                        </button>
                                        {#if member.balance > 0.01}
                                            {#if canCreatePayments}
                                                <button class="pay-btn" onclick={() => openPaymentModal(member)}>
                                                    <DollarSign size={16} />
                                                    Pagar
                                                </button>
                                            {:else}
                                                <span class="status-ok">Pendiente</span>
                                            {/if}
                                        {:else}
                                            <span class="status-ok">
                                                <CheckCircle size={18} /> Al día
                                            </span>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                        {#if filteredMembers.length === 0}
                            <tr>
                                <td colspan="7" class="empty-row">No hay integrantes en esta categoría.</td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>

            <div class="mobile-members-list">
                {#each filteredMembers as member}
                    <article class="mobile-member-card">
                        <div class="mobile-member-summary">
                            <div class="member-cell mobile">
                                <div class="avatar">{(member?.name || member?.email || "?").charAt(0).toUpperCase()}</div>
                                <div class="mobile-member-text">
                                    <h3>{member?.name || member?.email || "Usuario"}</h3>
                                    <span>{formatMetric(member.pendingWorkDays)} días pendientes · {formatMetric(member.pendingOvertimeHours)}h extra</span>
                                </div>
                            </div>
                            <div class="mobile-balance">
                                <span class="balance-label">Saldo</span>
                                <strong class:positive={member.balance <= 0.01}>{formatMoney(member.balance)}</strong>
                            </div>
                        </div>

                        <div class="mobile-status-row">
                            <span class="badge {member.balance > 0.01 ? 'unpaid' : 'paid'}">
                                {member.balance > 0.01 ? 'Pendiente' : 'Al día'}
                            </span>
                            <button
                                class="more-btn"
                                onclick={() => toggleMemberDetails(member.id)}
                                aria-expanded={expandedMemberId === member.id}
                            >
                                <span>{expandedMemberId === member.id ? "Ocultar" : "Más detalles"}</span>
                                <ChevronDown size={16} class={expandedMemberId === member.id ? "open" : ""} />
                            </button>
                        </div>

                        {#if expandedMemberId === member.id}
                            <div class="mobile-details-panel">
                                <div class="mobile-metrics">
                                    <div>
                                        <span>Total ganado</span>
                                        <strong>{formatMoney(member.totalEarned)}</strong>
                                    </div>
                                    <div>
                                        <span>Pagado</span>
                                        <strong>{formatMoney(member.totalPaid)}</strong>
                                    </div>
                                    <div>
                                        <span>Días pendientes</span>
                                        <strong>{formatMetric(member.pendingWorkDays)}</strong>
                                    </div>
                                    <div>
                                        <span>Horas extra pendientes</span>
                                        <strong>{formatMetric(member.pendingOvertimeHours)}h</strong>
                                    </div>
                                </div>

                                <div class="mobile-actions">
                                    <button class="details-btn" onclick={() => openDetailsModal(member)}>
                                        <Eye size={17} />
                                        <span>Historial</span>
                                    </button>
                                    {#if member.balance > 0.01}
                                        {#if canCreatePayments}
                                            <button class="pay-btn" onclick={() => openPaymentModal(member)}>
                                                <DollarSign size={16} />
                                                Pagar
                                            </button>
                                        {:else}
                                            <span class="status-ok">Pendiente</span>
                                        {/if}
                                    {:else}
                                        <span class="status-ok">
                                            <CheckCircle size={18} /> Al día
                                        </span>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </article>
                {/each}
                {#if filteredMembers.length === 0}
                    <div class="empty-row mobile-empty">No hay integrantes en esta categoría.</div>
                {/if}
            </div>
        </div>

        <SliceContainer bind:show={showPaymentModal}>
            <div class="payment-modal-form">
                <div class="modal-header">
                    <div class="modal-icon">
                        <DollarSign size={24} />
                    </div>
                    <h3>Registrar Pago</h3>
                    <p>para {selectedMember?.name}</p>
                </div>

                <div class="balance-display">
                    <span class="label">Saldo Pendiente:</span>
                    <span class="amount">{formatMoney(selectedMember?.balance || 0)}</span>
                </div>

                <div class="payment-options">
                    <button 
                        class="payment-option {paymentType === 'total' ? 'active' : ''}" 
                        onclick={() => paymentType = 'total'}
                    >
                        Total
                    </button>
                    <button 
                        class="payment-option {paymentType === 'partial' ? 'active' : ''}" 
                        onclick={() => paymentType = 'partial'}
                    >
                        Parcial
                    </button>
                </div>

                <div class="form-group">
                    <label for="amount">Monto a Pagar</label>
                    <div class="input-with-icon">
                        <DollarSign size={18} color="var(--success-color, #1be885)" />
                        <input 
                            type="number" 
                            id="amount" 
                            bind:value={paymentAmount} 
                            disabled={paymentType === 'total'}
                            min="0.01"
                            step="0.01"
                        />
                    </div>
                </div>

                <div class="form-group">
                    <span class="form-label">Forma de pago</span>
                    <div class="payment-options method-options" aria-label="Forma de pago">
                        <button
                            type="button"
                            class="payment-option {paymentMethod === 'cash' ? 'active' : ''}"
                            onclick={() => paymentMethod = 'cash'}
                        >
                            <Banknote size={16} />
                            Efectivo
                        </button>
                        <button
                            type="button"
                            class="payment-option {paymentMethod === 'transfer' ? 'active' : ''}"
                            onclick={() => paymentMethod = 'transfer'}
                        >
                            <Landmark size={16} />
                            Transferencia
                        </button>
                        <button
                            type="button"
                            class="payment-option {paymentMethod === 'bizum' ? 'active' : ''}"
                            onclick={() => paymentMethod = 'bizum'}
                        >
                            <Smartphone size={16} />
                            Bizum
                        </button>
                    </div>
                </div>

                {#if paymentMethod === "cash"}
                    <div class="payment-method-card">
                        <div>
                            <span>Pago en efectivo</span>
                            <strong>No requiere datos bancarios</strong>
                        </div>
                    </div>
                {:else if paymentMethod === "bizum"}
                    <div class="payment-method-card">
                        <div>
                            <span>Teléfono Bizum</span>
                            <strong>{selectedPrivateProfile.phone || "Sin teléfono guardado"}</strong>
                        </div>
                        <button
                            type="button"
                            class="copy-payment-btn"
                            onclick={() => copyPaymentValue(selectedPrivateProfile.phone, "Teléfono Bizum")}
                            disabled={!selectedPrivateProfile.phone}
                        >
                            <Copy size={16} />
                            Copiar
                        </button>
                    </div>
                {:else if paymentMethod === "transfer"}
                    <div class="payment-method-card stacked">
                        <div class="payment-data-row">
                            <div>
                                <span>Banco</span>
                                <strong>{selectedPrivateProfile.bankName || getBankName(selectedPrivateProfile.iban? selectedPrivateProfile.iban : "")}</strong>
                            </div>
                            <button
                                type="button"
                                class="copy-payment-btn"
                                onclick={() => copyPaymentValue(selectedPrivateProfile.bankName || getBankName(selectedPrivateProfile.iban), "Banco")}
                                disabled={! (selectedPrivateProfile.bankName || getBankName(selectedPrivateProfile.iban))}
                            >
                                <Copy size={16} />
                                Copiar
                            </button>
                        </div>
                        <div class="payment-data-row">
                            <div>
                                <span>IBAN</span>
                                <strong>{selectedPrivateProfile.iban || "Sin IBAN guardado"}</strong>
                            </div>
                            <button
                                type="button"
                                class="copy-payment-btn"
                                onclick={() => copyPaymentValue(selectedPrivateProfile.iban, "IBAN")}
                                disabled={!selectedPrivateProfile.iban}
                            >
                                <Copy size={16} />
                                Copiar
                            </button>
                        </div>
                    </div>
                {/if}

                <div class="payment-actions">
                    <button 
                        class="submit-payment-btn secondary" 
                        onclick={() => handlePayment(false)} 
                        disabled={isSaving || paymentAmount <= 0 || paymentAmount > (selectedMember?.balance || 0)}
                    >
                        {#if isSaving}
                            Procesando...
                        {:else}
                            <DollarSign size={18} />
                            Pagar
                        {/if}
                    </button>
                    <button 
                        class="submit-payment-btn" 
                        onclick={() => handlePayment(true)} 
                        disabled={isSaving || paymentAmount <= 0 || paymentAmount > (selectedMember?.balance || 0)}
                    >
                        {#if isSaving}
                            Procesando...
                        {:else}
                            <Printer size={18} />
                            Pagar e imprimir
                        {/if}
                    </button>
                </div>
            </div>
        </SliceContainer>

        <SliceContainer bind:show={showDetailsModal}>
            <div class="details-modal">
                <div class="modal-header">
                    <div class="avatar large">{(selectedMemberDetails?.name || selectedMemberDetails?.email || "?").charAt(0).toUpperCase()}</div>
                    <h3>Historial de {selectedMemberDetails?.name || selectedMemberDetails?.email || "Usuario"}</h3>
                </div>

                <div class="details-tabs">
                    <div class="tab">
                        <h4><History size={16} /> {getDetailWorksTitle(selectedMemberDetails)}</h4>
                        <div class="scroll-list">
                            {#each getDetailWorks(selectedMemberDetails) as work}
                                <div class="history-item">
                                    <div class="item-info">
                                        <span class="item-date">{work.date}</span>
                                        <span class="item-type">
                                            {work.type === 'full-day' ? 'Día Completo' : work.type === 'half-day' ? 'Medio Día' : 'Horas Extra'}
                                        </span>
                                        {#if getWorkMemberLocationLabel(work)}
                                            <a class="work-location-link" href={getWorkMemberLocationUrl(work)} target="_blank" rel="noopener noreferrer">
                                                <MapPin size={13} />
                                                <span>{getWorkMemberLocationLabel(work)}</span>
                                            </a>
                                        {:else}
                                            <span class="work-location-muted">Sin GPS registrada</span>
                                        {/if}
                                    </div>
                                    <div class="item-values">
                                        {#if getPendingOvertimeHours(work) > 0}
                                            <span class="item-extra">+{formatMetric(getPendingOvertimeHours(work))}h extras</span>
                                        {/if}
                                        {#if Number(work.pendingAmount) > 0}
                                            <span class="item-price">{formatMoney(work.pendingAmount)}</span>
                                        {/if}
                                    </div>
                                </div>
                            {:else}
                                <p class="empty-msg">No hay jornadas pendientes.</p>
                            {/each}
                        </div>
                    </div>

                    <div class="tab">
                        <h4><DollarSign size={16} /> Pagos Recibidos</h4>
                        <div class="scroll-list">
                            {#each selectedMemberDetails?.payments || [] as payment}
                                <div class="history-item payment-item">
                                    <div class="item-info">
                                        <span class="item-date">{new Date(payment.date).toLocaleDateString()}</span>
                                        <span class="item-type">{payment.type === 'total' ? 'Pago Total' : 'Pago Parcial'}</span>
                                        <span class="item-type">{getPaymentMethodLabel(payment.method)}</span>
                                    </div>
                                    <div class="item-values">
                                        <span class="item-price">{formatMoney(payment.amount)}</span>
                                    </div>
                                </div>
                            {:else}
                                <p class="empty-msg">No hay registros de pagos.</p>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </SliceContainer>
    {/if}
</div>

<style>
    .payments-container {
        padding: 24px 20px var(--bottom-nav-clearance);
        padding-top: var(--page-top-safe);
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        background-color: var(--bg-page);
        color: var(--text-primary);
    }

    header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
    }



    .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 24px;
        overflow-y: auto;
        padding-bottom: 8px;
    }

    .filters-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        padding: 20px 24px;
        border-radius: var(--radius-lg);
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: var(--shadow-card);
        flex-wrap: wrap;
        gap: 16px;
    }

    .filter-group {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--text-primary);
        font-size: 15px;
        font-weight: 600;
    }

    .filter-group select {
        padding: 10px 16px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        background: var(--bg-input);
        color: var(--text-primary);
        font-family: inherit;
        outline: none;
        cursor: pointer;
        font-weight: 600;
        transition: border-color 0.2s ease;
    }
    
    .filter-group select:focus {
        border-color: var(--accent-color);
    }

    .summary-stats {
        display: flex;
        gap: 24px;
    }

    .additional-info {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        flex-wrap: wrap;
    }

    .info-toggle {
        min-height: 40px;
        border: 1px solid var(--border-color);
        background: var(--bg-input);
        color: var(--text-primary);
        border-radius: var(--radius-sm);
        padding: 0 13px;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    .info-toggle:hover {
        background: var(--bg-accent-subtle);
        color: var(--accent-ink);
        border-color: var(--accent-color);
    }

    .info-toggle :global(svg) {
        transition: transform 0.2s ease;
    }

    .info-toggle :global(svg.open) {
        transform: rotate(180deg);
    }

    .export-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .export-actions button {
        min-height: 40px;
        border: 1px solid var(--border-color);
        background: var(--bg-input);
        color: var(--text-primary);
        border-radius: var(--radius-sm);
        padding: 0 13px;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    .export-actions button:hover {
        background: var(--bg-accent-subtle);
        color: var(--accent-ink);
        border-color: var(--accent-color);
    }

    .stat {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
    }

    .stat-label {
        font-size: 11px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 700;
    }

    .stat-value {
        font-size: 22px;
        font-weight: 800;
        color: var(--text-primary);
    }

    .stat-value.danger {
        color: var(--danger-color);
    }

    .table-container {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-card);
        overflow-x: auto;
    }

    .mobile-members-list {
        display: none;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
    }

    th, td {
        padding: 18px 20px;
        border-bottom: 1px solid var(--border-color);
    }
    
    tr:last-child td {
        border-bottom: none;
    }

    th {
        font-size: 12px;
        text-transform: uppercase;
        color: var(--text-secondary);
        font-weight: 800;
        letter-spacing: 0.5px;
        background: #f9f9f9;
    }

    .member-cell {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 700;
        color: var(--text-primary);
    }

    .member-cell.mobile {
        min-width: 0;
    }

    .avatar {
        width: 36px;
        height: 36px;
        background: var(--bg-accent-subtle);
        color: var(--accent-ink);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 700;
    }

    .badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 100px;
        font-size: 13px;
        font-weight: 700;
    }

    .badge.unpaid {
        background: var(--bg-danger-subtle);
        color: var(--danger-color);
    }

    .badge.paid {
        background: var(--bg-success-subtle);
        color: var(--success-color);
    }

    .pay-btn {
        background: #000;
        color: white;
        border: none;
        padding: 10px 18px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
    }

    .pay-btn:active {
        transform: scale(0.95);
    }

    .actions-cell {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .icon-btn {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--text-primary);
        transition: all 0.2s;
    }

    .icon-btn.details {
        color: var(--text-primary);
    }

    .icon-btn:hover {
        background: var(--bg-input);
        border-color: var(--text-primary);
    }

    .status-ok {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--success-color);
        font-size: 14px;
        font-weight: 700;
    }

    .empty-row {
        text-align: center;
        color: var(--text-secondary);
        padding: 32px;
    }

    .details-btn,
    .more-btn {
        border: 1px solid var(--border-color);
        background: var(--bg-card);
        color: var(--text-primary);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }

    .details-btn {
        padding: 10px 14px;
    }

    .more-btn {
        padding: 8px 10px;
        font-size: 13px;
        white-space: nowrap;
    }

    .more-btn :global(svg) {
        transition: transform 0.2s ease;
    }

    .more-btn :global(svg.open) {
        transform: rotate(180deg);
    }

    /* Modal Styles */
    .payment-modal-form {
        padding: 8px 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .modal-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 8px;
    }

    .modal-icon {
        width: 56px;
        height: 56px;
        background: var(--bg-accent-subtle);
        color: var(--accent-ink);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
    }

    .modal-header h3 {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        color: var(--text-primary);
    }

    .modal-header p {
        margin: 4px 0 0;
        color: var(--text-secondary);
        font-size: 14px;
    }

    .balance-display {
        background: var(--bg-input);
        padding: 16px;
        border-radius: var(--radius-md);
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1px solid var(--border-color);
    }

    .balance-display .label {
        color: var(--text-secondary);
        font-size: 14px;
    }

    .balance-display .amount {
        font-size: 20px;
        font-weight: 700;
        color: var(--danger-color);
    }

    .payment-options {
        display: flex;
        background: var(--bg-input);
        padding: 4px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
    }

    .payment-option {
        flex: 1;
        padding: 10px;
        border: none;
        background: transparent;
        border-radius: calc(var(--radius-sm) - 4px);
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
    }

    .payment-option.active {
        background: var(--bg-card);
        color: var(--text-primary);
        box-shadow: var(--shadow-card);
    }

    .method-options {
        gap: 4px;
    }

    .payment-method-card {
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-card);
        padding: 14px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
    }

    .payment-method-card.stacked {
        display: flex;
        flex-direction: column;
        align-items: stretch;
    }

    .payment-method-card span,
    .payment-data-row span {
        display: block;
        margin-bottom: 4px;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 800;
    }

    .payment-method-card strong,
    .payment-data-row strong {
        color: var(--text-primary);
        font-size: 14px;
        font-weight: 850;
        line-height: 1.35;
        overflow-wrap: anywhere;
    }

    .payment-data-row {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
    }

    .payment-data-row + .payment-data-row {
        padding-top: 12px;
        border-top: 1px solid var(--border-color);
    }

    .copy-payment-btn {
        min-height: 36px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-input);
        color: var(--text-primary);
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
    }

    .copy-payment-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .form-group label,
    .form-label {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-secondary);
    }

    .input-with-icon {
        position: relative;
        display: flex;
        align-items: center;
    }

    .input-with-icon :global(svg) {
        position: absolute;
        left: 14px;
        pointer-events: none;
    }

    .input-with-icon input {
        width: 100%;
        padding: 14px 14px 14px 40px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-input);
        color: var(--text-primary);
        font-size: 16px;
        box-sizing: border-box;
        font-weight: 600;
        outline: none;
        transition: border-color 0.2s ease;
    }

    .input-with-icon input:focus {
        border-color: var(--accent-color);
    }

    .input-with-icon input:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .payment-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 8px;
    }

    .submit-payment-btn {
        background: var(--accent-color);
        color: white;
        border: none;
        padding: 16px;
        border-radius: var(--radius-sm);
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: var(--shadow-button);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
    }

    .submit-payment-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        background: var(--accent-strong);
    }

    .submit-payment-btn.secondary {
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        box-shadow: none;
    }

    .submit-payment-btn.secondary:hover:not(:disabled) {
        background: var(--bg-input);
        border-color: var(--text-primary);
    }

    .submit-payment-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .loading-state, .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 16px;
        color: var(--text-secondary);
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border-color);
        border-top-color: var(--accent-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .details-modal {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding-bottom: 24px;
    }

    .avatar.large {
        width: 56px;
        height: 56px;
        font-size: 22px;
        border-radius: var(--radius-md);
    }

    .details-tabs {
        display: flex;
        flex-direction: column;
        gap: 32px;
    }

    .details-tabs h4 {
        margin: 0 0 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
    }

    .scroll-list {
        max-height: 250px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-right: 4px;
    }

    .history-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg-card);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
    }

    .payment-item {
        border-left: 4px solid var(--success-color);
    }

    .item-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .item-date {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-primary);
    }

    .item-type {
        font-size: 11px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .work-location-link,
    .work-location-muted {
        color: var(--text-secondary);
        font-size: 12px;
        margin-top: 4px;
    }

    .work-location-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        text-decoration: none;
    }

    .work-location-link:hover {
        color: var(--text-primary);
    }

    .work-location-link span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .item-values {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
    }

    .item-extra {
        background: var(--bg-warning-subtle);
        color: var(--warning-color);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
    }

    .item-price {
        font-weight: 700;
        color: var(--success-color);
    }

    .empty-msg {
        text-align: center;
        color: var(--text-secondary);
        font-size: 14px;
        padding: 16px;
    }

    @media (max-width: 420px) {
        .payment-actions {
            grid-template-columns: 1fr;
        }
    }

    :global(.dark) .history-item {
        background: var(--bg-input);
    }

    @media (max-width: 760px) {
        .payments-container {
            padding: 18px 14px var(--bottom-nav-clearance);
            padding-top: var(--page-top-safe);
        }

        header {
            margin-bottom: 16px;
        }



        .content {
            gap: 14px;
            padding-bottom: 0;
        }

        .filters-card {
            padding: 14px;
            border-radius: var(--radius-md);
            align-items: stretch;
        }

        .filter-group {
            width: 100%;
            justify-content: space-between;
            gap: 8px;
        }

        .filter-group select {
            min-width: 0;
            flex: 1;
            padding: 9px 10px;
            font-size: 14px;
        }

        .additional-info,
        .summary-stats,
        .export-actions,
        .stat {
            width: 100%;
            align-items: flex-start;
        }

        .info-toggle {
            width: 100%;
            justify-content: space-between;
        }

        .export-actions {
            display: grid;
            grid-template-columns: 1fr;
        }

        .stat-value {
            font-size: 20px;
        }

        .table-container {
            display: none;
        }

        .mobile-members-list {
            display: grid;
            gap: 12px;
        }

        .mobile-member-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-card);
            padding: 14px;
            min-width: 0;
        }

        .mobile-member-summary {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 10px;
        }

        .mobile-member-text {
            min-width: 0;
        }

        .mobile-member-text h3 {
            margin: 0;
            color: var(--text-primary);
            font-size: 15px;
            font-weight: 800;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .mobile-member-text span {
            display: block;
            margin-top: 2px;
            color: var(--text-secondary);
            font-size: 12px;
            font-weight: 700;
        }

        .mobile-balance {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            min-width: 92px;
        }

        .balance-label {
            color: var(--text-secondary);
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .mobile-balance strong {
            color: var(--danger-color);
            font-size: 15px;
            font-weight: 900;
            white-space: nowrap;
        }

        .mobile-balance strong.positive {
            color: var(--success-color);
        }

        .mobile-status-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-top: 12px;
        }

        .mobile-details-panel {
            border-top: 1px solid var(--border-color);
            margin-top: 12px;
            padding-top: 12px;
            display: grid;
            gap: 12px;
        }

        .mobile-metrics {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .mobile-metrics div {
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-sm);
            padding: 10px;
            min-width: 0;
        }

        .mobile-metrics span {
            display: block;
            color: var(--text-secondary);
            font-size: 11px;
            font-weight: 800;
            margin-bottom: 4px;
        }

        .mobile-metrics strong {
            display: block;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 900;
            overflow-wrap: anywhere;
        }

        .mobile-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .mobile-actions .details-btn,
        .mobile-actions .pay-btn {
            flex: 1;
            min-width: 118px;
        }

        .mobile-empty {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
        }

        .badge {
            padding: 6px 10px;
            font-size: 12px;
        }
    }
</style>

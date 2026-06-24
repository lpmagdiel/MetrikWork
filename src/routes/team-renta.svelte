<script>
  import {
    AlertCircle,
    BadgeEuro,
    CheckCircle2,
    FileText,
    Landmark,
    Printer,
    ShieldCheck,
    Users,
  } from "lucide-svelte";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import Toast from "../components/Toast.svelte";
  import { getTeamPaymentsData } from "../data/teamPayments.js";
  import { selectedTeam, selectedTeamId, userStore } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { downloadExcelReport, openPrintableReport } from "../helpers/reportExport.js";

  const TAX_YEAR = 2025;
  const EURO = "EUR";
  const autonomousCommunities = [
    "Andalucía", "Aragón", "Principado de Asturias", "Illes Balears", "Canarias",
    "Cantabria", "Castilla-La Mancha", "Castilla y León", "Cataluña",
    "Extremadura", "Galicia", "Comunidad de Madrid", "Región de Murcia",
    "Comunidad Foral de Navarra", "País Vasco", "La Rioja", "Comunitat Valenciana",
    "Ceuta", "Melilla",
  ];

  // Escala estatal de 2025. Para esta guía se duplica exclusivamente como referencia
  // cuando no se dispone de la escala autonómica y de las deducciones aplicables.
  const stateScale2025 = [
    { limit: 12450, rate: 0.095 },
    { limit: 20200, rate: 0.12 },
    { limit: 35200, rate: 0.15 },
    { limit: 60000, rate: 0.185 },
    { limit: 300000, rate: 0.225 },
    { limit: Infinity, rate: 0.245 },
  ];

  let team = $derived($selectedTeam);
  let isAdmin = $derived(team?.admin === $userStore?.uid);
  let teamCurrency = $derived(team?.projectBudgetCurrency || "MXN");
  let memberBalances = $state([]);
  let isLoading = $state(false);
  let selectedMemberId = $state("");
  let dataRequestId = 0;
  let prefilledGrossKey = "";
  let messageToast = $state("");
  let typeToast = $state("success");
  let showToast = $state(false);
  let form = $state(createInitialForm());

  let selectedMember = $derived(
    memberBalances.find((member) => member.id === selectedMemberId) || null,
  );

  let teamRecordsForYear = $derived.by(() =>
    (selectedMember?.works || []).filter((work) => getDateKey(work.date || work.startedAt || work.createdAt).startsWith(`${TAX_YEAR}-`)),
  );

  let teamPaymentsForYear = $derived.by(() =>
    (selectedMember?.payments || []).filter((payment) =>
      getDateKey(payment.date || payment.createdAt).startsWith(`${TAX_YEAR}-`),
    ),
  );

  let teamGrossEstimate = $derived(
    teamRecordsForYear.reduce((sum, work) => sum + (Number(work.workAmount) || 0), 0),
  );

  let teamPaidAmount = $derived(
    teamPaymentsForYear.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
  );

  let personalMinimum = $derived.by(() => getPersonalMinimum(form));
  let estimate = $derived.by(() => calculateEstimate(form, personalMinimum));
  let missingData = $derived.by(() => getMissingData(form, selectedMember));
  let reviewReasons = $derived.by(() => getReviewReasons(form));
  let canShowDirection = $derived(
    missingData.length === 0 && reviewReasons.length === 0,
  );

  $effect(() => {
    if (team?.id && isAdmin) {
      loadRentaData(team.id);
    } else {
      memberBalances = [];
      selectedMemberId = "";
    }
  });

  $effect(() => {
    const key = `${selectedMemberId}:${TAX_YEAR}:${teamCurrency}:${teamGrossEstimate}`;
    if (!selectedMemberId || key === prefilledGrossKey) return;

    if (teamCurrency === EURO) {
      form.grossEmploymentIncome = teamGrossEstimate.toFixed(2);
    } else {
      form.grossEmploymentIncome = "";
    }
    prefilledGrossKey = key;
  });

  async function loadRentaData(teamId) {
    const requestId = ++dataRequestId;
    isLoading = true;
    try {
      const balances = await getTeamPaymentsData(teamId);
      if (requestId !== dataRequestId) return;
      memberBalances = balances;
      if (!balances.some((member) => member.id === selectedMemberId)) {
        selectedMemberId = balances[0]?.id || "";
      }
    } catch (error) {
      if (requestId !== dataRequestId) return;
      console.error("Error loading renta preparation data:", error);
      showNotification("No se pudieron cargar los datos del equipo.", "error");
    } finally {
      if (requestId === dataRequestId) isLoading = false;
    }
  }

  function createInitialForm() {
    return {
      autonomousCommunity: "",
      certificateConfirmed: false,
      grossEmploymentIncome: "",
      taxableBenefitsInKind: "0",
      exemptAllowances: "0",
      employeeSocialSecurity: "",
      unionFees: "0",
      mandatoryProfessionalFees: "0",
      legalDefenseExpenses: "0",
      pensionReductions: "0",
      irpfWithheld: "",
      otherPayerGrossIncome: "0",
      otherPayerWithheld: "0",
      birthYear: "",
      childrenEligible: "0",
      childrenUnderThree: "0",
      childMinimumShare: "100",
      ascendantsEligible: "0",
      ascendantsOverSeventyFive: "0",
      disability: "none",
      needsAssistance: false,
      jointReturn: false,
      hasOtherIncome: false,
      otherIncomeNotes: "",
      hasRegionalDeductions: false,
      regionalDeductionNotes: "",
      managerNotes: "",
    };
  }

  function numberValue(value) {
    return Math.max(0, Number(value) || 0);
  }

  function isProvided(value) {
    return String(value ?? "").trim() !== "";
  }

  function getDateKey(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function getPersonalMinimum(values) {
    const age = TAX_YEAR - Number(values.birthYear || TAX_YEAR);
    let minimum = 5550;

    if (age >= 65) minimum += 1150;
    if (age >= 75) minimum += 1400;

    const children = Math.max(0, Math.floor(numberValue(values.childrenEligible)));
    const childAmounts = [2400, 2700, 4000];
    let childrenMinimum = 0;
    for (let index = 0; index < children; index += 1) {
      childrenMinimum += childAmounts[index] || 4500;
    }
    childrenMinimum += Math.min(children, Math.floor(numberValue(values.childrenUnderThree))) * 2800;
    minimum += childrenMinimum * (numberValue(values.childMinimumShare) / 100 || 1);

    const ascendants = Math.max(0, Math.floor(numberValue(values.ascendantsEligible)));
    const ascendantsOverSeventyFive = Math.min(
      ascendants,
      Math.floor(numberValue(values.ascendantsOverSeventyFive)),
    );
    minimum += ascendants * 1150 + ascendantsOverSeventyFive * 1400;

    if (values.disability === "33-64") minimum += 3000;
    if (values.disability === "65+") minimum += 9000;
    if (values.needsAssistance) minimum += 3000;

    return minimum;
  }

  function applyStateScale(base) {
    let remaining = Math.max(0, Number(base) || 0);
    let previousLimit = 0;
    let tax = 0;

    for (const bracket of stateScale2025) {
      const bracketAmount = Math.min(remaining, bracket.limit - previousLimit);
      if (bracketAmount > 0) tax += bracketAmount * bracket.rate;
      remaining -= bracketAmount;
      previousLimit = bracket.limit;
      if (remaining <= 0) break;
    }
    return tax;
  }

  function calculateEstimate(values, minimum) {
    const grossIncome =
      numberValue(values.grossEmploymentIncome) +
      numberValue(values.otherPayerGrossIncome) +
      numberValue(values.taxableBenefitsInKind) -
      numberValue(values.exemptAllowances);
    const deductibleExpenses =
      numberValue(values.employeeSocialSecurity) +
      numberValue(values.unionFees) +
      numberValue(values.mandatoryProfessionalFees) +
      numberValue(values.legalDefenseExpenses) +
      2000;
    const netEmploymentIncome = Math.max(0, grossIncome - deductibleExpenses);
    const taxableBase = Math.max(0, netEmploymentIncome - numberValue(values.pensionReductions));
    const referenceTax = Math.max(0, (applyStateScale(taxableBase) - applyStateScale(minimum)) * 2);
    const totalWithheld = numberValue(values.irpfWithheld) + numberValue(values.otherPayerWithheld);

    return {
      grossIncome,
      deductibleExpenses,
      netEmploymentIncome,
      taxableBase,
      referenceTax,
      totalWithheld,
      balance: totalWithheld - referenceTax,
    };
  }

  function getMissingData(values, member) {
    const missing = [];
    if (!member?.id) missing.push("Seleccionar miembro");
    if (!values.autonomousCommunity) missing.push("Comunidad autónoma de residencia fiscal");
    if (!values.certificateConfirmed) missing.push("Confirmación del certificado anual de retenciones");
    if (!isProvided(values.grossEmploymentIncome)) missing.push("Retribuciones dinerarias brutas");
    if (!isProvided(values.employeeSocialSecurity)) missing.push("Cotización del trabajador a la Seguridad Social");
    if (!isProvided(values.irpfWithheld)) missing.push("Retenciones de IRPF practicadas");
    if (!isProvided(values.birthYear)) missing.push("Año de nacimiento");
    return missing;
  }

  function getReviewReasons(values) {
    const reasons = [];
    if (values.jointReturn) reasons.push("La declaración conjunta requiere incorporar los datos completos del cónyuge.");
    if (values.hasOtherIncome) reasons.push("Hay otras rentas que deben integrarse en el cálculo completo.");
    if (values.hasRegionalDeductions) reasons.push("Hay deducciones que pueden modificar la cuota autonómica.");
    if (["Comunidad Foral de Navarra", "País Vasco", "Ceuta", "Melilla"].includes(values.autonomousCommunity)) {
      reasons.push("El territorio fiscal seleccionado tiene reglas específicas que esta referencia no calcula.");
    }
    return reasons;
  }

  function formatEuro(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: EURO,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function formatTeamMoney(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: teamCurrency,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }

  function formatNumber(value, digits = 0) {
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: digits,
    }).format(Number(value) || 0);
  }

  function formatMemberName(member) {
    return member?.name || member?.email || "Miembro";
  }

  function showNotification(message, type = "success") {
    messageToast = message;
    typeToast = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 3500);
  }

  function goToTeamHome() {
    const teamId = team?.id || $selectedTeamId;
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  function createRentaReport() {
    const memberName = formatMemberName(selectedMember);
    const resultLabel = !canShowDirection
      ? "No concluyente: faltan datos o existen circunstancias que requieren cálculo completo."
      : estimate.balance >= 0
        ? `Posible devolución orientativa: ${formatEuro(estimate.balance)}`
        : `Posible ingreso orientativo: ${formatEuro(Math.abs(estimate.balance))}`;

    return {
      title: `Preparación de Renta ${TAX_YEAR}`,
      subtitle: "Guía interna para gestoría. No constituye declaración ni cálculo oficial.",
      meta: [
        { label: "Equipo", value: team?.name || team?.team || "Equipo" },
        { label: "Miembro", value: memberName },
        { label: "Residencia fiscal", value: form.autonomousCommunity || "Pendiente" },
        { label: "Ejercicio", value: TAX_YEAR },
        { label: "Resultado orientativo", value: resultLabel },
        { label: "Uso de datos", value: "Preparación para gestoría" },
      ],
      sections: [
        {
          title: "Datos disponibles en MetricWork",
          headers: ["Concepto", "Importe", "Observación"],
          rows: [
            ["Registros de trabajo del ejercicio", formatTeamMoney(teamGrossEstimate), `${teamRecordsForYear.length} registros; no sustituye al certificado salarial.`],
            ["Pagos registrados por el equipo", formatTeamMoney(teamPaidAmount), `${teamPaymentsForYear.length} pagos; no equivale a retenciones de IRPF.`],
          ],
        },
        {
          title: "Certificado anual de retenciones y datos de trabajo",
          headers: ["Dato para la gestoría", "Importe / valor"],
          rows: [
            ["Retribuciones dinerarias brutas", formatEuro(form.grossEmploymentIncome)],
            ["Retribución en especie sujeta", formatEuro(form.taxableBenefitsInKind)],
            ["Dietas o importes exentos", formatEuro(form.exemptAllowances)],
            ["Seguridad Social a cargo del trabajador", formatEuro(form.employeeSocialSecurity)],
            ["Cuotas sindicales", formatEuro(form.unionFees)],
            ["Cuotas colegiales obligatorias", formatEuro(form.mandatoryProfessionalFees)],
            ["Gastos de defensa jurídica", formatEuro(form.legalDefenseExpenses)],
            ["Aportaciones/reducciones confirmadas", formatEuro(form.pensionReductions)],
            ["Retenciones de IRPF", formatEuro(form.irpfWithheld)],
            ["Otros pagadores: bruto / retenciones", `${formatEuro(form.otherPayerGrossIncome)} / ${formatEuro(form.otherPayerWithheld)}`],
          ],
        },
        {
          title: "Circunstancias personales comunicadas",
          headers: ["Dato", "Valor"],
          rows: [
            ["Año de nacimiento", form.birthYear || "Pendiente"],
            ["Descendientes con derecho a mínimo", formatNumber(form.childrenEligible)],
            ["Descendientes menores de 3 años", formatNumber(form.childrenUnderThree)],
            ["Porcentaje de mínimo por descendientes", `${formatNumber(form.childMinimumShare)}%`],
            ["Ascendientes con derecho a mínimo", formatNumber(form.ascendantsEligible)],
            ["Ascendientes mayores de 75", formatNumber(form.ascendantsOverSeventyFive)],
            ["Discapacidad", disabilityLabel(form.disability)],
            ["Declaración conjunta", form.jointReturn ? "Sí" : "No"],
            ["Otras rentas", form.hasOtherIncome ? form.otherIncomeNotes || "Sí, pendiente de detallar" : "No declaradas"],
            ["Deducciones autonómicas", form.hasRegionalDeductions ? form.regionalDeductionNotes || "Sí, pendiente de detallar" : "No declaradas"],
          ],
        },
        {
          title: "Referencia orientativa de retenciones",
          headers: ["Concepto", "Importe"],
          rows: [
            ["Base general de referencia", formatEuro(estimate.taxableBase)],
            ["Mínimo personal/familiar usado", formatEuro(personalMinimum)],
            ["Cuota de referencia sin ajustes autonómicos", formatEuro(estimate.referenceTax)],
            ["Retenciones comunicadas", formatEuro(estimate.totalWithheld)],
            ["Saldo", canShowDirection ? resultLabel : "No se muestra dirección por datos incompletos o supuestos especiales."],
          ],
        },
        {
          title: "Pendiente para cerrar con gestoría",
          headers: ["Dato pendiente"],
          rows: [...missingData, ...reviewReasons].length
            ? [...missingData, ...reviewReasons].map((item) => [item])
            : [["Validar con gestoría las escalas autonómicas, deducciones y el certificado anual antes de presentar."]],
        },
        ...(form.managerNotes.trim()
          ? [{ title: "Notas del administrador", headers: ["Notas"], rows: [[form.managerNotes.trim()]] }]
          : []),
      ],
    };
  }

  function disabilityLabel(value) {
    if (value === "33-64") return "Del 33% al 64%";
    if (value === "65+") return "65% o superior";
    return "No comunicada";
  }

  function printReport() {
    const opened = openPrintableReport(createRentaReport());
    if (!opened) showNotification("El navegador bloqueó la ventana del informe.", "error");
  }

  function exportReport() {
    const teamName = team?.name || team?.team || "equipo";
    const memberName = formatMemberName(selectedMember);
    downloadExcelReport(createRentaReport(), `renta-${TAX_YEAR}-${teamName}-${memberName}`);
  }
</script>

<div class="renta-page">
  <Toast message={messageToast} type={typeToast} show={showToast} />

  {#if team}
    <TitleHeader
      title="Preparar Renta"
      description={`Guía IRPF España · ${TAX_YEAR}`}
      action={goToTeamHome}
      paddingHorizontal={true}
    />

    {#if !isAdmin}
      <section class="access-state">
        <ShieldCheck size={42} />
        <h2>Solo para la administración del equipo</h2>
        <p>Esta guía maneja datos fiscales de carácter sensible y solo puede abrirla el administrador.</p>
      </section>
    {:else}
      <main class="renta-content">
        <section class="notice-card">
          <AlertCircle size={22} />
          <div>
            <h2>Guía para gestoría, no declaración oficial</h2>
            <p>Los datos introducidos aquí no se guardan. La posible devolución o ingreso es una referencia y debe validarse con Renta Web o una asesoría.</p>
          </div>
        </section>

        {#if isLoading}
          <div class="loading-state">
            <LoadingSpinner show={true} />
            <p>Preparando datos del equipo...</p>
          </div>
        {:else}
          <section class="panel setup-panel">
            <div class="panel-heading">
              <div>
                <p>1. Base del expediente</p>
                <h2>Persona y residencia fiscal</h2>
              </div>
              <Users size={20} />
            </div>
            <div class="fields two-columns">
              <label>
                <span>Miembro del equipo</span>
                <select bind:value={selectedMemberId}>
                  {#if memberBalances.length === 0}
                    <option value="">No hay miembros con datos</option>
                  {/if}
                  {#each memberBalances as member (member.id)}
                    <option value={member.id}>{formatMemberName(member)}</option>
                  {/each}
                </select>
              </label>
              <label>
                <span>Comunidad autónoma de residencia fiscal</span>
                <select bind:value={form.autonomousCommunity}>
                  <option value="">Selecciona una comunidad</option>
                  {#each autonomousCommunities as community}
                    <option value={community}>{community}</option>
                  {/each}
                </select>
              </label>
            </div>
          </section>

          <section class="team-data-card">
            <div>
              <p>Datos detectados en MetricWork</p>
              <h2>{formatMemberName(selectedMember)} · ejercicio {TAX_YEAR}</h2>
            </div>
            <div class="team-data-grid">
              <div>
                <span>Trabajo estimado</span>
                <strong>{formatTeamMoney(teamGrossEstimate)}</strong>
                <small>{teamRecordsForYear.length} registros</small>
              </div>
              <div>
                <span>Pagos registrados</span>
                <strong>{formatTeamMoney(teamPaidAmount)}</strong>
                <small>{teamPaymentsForYear.length} pagos</small>
              </div>
            </div>
            {#if teamCurrency !== EURO}
              <p class="currency-warning">El equipo usa {teamCurrency}. Para IRPF introduce siempre los importes del certificado anual en euros; no se ha usado el cálculo del equipo como prellenado.</p>
            {:else}
              <p class="helper-text">El trabajo estimado se ha usado como prellenado. Confírmalo o sustitúyelo por el certificado anual de retenciones.</p>
            {/if}
          </section>

          <section class="panel">
            <div class="panel-heading">
              <div>
                <p>2. Certificado anual</p>
                <h2>Rendimientos y retenciones</h2>
              </div>
              <Landmark size={20} />
            </div>
            <label class="confirmation">
              <input type="checkbox" bind:checked={form.certificateConfirmed} />
              <span>Dispongo del certificado anual de retenciones o de las nóminas completas y confirmo los importes.</span>
            </label>
            <div class="fields three-columns">
              <label>
                <span>Retribuciones dinerarias brutas (€)</span>
                <input type="number" min="0" step="0.01" bind:value={form.grossEmploymentIncome} />
              </label>
              <label>
                <span>Retribución en especie sujeta (€)</span>
                <input type="number" min="0" step="0.01" bind:value={form.taxableBenefitsInKind} />
              </label>
              <label>
                <span>Dietas e importes exentos (€)</span>
                <input type="number" min="0" step="0.01" bind:value={form.exemptAllowances} />
              </label>
              <label>
                <span>Seguridad Social trabajador (€)</span>
                <input type="number" min="0" step="0.01" bind:value={form.employeeSocialSecurity} />
              </label>
              <label>
                <span>Retenciones IRPF (€)</span>
                <input type="number" min="0" step="0.01" bind:value={form.irpfWithheld} />
              </label>
              <label>
                <span>Reducciones confirmadas (p. ej. previsión social) (€)</span>
                <input type="number" min="0" step="0.01" bind:value={form.pensionReductions} />
              </label>
            </div>
            <details class="optional-details">
              <summary>Otros gastos deducibles o pagadores</summary>
              <div class="fields three-columns">
                <label>
                  <span>Cuotas sindicales (€)</span>
                  <input type="number" min="0" step="0.01" bind:value={form.unionFees} />
                </label>
                <label>
                  <span>Colegio profesional obligatorio (€)</span>
                  <input type="number" min="0" step="0.01" bind:value={form.mandatoryProfessionalFees} />
                </label>
                <label>
                  <span>Defensa jurídica laboral (€)</span>
                  <input type="number" min="0" step="0.01" bind:value={form.legalDefenseExpenses} />
                </label>
                <label>
                  <span>Otros pagadores: bruto (€)</span>
                  <input type="number" min="0" step="0.01" bind:value={form.otherPayerGrossIncome} />
                </label>
                <label>
                  <span>Otros pagadores: retenciones (€)</span>
                  <input type="number" min="0" step="0.01" bind:value={form.otherPayerWithheld} />
                </label>
              </div>
            </details>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <div>
                <p>3. Situación personal</p>
                <h2>Mínimos personales y familiares</h2>
              </div>
              <BadgeEuro size={20} />
            </div>
            <div class="fields three-columns">
              <label>
                <span>Año de nacimiento</span>
                <input type="number" min="1900" max={TAX_YEAR} step="1" bind:value={form.birthYear} />
              </label>
              <label>
                <span>Descendientes con derecho a mínimo</span>
                <input type="number" min="0" step="1" bind:value={form.childrenEligible} />
              </label>
              <label>
                <span>De ellos, menores de 3 años</span>
                <input type="number" min="0" step="1" bind:value={form.childrenUnderThree} />
              </label>
              <label>
                <span>Porcentaje de mínimo por descendientes</span>
                <select bind:value={form.childMinimumShare}>
                  <option value="100">100%</option>
                  <option value="50">50%</option>
                </select>
              </label>
              <label>
                <span>Ascendientes con derecho a mínimo</span>
                <input type="number" min="0" step="1" bind:value={form.ascendantsEligible} />
              </label>
              <label>
                <span>De ellos, mayores de 75 años</span>
                <input type="number" min="0" step="1" bind:value={form.ascendantsOverSeventyFive} />
              </label>
              <label>
                <span>Discapacidad reconocida</span>
                <select bind:value={form.disability}>
                  <option value="none">No comunicada</option>
                  <option value="33-64">Del 33% al 64%</option>
                  <option value="65+">65% o superior</option>
                </select>
              </label>
              <label class="checkbox-field">
                <input type="checkbox" bind:checked={form.needsAssistance} />
                <span>Necesita ayuda de terceras personas o movilidad reducida</span>
              </label>
              <label class="checkbox-field">
                <input type="checkbox" bind:checked={form.jointReturn} />
                <span>Se prevé declaración conjunta</span>
              </label>
            </div>
          </section>

          <section class="panel special-panel">
            <div class="panel-heading">
              <div>
                <p>4. Casos que cambian el resultado</p>
                <h2>Revisión antes de estimar</h2>
              </div>
              <FileText size={20} />
            </div>
            <label class="confirmation">
              <input type="checkbox" bind:checked={form.hasOtherIncome} />
              <span>Existen otras rentas, inmuebles, inversiones, actividad económica, ganancias/pérdidas o rentas del extranjero.</span>
            </label>
            {#if form.hasOtherIncome}
              <label>
                <span>Descripción e importes para la gestoría</span>
                <textarea bind:value={form.otherIncomeNotes} placeholder="Ej.: alquiler, intereses, venta de acciones, segunda actividad…"></textarea>
              </label>
            {/if}
            <label class="confirmation">
              <input type="checkbox" bind:checked={form.hasRegionalDeductions} />
              <span>Puede tener deducciones autonómicas o estatales (alquiler, vivienda, donativos, maternidad, familia numerosa, etc.).</span>
            </label>
            {#if form.hasRegionalDeductions}
              <label>
                <span>Descripción e importes para la gestoría</span>
                <textarea bind:value={form.regionalDeductionNotes} placeholder="Indica el tipo de deducción y el importe acreditable."></textarea>
              </label>
            {/if}
            <label>
              <span>Notas internas del administrador (opcional)</span>
              <textarea bind:value={form.managerNotes} placeholder="Documentos recibidos, observaciones o cuestiones para la gestoría."></textarea>
            </label>
          </section>

          <section class="result-card" class:incomplete={!canShowDirection}>
            <div class="result-heading">
              <div>
                <p>Referencia orientativa</p>
                <h2>{canShowDirection ? "Posible saldo de la declaración" : "El expediente necesita revisión completa"}</h2>
              </div>
              {#if canShowDirection}
                <CheckCircle2 size={28} />
              {:else}
                <AlertCircle size={28} />
              {/if}
            </div>

            {#if canShowDirection}
              <strong class:refund={estimate.balance >= 0} class:payment={estimate.balance < 0}>
                {estimate.balance >= 0
                  ? `Posible devolución: ${formatEuro(estimate.balance)}`
                  : `Posible ingreso: ${formatEuro(Math.abs(estimate.balance))}`}
              </strong>
              <p>Referencia con escala estatal 2025 duplicada y mínimos estándar. La comunidad autónoma y cualquier deducción pueden cambiar el resultado.</p>
            {:else}
              <p>No mostramos una dirección de devolución/ingreso porque faltan datos o hay rentas, deducciones autonómicas o declaración conjunta. El informe final reúne lo necesario para gestoría.</p>
              {#if missingData.length}
                <ul>
                  {#each missingData as item}
                    <li>{item}</li>
                  {/each}
                  {#each reviewReasons as item}
                    <li>{item}</li>
                  {/each}
                </ul>
              {:else if reviewReasons.length}
                <ul>
                  {#each reviewReasons as item}
                    <li>{item}</li>
                  {/each}
                </ul>
              {/if}
            {/if}

            <div class="result-metrics">
              <div><span>Base de referencia</span><strong>{formatEuro(estimate.taxableBase)}</strong></div>
              <div><span>Mínimo personal/familiar</span><strong>{formatEuro(personalMinimum)}</strong></div>
              <div><span>Retenciones comunicadas</span><strong>{formatEuro(estimate.totalWithheld)}</strong></div>
            </div>
            <div class="report-actions">
              <button type="button" onclick={printReport}><Printer size={18} /> Imprimir / guardar PDF</button>
              <button type="button" class="secondary" onclick={exportReport}><FileText size={18} /> Exportar para gestoría</button>
            </div>
          </section>
        {/if}
      </main>
    {/if}
  {:else}
    <div class="loading-state full"><LoadingSpinner show={true} /><p>Cargando equipo...</p></div>
  {/if}
</div>

<style>
  .renta-page { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; background: var(--bg-page); padding-top: var(--page-top-safe); }
  .renta-content { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 20px var(--bottom-nav-clearance); display: grid; align-content: start; gap: 16px; -webkit-overflow-scrolling: touch; }
  .panel, .team-data-card, .result-card, .notice-card { min-width: 0; border-radius: var(--radius-md); background: var(--bg-card); box-shadow: var(--shadow-card); }
  .panel, .team-data-card, .result-card { padding: 16px; }
  .notice-card { display: flex; gap: 12px; align-items: flex-start; padding: 15px 16px; color: var(--warning-color); background: var(--bg-warning-subtle); box-shadow: none; }
  .notice-card h2, .panel-heading h2, .team-data-card h2, .result-heading h2 { margin: 0; font-size: 18px; color: var(--text-primary); }
  .notice-card p, .helper-text, .currency-warning, .result-card p { margin: 5px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.45; }
  .panel-heading, .result-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; color: var(--text-secondary); }
  .panel-heading p, .team-data-card > div:first-child > p, .result-heading p { margin: 0 0 3px; color: var(--text-secondary); font-size: 12px; font-weight: 800; }
  .fields { display: grid; gap: 12px; }
  .two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .three-columns { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  label { display: grid; gap: 7px; min-width: 0; }
  label > span { color: var(--text-secondary); font-size: 12px; font-weight: 800; }
  input, select, textarea { width: 100%; min-width: 0; border: 1px solid var(--border-color); border-radius: 11px; background: var(--bg-input); color: var(--text-primary); padding: 11px; font: inherit; }
  textarea { min-height: 74px; resize: vertical; }
  .confirmation, .checkbox-field { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 13px; color: var(--text-primary); font-size: 13px; line-height: 1.35; }
  .confirmation input, .checkbox-field input { width: 18px; height: 18px; margin: 0; flex: 0 0 auto; accent-color: var(--info-color); }
  .checkbox-field { margin: 0; padding: 11px; border: 1px solid var(--border-color); border-radius: 11px; background: var(--bg-input); }
  .checkbox-field span { color: var(--text-primary); font-size: 13px; font-weight: 600; }
  .optional-details { margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 14px; }
  .optional-details summary { cursor: pointer; color: var(--text-primary); font-size: 13px; font-weight: 800; margin-bottom: 12px; }
  .team-data-card { display: grid; gap: 14px; border: 1px solid color-mix(in srgb, var(--info-color) 26%, var(--border-color)); }
  .team-data-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .team-data-grid > div, .result-metrics > div { display: grid; gap: 4px; padding: 12px; border-radius: 12px; background: var(--bg-input); }
  .team-data-grid span, .team-data-grid small, .result-metrics span { color: var(--text-secondary); font-size: 12px; }
  .team-data-grid strong, .result-metrics strong { font-size: 18px; color: var(--text-primary); overflow-wrap: anywhere; }
  .currency-warning { color: var(--warning-color); font-weight: 700; }
  .special-panel { display: grid; gap: 13px; }
  .special-panel .panel-heading { margin-bottom: 0; }
  .result-card { background: var(--text-primary); color: var(--bg-card); }
  .result-card .result-heading h2, .result-card .result-heading p { color: inherit; }
  .result-card .result-heading p, .result-card > p { opacity: .76; }
  .result-card > strong { display: block; margin: 5px 0; font-size: clamp(24px, 5vw, 34px); line-height: 1.1; }
  .result-card > strong.refund { color: var(--success-color); }
  .result-card > strong.payment { color: var(--warning-color); }
  .result-card ul { margin: 12px 0 0; padding-left: 19px; color: inherit; font-size: 13px; line-height: 1.55; }
  .result-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
  .result-metrics > div { background: color-mix(in srgb, var(--bg-card) 12%, transparent); }
  .result-metrics strong, .result-metrics span { color: inherit; }
  .result-metrics span { opacity: .72; }
  .report-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .report-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 11px; padding: 12px 14px; background: var(--accent-color); color: var(--text-primary); font-weight: 800; cursor: pointer; }
  .report-actions button.secondary { background: color-mix(in srgb, var(--bg-card) 16%, transparent); color: var(--bg-card); }
  .access-state, .loading-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 28px; color: var(--text-secondary); text-align: center; }
  .access-state h2 { color: var(--text-primary); margin: 0; }
  .access-state p { max-width: 420px; margin: 0; }
  .loading-state.full { height: 100%; }
  @media (max-width: 720px) { .renta-content { padding-inline: 14px; } .three-columns, .two-columns, .result-metrics { grid-template-columns: 1fr; } }
</style>

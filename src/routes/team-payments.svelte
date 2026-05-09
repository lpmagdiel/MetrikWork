<script>
    import { ChevronLeft, DollarSign, Filter, Search, CheckCircle, AlertCircle, Eye, History } from "lucide-svelte";
    import { selectedTeam, userStore, hasTeamPermission } from "../data/stores.js";
    import { getTeamPaymentsData, registerTeamPayment } from "../data/teamPayments.js";
    import { createNotification } from "../data/notifications.js";
    import { navigateTo } from "../router.js";
    import Toast from "../components/Toast.svelte";
    import SliceContainer from "../components/SliceContainer.svelte";

    let team = $derived($selectedTeam);
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
    let paymentType = $state("total"); // 'total' or 'partial'
    let paymentAmount = $state(0);
    let isSaving = $state(false);
    
    // Details Modal
    let showDetailsModal = $state(false);
    let selectedMemberDetails = $state(null);

    let filteredMembers = $derived.by(() => {
        if (filterStatus === 'paid') return memberBalances.filter(m => m.balance <= 0.01);
        if (filterStatus === 'unpaid') return memberBalances.filter(m => m.balance > 0.01);
        return memberBalances;
    });

    async function loadData() {
        if (!team?.id || !canViewPayments) return;
        isLoading = true;
        try {
            memberBalances = await getTeamPaymentsData(team.id);
            console.log("Datos de pagos y jornadas recuperados de Firebase:",  memberBalances);
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

    function showNotification(msg, type = "success") {
        messageToast = msg;
        typeToast = type;
        showToast = true;
        setTimeout(() => showToast = false, 3000);
    }

    function openPaymentModal(member) {
        selectedMember = member;
        paymentType = "total";
        paymentAmount = member.balance;
        showPaymentModal = true;
    }

    $effect(() => {
        if (paymentType === 'total' && selectedMember) {
            paymentAmount = selectedMember.balance;
        }
    });

    async function handlePayment() {
        if (!team?.id || !selectedMember || !canCreatePayments) return;
        if (paymentAmount <= 0) {
            showNotification("El monto debe ser mayor a 0", "error");
            return;
        }
        
        isSaving = true;
        try {
            await registerTeamPayment(team.id, selectedMember.id, paymentAmount, paymentType);
            
            // Notificar al usuario
            const title = "Pago Recibido";
            const message = `Has recibido un pago de ${formatMoney(paymentAmount)} del equipo "${team.name}"`;
            await createNotification(selectedMember.id, title, message);
            
            showNotification("Pago registrado exitosamente");
            showPaymentModal = false;
            await loadData();
        } catch (e) {
            showNotification("Error al registrar pago", "error");
        } finally {
            isSaving = false;
        }
    }

    function openDetailsModal(member) {
        selectedMemberDetails = member;
        showDetailsModal = true;
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(amount);
    }
</script>

<div class="payments-container">
    <Toast message={messageToast} type={typeToast} show={showToast} />
    
    <header>
        <button class="back-btn" onclick={() => navigateTo(`/teams/${team?.id}`)}>
            <ChevronLeft size={24} />
        </button>
        <div class="header-text">
            <h1>Pagos del Equipo</h1>
            {#if team}
                <p class="subtitle">{team.name}</p>
            {/if}
        </div>
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
                
                <div class="summary-stats">
                    <div class="stat">
                        <span class="stat-label">Total a Pagar</span>
                        <span class="stat-value danger">{formatMoney(memberBalances.reduce((acc, m) => acc + (m.balance > 0 ? m.balance : 0), 0))}</span>
                    </div>
                </div>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Integrante</th>
                            <th>Días Trabajados</th>
                            <th>Horas Extras</th>
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
                                <td>{member.totalWorkDays}</td>
                                <td>{member.totalOvertimeHours}h</td>
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

                <button 
                    class="submit-payment-btn" 
                    onclick={handlePayment} 
                    disabled={isSaving || paymentAmount <= 0 || paymentAmount > (selectedMember?.balance || 0)}
                >
                    {#if isSaving}
                        Procesando...
                    {:else}
                        Registrar Pago de {formatMoney(paymentAmount)}
                    {/if}
                </button>
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
                        <h4><History size={16} /> Jornadas y Horas Extras</h4>
                        <div class="scroll-list">
                            {#each selectedMemberDetails?.works || [] as work}
                                <div class="history-item">
                                    <div class="item-info">
                                        <span class="item-date">{work.date}</span>
                                        <span class="item-type">
                                            {work.type === 'full-day' ? 'Día Completo' : work.type === 'half-day' ? 'Medio Día' : 'Horas Extra'}
                                        </span>
                                    </div>
                                    <div class="item-values">
                                        {#if work.overtimeHours > 0}
                                            <span class="item-extra">+{work.overtimeHours}h extras</span>
                                        {/if}
                                    </div>
                                </div>
                            {:else}
                                <p class="empty-msg">No hay registros de trabajo.</p>
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

    .back-btn {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-card);
        cursor: pointer;
        color: var(--text-primary);
        transition: all 0.2s ease;
    }
    
    .back-btn:hover {
        transform: translateY(-2px);
        border-color: var(--accent-color);
    }

    .header-text h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
    }

    .subtitle {
        margin: 4px 0 0;
        font-size: 14px;
        color: var(--text-secondary);
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
    }

    .payment-option.active {
        background: var(--bg-card);
        color: var(--text-primary);
        box-shadow: var(--shadow-card);
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .form-group label {
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
        margin-top: 8px;
        box-shadow: var(--shadow-button);
    }

    .submit-payment-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        background: var(--accent-strong);
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

    :global(.dark) .history-item {
        background: var(--bg-input);
    }
</style>

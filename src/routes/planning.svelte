<script>
    import Toast from "../components/Toast.svelte";
    import LoadingSpinner from "../components/LoadingSpinner.svelte";
    import CalendarViewer from "../components/Calendar.svelte";

    // Icons
    import { Calendar, ChevronLeft, Plus } from "lucide-svelte";

    import { currentPath, navigateTo } from "../router.js";
    import { teamTasksStore, selectedTeamId, userStore, selectedTeam } from "../data/stores.js";
    import { derived } from "svelte/store";
    import CircleAddButton from "../components/CircleAddButton.svelte";
    import SliceContainer from "../components/SliceContainer.svelte";

    let messageToast = $state("");
    let typeToast = $state("success");
    let showToast = $state(false);
    let openAddEvent = $state(false);
    let team = $derived($selectedTeam);
    let isAdmin = $derived($userStore?.uid && team?.admin && $userStore.uid === team.admin);
</script>

<style>
    /* Header */
    header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 24px 20px 16px;
        flex-shrink: 0;
    }

    .back-btn {
        background: var(--bg-card);
        border: none;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-card);
        cursor: pointer;
        color: var(--text-primary);
        flex-shrink: 0;
    }

    .header-title {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        color: var(--text-primary);
    }

    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 16px;
        color: var(--text-secondary);
    }
    .planning-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
    }
</style>

<div class="tasks-page">
    <Toast message={messageToast} type={typeToast} show={showToast} />

    {#if team}
        <!-- Header -->
        <header>
            <button
                class="back-btn"
                onclick={() => navigateTo("/teams/" + (team?.id || $selectedTeamId))}
            >
                <ChevronLeft size={24}/>
            </button>
            <div class="header-title">
                <h1>Planning</h1>
            </div>
            {#if isAdmin}
                <CircleAddButton onClick={() => (openAddEvent = true)} />
            {/if}
        </header>

        <div class="planning-content">
            <CalendarViewer />
        </div>
    {:else}
        <div class="loading-container">
            <LoadingSpinner show={true} />
            <p>Cargando información del equipo...</p>
        </div>
    {/if}
    <SliceContainer bind:show={openAddEvent} />
</div>
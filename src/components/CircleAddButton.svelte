<script>
    import { Plus } from "lucide-svelte";

    const { onClick, floating = false } = $props()
</script>


<style>
    .fab {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--accent-strong);
        color: var(--bg-card);
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: var(--shadow-button);
        flex-shrink: 0;
        transition: transform 0.15s;
    }
    .fab:active {
        transform: scale(0.92);
    }
    .floating {
        position: fixed;
        bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 20px);
        right: 20px;
        z-index: 100;
    }
</style>

<button class={"fab " + (floating ? "floating" : "")} onclick={onClick}><Plus size={22} /></button>
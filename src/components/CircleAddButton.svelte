<script>
    import { Plus } from "lucide-svelte";

    const { onClick } = $props()
</script>


<style>
    .fab {
        width: 46px;
        height: 46px;
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
</style>

<button class="fab" onclick={onClick}><Plus size={22} /></button>
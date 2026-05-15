<script>
    const { text } = $props();
</script>

<style>
    .badget-button {
        height: 60px;
        width: max-content;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        border-radius: 30px;
        border: 1px solid var(--border-color);
        background: var(--bg-card);
    }
    
    .badget-icon {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--bg-card);
    }
    .badget-text {
        font-size: 0.8rem;
        color: var(--text-primary);
    }
    
</style>


<div class="badget-button">
    <div class="badget-icon"><slot /></div>
    <div class="badget-text">{text}</div>
</div>
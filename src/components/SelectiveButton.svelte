<script>
    let {
        options = [],
        selected = 0,
        icon = null,
        onChange = () => {}
    } = $$props;

const changeSelection = () => {
    selected ++;
    if (selected >= options.length) {
        selected = 0;
    }
    onChange(options[selected]);
}
</script>

<style>
.selective-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
    .selective-button button {
        border: 1px solid rgba(255, 255, 255, 0.9);
        background-color: var(--translucend-ligth);
        height: 50px;
        width: 50px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
        color: var(--text-secondary);
    }

</style>


<div class="selective-button">
        <button
            class:selected={options[selected]}
            onclick={changeSelection}
        >
            {#if icon}
                <svelte:component this={icon} size="32" />
            {/if}
        </button>
        <small>{options[selected]}</small>
</div>
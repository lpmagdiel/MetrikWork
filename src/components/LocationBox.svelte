<script>
    import LocationMap from "./LocationMap.svelte";

    let {
        gps = { lat: 0, lon: 0 },
        name = "Desconocido",
        description = "No hay descripción"
    } = $props();
</script>

<style>
    .location-box {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background-color: var(--bg-card);
        margin: 10px;
        width: 100%;
        min-height: 200px;
    }

    .location-box-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .location-box-info h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.3;
    }

    .location-box-info p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.4;
    }
</style>

<div class="location-box">
    <LocationMap {gps} label={name} />
    <div class="location-box-info">
        <h3>{name}</h3>
        <p>{description}</p>
    </div>
</div>

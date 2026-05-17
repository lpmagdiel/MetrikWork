<script>
    import { MapPinned } from "lucide-svelte";
    import LocationMap from "./LocationMap.svelte";

    let {
        gps = { lat: 0, lon: 0 },
        name = "Desconocido",
        description = "No hay descripción"
    } = $props();

    const googleMapsUrl = $derived(`https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lon}`);
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
        position: relative;
        overflow: hidden;
    }

    .location-box-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: absolute;
        bottom: 0;
        width: 100%;
        height: 80px;
        padding-right: 46px;
        background-color: var(--bg-card);
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

    .location-map-button {
        position: absolute;
        top: calc(50% - 16px);
        right: 20px;
        width: 34px;
        height: 34px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid none;
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        background-color: var(--bg-accent-subtle);
        text-decoration: none;
        box-shadow: var(--shadow-card);
    }
</style>

<div class="location-box">
    <LocationMap {gps} label={name} />
    <div class="location-box-info">
        <a
            class="location-map-button"
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir ubicación en Google Maps"
            title="Abrir en Google Maps"
        >
            <MapPinned size={18} color="#ffffff"/>
        </a>
        <h3>{name}</h3>
        <p>{description}</p>
    </div>
</div>

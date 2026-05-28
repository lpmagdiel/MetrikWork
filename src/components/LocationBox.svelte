<script>
    import { MapPinned } from "lucide-svelte";
    import { currentUserLocation } from "../data/geolocation.js";
    import { distanceInfo } from "../helpers/navigation.js";
    import LocationMap from "./LocationMap.svelte";

    let {
        gps = { lat: 0, lon: 0 },
        name = "Desconocido",
        description = "No hay descripción"
    } = $props();

    const hasCoordinates = $derived(
        Number.isFinite(Number(gps?.lat)) && Number.isFinite(Number(gps?.lon ?? gps?.lng))
    );
    const locationCoordinates = $derived(normalizeCoordinates(gps));
    const userCoordinates = $derived(normalizeCoordinates($currentUserLocation));
    const distanceLabel = $derived.by(() => {
        if (!locationCoordinates || !userCoordinates) return "";
        return distanceInfo(userCoordinates, locationCoordinates);
    });
    const googleMapsUrl = $derived.by(() => {
        if (!hasCoordinates) return "";
        return `https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lon ?? gps.lng}`;
    });

    function normalizeCoordinates(value) {
        const lat = Number(value?.lat);
        const lon = Number(value?.lon ?? value?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { lat, lon };
    }
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
        min-height: 220px;
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
        min-height: 94px;
        padding: 10px 46px 10px 10px;
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

    .location-distance {
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 700;
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
        {#if hasCoordinates}
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
        {/if}
        <h3>{name}</h3>
        <p>{description}</p>
        {#if distanceLabel}
            <small class="location-distance">a {distanceLabel} de ti</small>
        {/if}
    </div>
</div>

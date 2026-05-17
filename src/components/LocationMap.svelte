<script>
  let {
    gps = { lat: 0, lon: 0 },
    label = "Ubicación",
    zoom = 16,
  } = $props();

  const zoomToDelta = {
    18: 0.002,
    17: 0.004,
    16: 0.008,
    15: 0.016,
    14: 0.032,
    13: 0.064,
  };

  let coordinates = $derived.by(() => {
    const lat = Number(gps?.lat);
    const lon = Number(gps?.lon ?? gps?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return { lat, lon };
  });

  let mapSrc = $derived.by(() => {
    if (!coordinates) return "";

    const delta = zoomToDelta[zoom] ?? zoomToDelta[16];
    const params = new URLSearchParams({
      bbox: [
        coordinates.lon - delta,
        coordinates.lat - delta,
        coordinates.lon + delta,
        coordinates.lat + delta,
      ].join(","),
      layer: "mapnik",
      marker: `${coordinates.lat},${coordinates.lon}`,
    });

    return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
  });

  let mapLink = $derived.by(() => {
    if (!coordinates) return "";

    const params = new URLSearchParams({
      mlat: String(coordinates.lat),
      mlon: String(coordinates.lon),
      zoom: String(zoom),
    });

    return `https://www.openstreetmap.org/?${params.toString()}#map=${zoom}/${coordinates.lat}/${coordinates.lon}`;
  });
</script>

<div class="location-map">
  {#if coordinates}
    <iframe
      title={`Mapa de ${label}`}
      src={mapSrc}
      loading="lazy"
      referrerpolicy="no-referrer-when-downgrade"
    ></iframe>
  {:else}
    <div class="empty-map">
      <span>Ubicación no disponible</span>
    </div>
  {/if}
</div>

<style>
  .location-map {
    position: relative;
    width: 100%;
    height: 220px;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .location-map iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }


  .empty-map {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-secondary);
    font-size: 14px;
  }
</style>

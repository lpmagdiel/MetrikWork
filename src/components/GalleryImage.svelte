<script>
  import { CalendarDays, Folder, ImageOff, Trash2 } from "lucide-svelte";
  import { optimizeCloudinary } from "../helpers/image.js";

  const { image, folderName = "Sin carpeta", onOpen, onDelete } = $props();

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }
</script>

<article class="gallery-image-card">
  <button
    class="image-thumb"
    type="button"
    aria-label={`Abrir ${image.name || "imagen"}`}
    onclick={() => onOpen?.(image)}
  >
    {#if image.url}
      <img
        src={optimizeCloudinary(image.url, 260, { height: 260, crop: "fill" })}
        alt={image.name || "Imagen de la galería"}
        width="104"
        height="104"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <ImageOff size={40} />
    {/if}
  </button>

  <div class="image-description">
    <h3>{image.name || "Imagen"}</h3>
    <div class="image-meta">
      <span class="badge"><Folder size={14} /> {folderName}</span>
      {#if formatDate(image.createdAt)}
        <span class="badge date"><CalendarDays size={14} /> {formatDate(image.createdAt)}</span>
      {/if}
    </div>
  </div>

  {#if onDelete}
    <div class="image-actions">
      <button
        class="delete-button"
        type="button"
        aria-label={`Eliminar ${image.name || "imagen"}`}
        title="Eliminar imagen"
        onclick={() => onDelete(image)}
      >
        <Trash2 size={18} />
      </button>
    </div>
  {/if}
</article>

<style>
  .gallery-image-card {
    width: 100%;
    min-height: 104px;
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr) 44px;
    align-items: stretch;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    transition: 0.2s ease;
  }

  .gallery-image-card:hover {
    border-color: color-mix(in srgb, var(--accent-color) 50%, var(--border-color));
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
  }

  .image-thumb {
    width: 104px;
    min-height: 104px;
    padding: 0;
    border: 0;
    background: linear-gradient(135deg, var(--bg-input), var(--bg-card-raised));
    color: var(--text-muted);
    cursor: zoom-in;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .image-thumb img {
    width: 100%;
    height: 100%;
    min-height: 104px;
    object-fit: cover;
    display: block;
  }

  .image-description {
    min-width: 0;
    padding: 12px 10px 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .image-meta {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }

  .badge {
    min-height: 26px;
    max-width: 100%;
    padding: 4px 9px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--info-color);
    background: var(--bg-info-subtle);
    font-size: 12px;
    line-height: 1;
    font-weight: 700;
  }

  .badge.date {
    color: var(--text-secondary);
    background: var(--bg-input);
  }

  .image-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-right: 8px;
  }

  .delete-button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .delete-button:hover {
    color: var(--danger-color);
    background: var(--bg-danger-subtle);
  }

  .gallery-image-card:not(:has(.image-actions)) {
    grid-template-columns: 104px minmax(0, 1fr);
  }

  @media (max-width: 420px) {
    .gallery-image-card {
      grid-template-columns: 92px minmax(0, 1fr) 40px;
      min-height: 96px;
    }

    .gallery-image-card:not(:has(.image-actions)) {
      grid-template-columns: 92px minmax(0, 1fr);
    }

    .image-thumb {
      width: 92px;
      min-height: 96px;
    }

    .image-thumb img {
      min-height: 96px;
    }

    .image-description {
      padding: 10px 8px 10px 12px;
    }

    .badge {
      font-size: 11px;
    }
  }
</style>

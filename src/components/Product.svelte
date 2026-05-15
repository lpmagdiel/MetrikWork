<script>
  import { CircleDollarSign, Edit2, Hash, ImageOff, MapPin, TriangleAlert } from "lucide-svelte";

  const { product, isEditable, onEdit, onReport } = $props();

  function formatPrice(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }
</script>


<style>
  .product {
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
  }

  .product:hover {
    border-color: color-mix(in srgb, var(--accent-color) 50%, var(--border-color));
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
  }

  .product img {
    width: 100%;
    height: 100%;
    min-height: 104px;
    object-fit: cover;
    display: block;
  }

  .product-description {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 12px 10px 12px 14px;
  }

  .product-description h3 {
    margin: 0;
    font-size: 15px;
    line-height: 1.25;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .product-meta,
  .product-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .product-stats {
    gap: 8px;
  }

  .product-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding-right: 8px;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    background: transparent;
    border: none;
    border-radius: 999px;
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: var(--bg-info-subtle);
    color: var(--info-color);
  }

  .edit {
    color: var(--text-secondary);
  }

  .warning {
    color: var(--warning-color);
  }

  .warning:hover {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1;
    font-weight: 700;
    color: var(--success-color);
    background: var(--bg-success-subtle);
  }

  .badge.low {
    color: var(--warning-color);
    background: var(--bg-warning-subtle);
  }

  .price {
    color: var(--success-color);
    background: color-mix(in srgb, var(--bg-success-subtle) 72%, var(--bg-card));
  }

  .location {
    max-width: 100%;
    color: var(--info-color);
    background: var(--bg-info-subtle);
  }

  .location span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-thumb {
    min-height: 104px;
    background: linear-gradient(135deg, var(--bg-input), var(--bg-card-raised));
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .product-thumb.placeholder {
    width: 100%;
    height: 100%;
    color: var(--text-muted);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    max-width: 100%;
    background: var(--bg-input);
    padding: 4px 9px;
    border-radius: 999px;
    text-transform: uppercase;
    font-size: 11px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 420px) {
    .product {
      grid-template-columns: 92px minmax(0, 1fr) 40px;
      min-height: 96px;
    }

    .product img,
    .product-thumb {
      min-height: 96px;
    }

    .product-description {
      padding: 10px 8px 10px 12px;
      gap: 7px;
    }

    .product-description h3 {
      font-size: 14px;
    }

    .badge,
    .tag {
      font-size: 11px;
      padding-inline: 8px;
    }
  }
</style>


<div class="product">
  <div class="product-thumb">
    {#if product.imageUrl}
      <img src={product.imageUrl} alt={product.name} />
    {:else}
      <div class="product-thumb placeholder">
        <ImageOff size={44} />
      </div>
    {/if}
  </div>
  <div class="product-description">
    <div class="product-meta">
      <h3>{product.name}</h3>
      {#if product.category}
        <span class="tag">{product.category}</span>
      {/if}
    </div>
    <div class="product-stats">
      <span class="badge price"><CircleDollarSign size={14} /> {formatPrice(product.price)}</span>
      <span class:low={product.quantity <= product.minStock} class="badge">
        {#if product.quantity <= product.minStock}
          <TriangleAlert size={14} />
        {:else}
          <Hash size={14} />
        {/if}
        {product.quantity}
      </span>
      {#if product.locationName}
        <span class="badge location">
          <MapPin size={14} />
          <span>{product.locationName}</span>
        </span>
      {/if}
    </div>
  </div>
  <div class="product-actions">
    {#if onReport}
      <button
        class="icon-btn warning"
        type="button"
        aria-label={`Reportar problema con ${product.name}`}
        title="Reportar problema"
        onclick={() => onReport(product)}
      >
        <TriangleAlert size={18} />
      </button>
    {/if}
    {#if isEditable}
      <button
        class="icon-btn edit"
        type="button"
        aria-label={`Editar ${product.name}`}
        title="Editar producto"
        onclick={() => onEdit(product)}
      >
        <Edit2 size={18} />
      </button>
    {/if}
  </div>
</div>

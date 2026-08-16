<script>
  let {
    options = [],
    value = $bindable(null),
    label = "",
    disabled = false,
    ariaLabel = "Seleccionar opción",
    onchange = () => {}
  } = $props();

  let normalizedOptions = $derived(options.map((option, index) => {
    if (option && typeof option === "object") {
      return {
        label: option.label || option.name || String(option.value ?? index),
        value: option.value ?? option.id ?? index,
        icon: option.icon || null,
        disabled: Boolean(option.disabled)
      };
    }
    return {
      label: String(option ?? ""),
      value: option,
      icon: null,
      disabled: false
    };
  }));

  let totalSegments = $derived(Math.max(1, normalizedOptions.length));
  let activeIndex = $derived.by(() => {
    const idx = normalizedOptions.findIndex((o) => o.value === value);
    return idx < 0 ? 0 : idx;
  });

  let thumbStyle = $derived.by(() => {
    const t = totalSegments;
    return `--thumb-index: ${activeIndex}; --segments: ${t};`;
  });

  function select(targetValue) {
    if (disabled) return;
    if (targetValue === value) return;
    value = targetValue;
    onchange(targetValue);
  }

  function onKeydown(event) {
    if (disabled) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    let nextIndex = activeIndex;
    for (let step = 0; step < normalizedOptions.length; step += 1) {
      nextIndex = (nextIndex + direction + normalizedOptions.length) % normalizedOptions.length;
      if (!normalizedOptions[nextIndex].disabled) break;
    }
    const next = normalizedOptions[nextIndex];
    if (next) select(next.value);
  }
</script>

<div
  class="segmented-selector"
  class:disabled
  role="tablist"
  aria-label={ariaLabel}
  aria-orientation="horizontal"
>
  {#if label}
    <span class="segmented-label">{label}</span>
  {/if}
  <div
    class="segmented-track"
    role="presentation"
    style={thumbStyle}
    data-segments={totalSegments}
  >
    <div class="segmented-thumb" aria-hidden="true"></div>
    {#each normalizedOptions as option, index (option.value)}
      {@const Icon = option.icon}
      <button
        type="button"
        class="segmented-option"
        class:active={option.value === value}
        role="tab"
        aria-selected={option.value === value}
        aria-label={option.label}
        disabled={disabled || option.disabled}
        tabindex={option.value === value ? 0 : -1}
        onclick={() => select(option.value)}
        onkeydown={onKeydown}
      >
        {#if Icon}
          <span class="segmented-icon" aria-hidden="true">
            <Icon size={16} strokeWidth={2.4} />
          </span>
        {/if}
        <span class="segmented-text">{option.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .segmented-selector {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .segmented-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
  }

  .segmented-track {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--segments, 1), minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    overflow: hidden;
    isolation: isolate;
  }

  .segmented-thumb {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: calc(
      4px + ((100% - 8px) / var(--segments, 1)) * var(--thumb-index, 0)
    );
    width: calc((100% - 8px) / var(--segments, 1));
    border-radius: 999px;
    background: var(--bg-surface, #ffffff);
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
    transition: left 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 0;
    pointer-events: none;
  }

  .segmented-option {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    border-radius: 999px;
    cursor: pointer;
    transition: color 0.2s ease;
    min-height: 36px;
    min-width: 0;
    text-align: center;
    line-height: 1.1;
    -webkit-tap-highlight-color: transparent;
  }

  .segmented-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .segmented-option.active {
    color: var(--text-primary);
  }

  .segmented-option:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .segmented-option:focus-visible {
    outline: 2px solid var(--accent-color, #6366f1);
    outline-offset: 1px;
  }

  .segmented-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .segmented-selector.disabled .segmented-track {
    opacity: 0.55;
    filter: grayscale(0.2);
  }

  @media (max-width: 420px) {
    .segmented-option {
      padding: 8px 6px;
      font-size: 12px;
      gap: 4px;
    }
  }

  @media (max-width: 320px) {
    .segmented-track {
      gap: 2px;
      padding: 3px;
    }
    .segmented-option {
      padding: 7px 4px;
      font-size: 11px;
      min-height: 32px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .segmented-thumb {
      transition: none;
    }
  }
</style>

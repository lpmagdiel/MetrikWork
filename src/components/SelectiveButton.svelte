<script>
  let {
    options = [],
    selected = $bindable(0),
    value = $bindable(null),
    icon = null,
    label = "",
    disabled = false,
    compact = false,
    ariaLabel = "Cambiar selección",
    onChange = () => {},
  } = $props();

  function normalizeOption(option, index) {
    if (option && typeof option === "object") {
      return {
        label: option.label || option.name || String(option.value ?? index),
        value: option.value ?? option.id ?? index,
        description: option.description || "",
        icon: option.icon || null,
        disabled: Boolean(option.disabled),
      };
    }

    return {
      label: String(option ?? ""),
      value: option,
      description: "",
      icon: null,
      disabled: false,
    };
  }

  let normalizedOptions = $derived(options.map(normalizeOption));
  let activeIndex = $derived.by(() => {
    if (normalizedOptions.length === 0) return -1;

    const valueIndex = normalizedOptions.findIndex((option) => option.value === value);
    if (valueIndex >= 0) return valueIndex;

    return Math.min(Math.max(Number(selected) || 0, 0), normalizedOptions.length - 1);
  });
  let activeOption = $derived(normalizedOptions[activeIndex] || null);
  let ActiveIcon = $derived(activeOption?.icon || icon);

  function changeSelection() {
    if (disabled || normalizedOptions.length === 0) return;

    let nextIndex = activeIndex;
    for (let step = 0; step < normalizedOptions.length; step += 1) {
      nextIndex = (nextIndex + 1) % normalizedOptions.length;
      if (!normalizedOptions[nextIndex]?.disabled) break;
    }

    const nextOption = normalizedOptions[nextIndex];
    if (!nextOption || nextOption.disabled) return;

    selected = nextIndex;
    value = nextOption.value;
    onChange(nextOption.value, nextOption, nextIndex);
  }
</script>

<button
  type="button"
  class="selective-button"
  class:compact
  disabled={disabled || normalizedOptions.length === 0}
  aria-label={ariaLabel}
  onclick={changeSelection}
>
  <span class="selective-icon" aria-hidden="true">
    {#if ActiveIcon}
      <ActiveIcon size={compact ? 16 : 18} strokeWidth={2.4} />
    {/if}
  </span>
  <span class="selective-copy">
    {#if label}
      <small>{label}</small>
    {/if}
    <strong>{activeOption?.label || "Sin opciones"}</strong>
    {#if activeOption?.description}
      <span>{activeOption.description}</span>
    {/if}
  </span>
</button>

<style>
  .selective-button {
    min-width: 0;
    min-height: 48px;
    padding: 7px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    cursor: pointer;
    box-shadow: none;
    transition: all 0.3s ease;
  }

  .selective-button.compact {
    min-height: 44px;
    border-radius: var(--radius-sm);
    padding: 7px 9px;
    box-shadow: none;
  }

  .selective-button:focus,
  .selective-button:focus-visible,
  .selective-button:active {
    border-color: var(--accent-color);
    outline: none;
  }

  .selective-button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .selective-icon {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--bg-card);
    color: var(--text-primary);
  }

  .compact .selective-icon {
    width: 28px;
    height: 28px;
    border-radius: 9px;
  }

  .selective-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .selective-copy small,
  .selective-copy strong,
  .selective-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selective-copy small {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .selective-copy strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.1;
  }

  .selective-copy span {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
  }
</style>

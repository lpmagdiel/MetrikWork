<script>
  import { Search, X, Plus, User, Check } from "lucide-svelte";
  import { searchClients } from "../data/clients.js";

  let {
    clients = [],
    selectedClient = null,
    placeholder = "Buscar cliente por nombre, NIF/CIF o email",
    allowCreate = true,
    disabled = false,
    onSelect = () => {},
    onCreateNew = () => {},
    onClear = () => {},
    label = ""
  } = $props();

  let searchTerm = $state("");
  let isOpen = $state(false);
  let highlightedIndex = $state(-1);
  let debouncedTerm = $state("");
  let debounceTimer;
  let containerRef = $state(null);
  let inputRef = $state(null);

  const MAX_RESULTS = 8;

  let filteredClients = $derived.by(() => {
    const list = searchClients(clients, debouncedTerm, { includeInactive: true });
    return list.slice(0, MAX_RESULTS);
  });

  let showCreateOption = $derived(
    allowCreate &&
      debouncedTerm.trim().length >= 2 &&
      !filteredClients.some(
        (client) => client.name?.toLowerCase() === debouncedTerm.trim().toLowerCase()
      )
  );

  $effect(() => {
    if (selectedClient) {
      searchTerm = selectedClient.name || "";
      debouncedTerm = "";
    }
  });

  $effect(() => {
    clearTimeout(debounceTimer);
    debouncedTerm = searchTerm;
    debounceTimer = setTimeout(() => {
      debouncedTerm = searchTerm;
    }, 180);
    return () => clearTimeout(debounceTimer);
  });

  function handleFocus() {
    if (!disabled) isOpen = true;
  }

  function handleBlur(event) {
    if (containerRef && !containerRef.contains(event.relatedTarget)) {
      isOpen = false;
    }
  }

  function handleSelect(client) {
    selectedClient = client;
    searchTerm = client.name || "";
    isOpen = false;
    highlightedIndex = -1;
    onSelect(client);
  }

  function handleClear() {
    selectedClient = null;
    searchTerm = "";
    debouncedTerm = "";
    isOpen = false;
    highlightedIndex = -1;
    onClear();
  }

  function handleCreateNew() {
    isOpen = false;
    onCreateNew();
  }

  function handleKeydown(event) {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        isOpen = true;
        event.preventDefault();
      }
      return;
    }

    const totalOptions = filteredClients.length + (showCreateOption ? 1 : 0);

    if (event.key === "ArrowDown") {
      highlightedIndex = (highlightedIndex + 1) % totalOptions;
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      highlightedIndex = highlightedIndex <= 0 ? totalOptions - 1 : highlightedIndex - 1;
      event.preventDefault();
    } else if (event.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < filteredClients.length) {
        handleSelect(filteredClients[highlightedIndex]);
      } else if (showCreateOption && highlightedIndex === filteredClients.length) {
        handleCreateNew();
      } else if (showCreateOption && filteredClients.length === 0) {
        handleCreateNew();
      }
      event.preventDefault();
    } else if (event.key === "Escape") {
      isOpen = false;
      highlightedIndex = -1;
    }
  }

  function highlightMatch(text, term) {
    if (!term || !text) return text || "";
    const normalizedText = String(text);
    const normalizedTerm = term.toLowerCase();
    const lowerText = normalizedText.toLowerCase();
    const index = lowerText.indexOf(normalizedTerm);
    if (index < 0) return normalizedText;
    const before = normalizedText.slice(0, index);
    const match = normalizedText.slice(index, index + term.length);
    const after = normalizedText.slice(index + term.length);
    return { before, match, after };
  }
</script>

<div class="client-picker" bind:this={containerRef}>
  {#if label}
    <span class="picker-label">{label}</span>
  {/if}

  <div class="picker-input-row" class:open={isOpen}>
    <span class="picker-icon" aria-hidden="true">
      {#if selectedClient}
        <User size={18} />
      {:else}
        <Search size={18} />
      {/if}
    </span>

    {#if selectedClient}
      <div class="selected-display">
        <strong>{selectedClient.name}</strong>
        {#if selectedClient.taxId}
          <small>{selectedClient.taxId}</small>
        {/if}
      </div>
      {#if !disabled}
        <button
          type="button"
          class="clear-btn"
          onclick={handleClear}
          aria-label="Quitar cliente seleccionado"
        >
          <X size={16} />
        </button>
      {/if}
    {:else}
      <input
        bind:this={inputRef}
        type="text"
        bind:value={searchTerm}
        {placeholder}
        {disabled}
        autocomplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="client-picker-listbox"
        aria-activedescendant={highlightedIndex >= 0 ? `client-option-${highlightedIndex}` : undefined}
        onfocus={handleFocus}
        onblur={handleBlur}
        onkeydown={handleKeydown}
      />
    {/if}
  </div>

  {#if isOpen && !selectedClient && !disabled}
    <ul
      id="client-picker-listbox"
      class="picker-dropdown"
      role="listbox"
      aria-label="Resultados de búsqueda de clientes"
    >
      {#if filteredClients.length === 0 && !showCreateOption}
        <li class="picker-empty">
          {#if clients.length === 0}
            Sin clientes registrados.
          {:else}
            Sin coincidencias para "{searchTerm}".
          {/if}
        </li>
      {/if}

      {#each filteredClients as client, index (client.id)}
        {@const matched = highlightMatch(client.name, debouncedTerm)}
        <li
          id={`client-option-${index}`}
          role="option"
          aria-selected={highlightedIndex === index}
          tabindex="-1"
          class="picker-option"
          class:active={highlightedIndex === index}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => handleSelect(client)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSelect(client);
            }
          }}
          onmouseenter={() => (highlightedIndex = index)}
        >
          <span class="option-icon">
            <User size={16} />
          </span>
          <span class="option-body">
            <strong>
              {#if typeof matched === "object" && matched !== null}
                {matched.before}<mark>{matched.match}</mark>{matched.after}
              {:else}
                {matched}
              {/if}
            </strong>
            {#if client.taxId || client.email}
              <small>
                {client.taxId || ""}
                {#if client.taxId && client.email} · {/if}
                {client.email || ""}
              </small>
            {/if}
          </span>
          {#if highlightedIndex === index}
            <span class="option-check"><Check size={14} /></span>
          {/if}
        </li>
      {/each}

      {#if showCreateOption}
        <li
          id={`client-option-${filteredClients.length}`}
          role="option"
          aria-selected={highlightedIndex === filteredClients.length}
          tabindex="-1"
          class="picker-option create-option"
          class:active={highlightedIndex === filteredClients.length}
          onmousedown={(event) => event.preventDefault()}
          onclick={handleCreateNew}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleCreateNew();
            }
          }}
          onmouseenter={() => (highlightedIndex = filteredClients.length)}
        >
          <span class="option-icon"><Plus size={16} /></span>
          <span class="option-body">
            <strong>Crear cliente "{searchTerm.trim()}"</strong>
            <small>Añadir un cliente nuevo con este nombre</small>
          </span>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .client-picker {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .picker-label {
    color: var(--text-secondary, #6b7280);
    font-size: 13px;
    font-weight: 700;
  }

  .picker-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 0 14px;
    background: var(--bg-input, #f3f4f6);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: var(--radius-md, 12px);
    color: var(--text-primary, #111827);
    transition: border-color 0.18s ease;
  }

  .picker-input-row:focus-within,
  .picker-input-row.open {
    border-color: var(--accent-color, #2563eb);
  }

  .picker-icon {
    display: inline-flex;
    color: var(--text-secondary, #6b7280);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
    padding: 12px 0;
  }

  input::placeholder {
    color: var(--text-secondary, #6b7280);
  }

  .selected-display {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
  }

  .selected-display strong {
    color: var(--text-primary, #111827);
    font-size: 15px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-display small {
    color: var(--text-secondary, #6b7280);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clear-btn {
    border: 0;
    background: transparent;
    color: var(--text-secondary, #6b7280);
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .clear-btn:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--text-primary, #111827);
  }

  .picker-dropdown {
    position: absolute;
    z-index: 30;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: var(--radius-md, 12px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
    max-height: 320px;
    overflow-y: auto;
  }

  .picker-empty {
    padding: 14px;
    color: var(--text-secondary, #6b7280);
    font-size: 14px;
    text-align: center;
  }

  .picker-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.14s ease;
  }

  .picker-option.active {
    background: var(--bg-accent-subtle, rgba(37, 99, 235, 0.08));
  }

  .picker-option.create-option {
    border-top: 1px dashed var(--border-color, #e5e7eb);
    margin-top: 4px;
    padding-top: 12px;
  }

  .option-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--bg-input, #f3f4f6);
    color: var(--text-secondary, #6b7280);
    flex-shrink: 0;
  }

  .picker-option.create-option .option-icon {
    background: var(--bg-success-subtle, rgba(34, 197, 94, 0.12));
    color: var(--success-color, #16a34a);
  }

  .option-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .option-body strong {
    color: var(--text-primary, #111827);
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-body mark {
    background: rgba(250, 204, 21, 0.4);
    color: inherit;
    padding: 0 1px;
    border-radius: 3px;
  }

  .option-body small {
    color: var(--text-secondary, #6b7280);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-check {
    color: var(--accent-color, #2563eb);
    display: inline-flex;
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .picker-input-row,
    .picker-option {
      transition: none;
    }
  }
</style>
<script>
  // @ts-nocheck

  import {
    notesStore,
    addNote,
    deleteNote,
    updateNote,
    userStore,
  } from "../data/stores.js";
  import {
    Plus,
    Search,
    Type,
    CheckSquare,
    X,
    Trash2,
    Check,
    Palette,
    ArrowLeft,
    StickyNote,
    Upload,
    ClipboardPaste,
    LayoutGrid,
    Sparkles,
    CalendarDays,
    CircleCheck,
  } from "lucide-svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import { useSwipe } from "svelte-gestures";
  import TitleHeader from "../components/TitleHeader.svelte";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import { confirmAlert, showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import { ImportError, importFromFile, importFromString } from "../lib/importers/importManager.js";
  import { toNoteData } from "../lib/importers/rcxImporter.js";

  let searchQuery = $state("");
  let showAddMenu = $state(false);
  let showEditor = $state(false);
  let showColorOptions = $state(false);
  let importFileInput = $state(null);
  let activeFilter = $state("all");

  const filters = [
    { id: "all", label: "Todas", icon: LayoutGrid },
    { id: "text", label: "Texto", icon: Type },
    { id: "todo", label: "Listas", icon: CheckSquare },
    { id: "rcx", label: "RCX", icon: Sparkles },
  ];

  // Editor state
  let currentNoteId = $state(null);
  let noteType = $state("text"); // 'text' or 'todo'
  let noteTitle = $state("");
  let noteContent = $state("");
  let todoItems = $state([]);
  let noteColor = $state("#ffffff");
  let newItemText = $state("");

  const colors = [
    "#ffffff", // White
    "#ffccbc", // Orange
    "#ffe082", // Amber
    "#fff59d", // Yellow
    "#c5e1a5", // Light Green
    "#b2dfdb", // Teal
    "#b3e5fc", // Light Blue
    "#d1c4e9", // Deep Purple
    "#f8bbd0", // Pink
    "#cfd8dc", // Blue Grey
  ];

  let filteredNotes = $derived(
    $notesStore
      .filter((note) => {
        const query = searchQuery.toLowerCase();
        const matchesQuery =
          (note.title && note.title.toLowerCase().includes(query)) ||
          (note.content && note.content.toLowerCase().includes(query)) ||
          (note.items &&
            note.items.some((i) => i.text.toLowerCase().includes(query)));
        if (!matchesQuery) return false;
        if (activeFilter === "text") return note.type !== "todo";
        if (activeFilter === "todo") return note.type === "todo";
        if (activeFilter === "rcx") return Boolean(note.imported);
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  );

  let filterCounts = $derived({
    all: $notesStore.length,
    text: $notesStore.filter((n) => n.type !== "todo").length,
    todo: $notesStore.filter((n) => n.type === "todo").length,
    rcx: $notesStore.filter((n) => Boolean(n.imported)).length,
  });

  let doneCount = $derived(todoItems.filter((i) => i.completed).length);

  function openEditor(type, note = null) {
    if (note) {
      currentNoteId = note.id;
      noteType = note.type || "text";
      noteTitle = note.title || "";
      noteContent = note.content || "";
      todoItems = note.items ? JSON.parse(JSON.stringify(note.items)) : [];
      noteColor = note.color || "#ffffff";
    } else {
      currentNoteId = null;
      noteType = type;
      noteTitle = "";
      noteContent = "";
      todoItems = [];
      noteColor = "#ffffff";
    }
    showAddMenu = false;
    showEditor = true;
  }

  function closeEditor() {
    showEditor = false;
    // Reset state slightly delayed for animation
    setTimeout(() => {
      currentNoteId = null;
      noteTitle = "";
      noteContent = "";
      todoItems = [];
      newItemText = "";
    }, 300);
  }

  async function saveNote() {
    if (!noteTitle && !noteContent && todoItems.length === 0) {
      closeEditor();
      return;
    }

    if (!$userStore?.uid) {
      showErrorAlert("Error", "No se pudo identificar el usuario para guardar la nota");
      return;
    }

    const data = {
      title: noteTitle,
      type: noteType,
      content: noteContent,
      items: todoItems,
      color: noteColor,
      date: new Date().toISOString(), // Update date on edit
    };

    try {
      if (currentNoteId) {
        await updateNote($userStore.uid, currentNoteId, data);
      } else {
        await addNote(
          $userStore.uid,
          noteContent,
          null,
          noteTitle,
          noteType,
          todoItems,
          noteColor,
        );
      }
      closeEditor();
    } catch (e) {
      console.error("Error saving note:", e);
      showErrorAlert("Error", "Error al guardar la nota");
    }
  }

  function addTodoItem() {
    if (!newItemText.trim()) return;
    todoItems = [...todoItems, { text: newItemText, completed: false }];
    newItemText = "";
  }

  function removeTodoItem(index) {
    todoItems = todoItems.filter((_, i) => i !== index);
  }

  function toggleTodoItem(index) {
    todoItems = todoItems.map((item, i) =>
      i === index ? { ...item, completed: !item.completed } : item,
    );
  }

  // Quick toggle in list view
  async function quickToggle(note, itemIndex) {
    if (!$userStore?.uid) return;
    const items = (note.items || []).map((item, i) =>
      i === itemIndex ? { ...item, completed: !item.completed } : item,
    );
    await updateNote($userStore.uid, note.id, { items });
  }

  async function deleteCurrentNote() {
    if (!currentNoteId || !$userStore?.uid) return;
    const confirmed = await confirmAlert({
      title: "Eliminar nota",
      text: "¿Estás seguro de eliminar esta nota?",
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;
    await deleteNote($userStore.uid, currentNoteId);
    closeEditor();
  }

  // --- Importación RCX ---

  function triggerFileImport() {
    showAddMenu = false;
    importFileInput?.click();
  }

  async function createImportedNote(project) {
    if (!$userStore?.uid) {
      showErrorAlert("Error", "No se pudo identificar el usuario para guardar la nota");
      return;
    }
    const note = toNoteData(project);
    try {
      await addNote(
        $userStore.uid,
        note.content,
        null,
        note.title,
        note.type,
        note.items,
        note.color,
        { imported: true, tags: Array.isArray(project.tags) ? project.tags : [] },
      );
      showSuccessAlert("Importado", `Nota "${note.title}" creada correctamente.`);
    } catch (e) {
      console.error("Error creando la nota importada:", e);
      showErrorAlert("Error", "Error al crear la nota importada");
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await importFromFile(file);
      await createImportedNote(result.project);
    } catch (e) {
      console.error("Error importando archivo:", e);
      showErrorAlert(
        "Importar RCX",
        e instanceof ImportError ? e.message : "No se pudo importar el proyecto.",
      );
    } finally {
      if (importFileInput) importFileInput.value = "";
    }
  }

  async function handlePasteRCX() {
    showAddMenu = false;
    if (!navigator.clipboard?.readText) {
      showErrorAlert("Pegar RCX", "El portapapeles no está disponible en este navegador.");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      const result = await importFromString(text);
      await createImportedNote(result.project);
    } catch (e) {
      console.error("Error pegando RCX:", e);
      showErrorAlert("Pegar RCX", "El portapapeles no contiene un proyecto RCX válido.");
    }
  }

  // Format date helper
  function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }

  // Card helpers
  function cardBackground(note) {
    return note.color && note.color !== "#ffffff" ? note.color : "";
  }

  function isColored(note) {
    return Boolean(note.color && note.color !== "#ffffff");
  }

  function completedCount(note) {
    return (note.items || []).filter((i) => i.completed).length;
  }

  function totalItems(note) {
    return (note.items || []).length;
  }

  function progressPercent(note) {
    const total = totalItems(note);
    if (!total) return 0;
    return Math.round((completedCount(note) / total) * 100);
  }
</script>

<div class="notes-page">
  <header>
    <TitleHeader title="Notas" description="Tus notas personales" icon={StickyNote} iconPosition="right" />
    <div class="search-bar">
      <Search size={20} color="#878787" />
      <input
        type="text"
        placeholder="Buscar notas..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          class="clear-search"
          onclick={() => (searchQuery = "")}
          aria-label="Limpiar búsqueda"
        >
          <X size={16} color="#878787" />
        </button>
      {/if}
    </div>
    <div class="filters">
      {#each filters as filter (filter.id)}
        <button
          class="filter-chip {activeFilter === filter.id ? 'active' : ''}"
          onclick={() => (activeFilter = filter.id)}
        >
          <svelte:component this={filter.icon} size={15} />
          <span>{filter.label}</span>
          {#if filterCounts[filter.id] > 0}
            <span class="filter-count">{filterCounts[filter.id]}</span>
          {/if}
        </button>
      {/each}
    </div>
  </header>

  <div class="notes-grid">
    {#if $notesStore.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <StickyNote size={48} />
        </div>
        <p>No tienes notas aún</p>
        <span>Crea una nota de texto o lista</span>
      </div>
    {:else if filteredNotes.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <Search size={44} />
        </div>
        <p>Sin resultados</p>
        <span>Prueba con otra búsqueda o filtro</span>
      </div>
    {:else}
      {#each filteredNotes as note (note.id)}
        <button
          class="note-card {isColored(note) ? 'colored' : ''} {note.imported
            ? 'imported'
            : ''}"
          style={cardBackground(note) ? `background-color: ${cardBackground(note)}` : ""}
          onclick={() => openEditor(null, note)}
        >
          <div class="note-top">
            {#if note.title}
              <h3>{note.title}</h3>
            {/if}
            <div class="note-badges">
              {#if note.imported}
                <span class="badge badge-rcx">RCX</span>
              {/if}
              <span class="badge badge-type">
                {note.type === "todo" ? "Lista" : "Texto"}
              </span>
            </div>
          </div>

          <div class="note-preview">
            {#if note.type === "todo"}
              <div class="todo-preview">
                {#each (note.items || []).slice(0, 4) as item, i}
                  <div class="preview-item">
                    <div
                      class="checkbox-sm {item.completed ? 'checked' : ''}"
                      onclick={(e) => {
                        e.stopPropagation();
                        quickToggle(note, i);
                      }}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) =>
                        e.key === "Enter" && quickToggle(note, i)}
                    >
                      {#if item.completed}<Check size={10} color="white" />{/if}
                    </div>
                    <span class:completed={item.completed}>{item.text}</span>
                  </div>
                {/each}
                {#if totalItems(note) > 4}
                  <span class="more-items">... {totalItems(note) - 4} más</span>
                {/if}
              </div>
            {:else}
              <p>{note.content || "Sin contenido"}</p>
            {/if}
          </div>

          <div class="note-footer">
            {#if note.type === "todo" && totalItems(note) > 0}
              <div class="todo-progress">
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    style="width: {progressPercent(note)}%"
                  ></div>
                </div>
                <span class="progress-label">{completedCount(note)}/{totalItems(note)}</span>
              </div>
            {:else}
              <div class="footer-spacer"></div>
            {/if}
            <span class="note-date">
              <CalendarDays size={11} />
              {formatDate(note.createdAt)}
            </span>
          </div>
        </button>
      {/each}
    {/if}
  </div>

  <CircleAddButton onClick={() => (showAddMenu = true)} floating={true}/>

  <SliceContainer bind:show={showAddMenu}>
    <div class="add-menu">
      <h3>Crear nueva</h3>
      <div class="menu-options">
        <button class="menu-btn" onclick={() => openEditor("text")}>
          <div class="menu-icon text">
            <Type size={24} />
          </div>
          <div class="menu-label">
            <span>Texto</span>
            <small>Nota rápida</small>
          </div>
        </button>
        <button class="menu-btn" onclick={() => openEditor("todo")}>
          <div class="menu-icon todo">
            <CheckSquare size={24} />
          </div>
          <div class="menu-label">
            <span>Lista</span>
            <small>Checklist</small>
          </div>
        </button>
        <button class="menu-btn" onclick={triggerFileImport}>
          <div class="menu-icon import">
            <Upload size={24} />
          </div>
          <div class="menu-label">
            <span>Importar RCX</span>
            <small>Desde archivo</small>
          </div>
        </button>
        <button class="menu-btn" onclick={handlePasteRCX}>
          <div class="menu-icon paste">
            <ClipboardPaste size={24} />
          </div>
          <div class="menu-label">
            <span>Pegar RCX</span>
            <small>Desde portapapeles</small>
          </div>
        </button>
      </div>
    </div>
  </SliceContainer>

  <input
    type="file"
    accept=".rcx.json,.json,application/json"
    style="display: none"
    bind:this={importFileInput}
    onchange={handleImportFile}
  />

  <!-- Full Screen Editor Overlay -->
  {#if showEditor}
    <div
      class="editor-overlay {isColored({ color: noteColor }) ? 'colored' : ''}"
      style={noteColor !== "#ffffff" ? `background-color: ${noteColor}` : ""}
    >
      <div class="editor-header">
        <button class="icon-btn" onclick={saveNote} aria-label="Atrás">
          <ArrowLeft size={24} />
        </button>
        <div class="editor-actions">
          <div class="color-picker-wrapper">
            <button class="icon-btn" aria-label="Color" onclick={() => (showColorOptions = !showColorOptions)}>
              <Palette size={22} />
            </button>
            {#if showColorOptions}
              <div class="color-options">
                {#each colors as color}
                  <button
                    class="color-circle {noteColor === color ? 'selected' : ''}"
                    style="background-color: {color}"
                    onclick={() => {
                      noteColor = color;
                      showColorOptions = false;
                    }}
                    aria-label="Color"
                  >
                    {#if noteColor === color}
                      <Check size={12} color={color === "#ffffff" ? "#333" : "#fff"} />
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <button class="icon-btn save-btn" onclick={saveNote} aria-label="Guardar">
            <Check size={22} />
          </button>
          {#if currentNoteId}
            <button
              class="icon-btn"
              onclick={deleteCurrentNote}
              aria-label="Eliminar"
            >
              <Trash2 size={22} color="#ff4d4d" />
            </button>
          {/if}
        </div>
      </div>

      <div class="editor-content">
        <input
          type="text"
          class="title-input"
          placeholder="Título"
          bind:value={noteTitle}
        />

        {#if noteType === "todo"}
          {#if todoItems.length > 0}
            <div class="todo-stats">
              <span>
                <CircleCheck size={14} />
                {doneCount} de {todoItems.length} completados
              </span>
              <div class="progress-track editor">
                <div
                  class="progress-fill"
                  style="width: {todoItems.length
                    ? Math.round((doneCount / todoItems.length) * 100)
                    : 0}%"
                ></div>
              </div>
            </div>
          {/if}
          <div class="todo-editor">
            {#each todoItems as item, i}
              <div class="todo-row">
                <button
                  class="checkbox-md {item.completed ? 'checked' : ''}"
                  onclick={() => toggleTodoItem(i)}
                >
                  {#if item.completed}<Check size={14} color="white" />{/if}
                </button>
                <input
                  type="text"
                  class:completed={item.completed}
                  bind:value={item.text}
                />
                <button class="remove-btn" onclick={() => removeTodoItem(i)}>
                  <X size={20} />
                </button>
              </div>
            {/each}

            <div class="add-item-row">
              <Plus size={20} color="#878787" />
              <input
                type="text"
                placeholder="Agregar elemento..."
                bind:value={newItemText}
                onkeydown={(e) => e.key === "Enter" && addTodoItem()}
              />
              <button
                class="add-btn"
                onclick={addTodoItem}
                disabled={!newItemText.trim()}
              >
                Agregar
              </button>
            </div>
          </div>
        {:else}
          <textarea
            class="content-textarea"
            placeholder="Empieza a escribir..."
            bind:value={noteContent}
          ></textarea>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .notes-page {
    padding: 24px 24px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
    overflow-y: hidden; /* Header fixed, grid scrolls */
    position: relative;
  }
  .editor-overlay {
    padding-top: var(--page-top-safe);
  }

  header {
    margin-bottom: 18px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .search-bar {
    background: var(--bg-card);
    border-radius: 14px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: var(--shadow-card);
    border: 1px solid transparent;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .search-bar:focus-within {
    border-color: color-mix(in srgb, var(--accent-color) 70%, var(--border-color));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 28%, transparent);
  }

  .search-bar input {
    border: none;
    outline: none;
    background: none;
    font-size: 15px;
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
  }

  .search-bar input::placeholder {
    color: var(--text-muted);
  }

  .clear-search {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    background: var(--bg-input);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }

  .filters {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding-bottom: 2px;
  }

  .filters::-webkit-scrollbar {
    display: none;
  }

  .filter-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease,
      box-shadow 0.2s ease, transform 0.15s ease;
  }

  .filter-chip:hover {
    border-color: color-mix(in srgb, var(--accent-color) 60%, var(--border-color));
    color: var(--text-primary);
    background: color-mix(in srgb, var(--bg-card) 88%, var(--accent-color));
  }

  .filter-chip:hover .filter-count {
    background: color-mix(in srgb, var(--bg-input) 78%, var(--accent-color));
  }

  .filter-chip:active {
    transform: scale(0.95);
  }

  .filter-chip.active {
    background: var(--accent-strong);
    color: var(--accent-ink);
    border-color: var(--accent-strong);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-strong) 30%, transparent);
  }

  .filter-chip.active:hover {
    background: var(--accent-strong);
    color: var(--accent-ink);
    border-color: var(--accent-strong);
  }

  .filter-count {
    font-size: 11px;
    font-weight: 700;
    background: var(--bg-input);
    color: var(--text-secondary);
    border-radius: 999px;
    padding: 1px 6px;
    line-height: 1.4;
  }

  .filter-chip.active .filter-count {
    background: var(--bg-card);
    color: var(--text-primary);
  }

  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
    overflow-y: auto;
    padding: 2px 2px 8px;
    flex: 1;
    align-content: start;
  }

  .empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 48px;
    color: var(--text-muted);
    gap: 12px;
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    background: var(--bg-input);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .empty-state p {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--text-secondary);
  }

  .empty-state span {
    font-size: 13px;
    color: var(--text-muted);
  }

  .note-card {
    border-radius: 16px;
    padding: 14px 14px 10px;
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--border-color);
    text-align: left;
    min-height: 176px;
    height: auto;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease,
      border-color 0.18s ease;
    position: relative;
    overflow: hidden;
    color: var(--text-primary);
  }

  .note-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-soft);
    border-color: color-mix(in srgb, var(--accent-color) 55%, var(--border-color));
  }

  .note-card:active {
    transform: scale(0.98);
  }

  .note-card.colored {
    --text-primary: #1f2937;
    --text-secondary: #374151;
    color: var(--text-primary);
    border-color: rgba(0, 0, 0, 0.05);
  }

  .note-card.imported::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #a855f7, #6366f1);
  }

  .note-top {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .note-card h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .note-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 6px;
  }

  .badge-type {
    background: var(--bg-input);
    color: var(--text-secondary);
  }

  .badge-rcx {
    background: var(--bg-purple-subtle);
    color: var(--purple-color);
  }

  .note-preview {
    flex: 1;
    overflow: hidden;
  }

  .note-preview p {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .todo-preview {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .preview-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 0;
  }

  .preview-item > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview-item span.completed {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .checkbox-sm {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1.5px solid var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
    background: transparent;
    padding: 0;
    transition: background 0.15s ease;
  }

  .checkbox-sm.checked {
    background: var(--success-color);
    border-color: var(--success-color);
  }

  .more-items {
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
  }

  .note-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 16px;
  }

  .footer-spacer {
    flex: 1;
  }

  .note-date {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 500;
    white-space: nowrap;
  }

  .todo-progress {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .progress-track {
    height: 4px;
    border-radius: 999px;
    background: var(--bg-input);
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .progress-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--success-color);
    transition: width 0.3s ease;
  }

  .progress-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  /* Add menu */
  .add-menu {
    padding: 22px 20px;
  }

  .add-menu h3 {
    margin: 0 0 20px;
    font-size: 18px;
    text-align: center;
    color: var(--text-primary);
  }

  .menu-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .menu-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 18px 12px;
    background: var(--bg-card);
    border-radius: 18px;
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition: transform 0.16s ease, box-shadow 0.16s ease,
      border-color 0.16s ease;
  }

  .menu-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
    border-color: color-mix(in srgb, var(--accent-color) 60%, var(--border-color));
  }

  .menu-btn:active {
    transform: scale(0.97);
  }

  .menu-icon {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .menu-icon.text {
    background: linear-gradient(135deg, #c084fc, #a855f7);
  }

  .menu-icon.todo {
    background: linear-gradient(135deg, #2dd4bf, #0d9488);
  }

  .menu-icon.import {
    background: linear-gradient(135deg, #818cf8, #4f46e5);
  }

  .menu-icon.paste {
    background: linear-gradient(135deg, #34d399, #059669);
  }

  .menu-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .menu-label span {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .menu-label small {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Editor Overlay */
  .editor-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-card);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px;
    background: color-mix(in srgb, var(--bg-card) 55%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-primary);
    transition: background 0.15s ease;
  }

  .icon-btn:active {
    background: var(--bg-input);
  }

  .save-btn {
    background: var(--accent-strong);
    color: var(--accent-ink);
    box-shadow: var(--shadow-button);
  }

  .save-btn:active {
    background: var(--accent-strong);
  }

  .color-picker-wrapper {
    position: relative;
  }

  .color-options {
    display: flex;
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--bg-card-raised);
    padding: 8px;
    border-radius: 14px;
    box-shadow: var(--shadow-soft);
    width: 164px;
    flex-wrap: wrap;
    gap: 6px;
    z-index: 20;
    border: 1px solid var(--border-color);
  }

  .color-circle {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid transparent;
    transition: transform 0.12s ease;
  }

  .color-circle.selected {
    border-color: var(--text-primary);
    transform: scale(1.1);
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .title-input {
    font-size: 24px;
    font-weight: 700;
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    font-family: inherit;
    color: var(--text-primary);
  }

  .title-input::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }

  .editor-overlay.colored {
    --text-primary: #1f2937;
    --text-secondary: #374151;
  }

  .content-textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-size: 16px;
    line-height: 1.6;
    font-family: inherit;
    color: var(--text-primary);
  }

  .todo-stats {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .todo-stats > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .todo-stats .progress-track {
    max-width: 120px;
  }

  .todo-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .todo-row,
  .add-item-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .checkbox-md {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 2px solid var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .checkbox-md.checked {
    background: var(--success-color);
    border-color: var(--success-color);
  }

  .todo-row input,
  .add-item-row input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 16px;
    font-family: inherit;
    padding: 8px 0;
    color: var(--text-primary);
  }

  .todo-row input.completed {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .remove-btn {
    padding: 4px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .add-item-row {
    background: var(--bg-input);
    border-radius: 12px;
    padding: 4px 8px 4px 14px;
    gap: 8px;
  }

  .add-item-row input {
    padding: 6px 0;
  }

  .add-btn {
    background: var(--accent-strong);
    color: var(--accent-ink);
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
  }

  .add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

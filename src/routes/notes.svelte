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
  } from "lucide-svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import { useSwipe } from "svelte-gestures";

  let searchQuery = $state("");
  let showAddMenu = $state(false);
  let showEditor = $state(false);

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
        return (
          (note.title && note.title.toLowerCase().includes(query)) ||
          (note.content && note.content.toLowerCase().includes(query)) ||
          (note.items &&
            note.items.some((i) => i.text.toLowerCase().includes(query)))
        );
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  );

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
      alert("No se pudo identificar el usuario para guardar la nota");
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
      alert("Error al guardar la nota");
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
    if (confirm("¿Estás seguro de eliminar esta nota?")) {
      await deleteNote($userStore.uid, currentNoteId);
      closeEditor();
    }
  }

  // Format date helper
  function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
</script>

<div class="notes-page">
  <header>
    <div class="header-row">
      <h1>Notas</h1>
    </div>
    <div class="search-bar">
      <Search size={20} color="#878787" />
      <input
        type="text"
        placeholder="Buscar notas..."
        bind:value={searchQuery}
      />
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
    {:else}
      {#each filteredNotes as note (note.id)}
        <button
          class="note-card"
          style="background-color: {note.color === '#ffffff' || !note.color
            ? 'var(--bg-card)'
            : note.color}"
          onclick={() => openEditor(null, note)}
        >
          {#if note.title}
            <h3>{note.title}</h3>
          {/if}

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
                {#if (note.items || []).length > 4}
                  <span class="more-items">... {note.items.length - 4} más</span
                  >
                {/if}
              </div>
            {:else}
              <p>{note.content || "Sin contenido"}</p>
            {/if}
          </div>

          <div class="note-footer">
            <span class="note-date">{formatDate(note.createdAt)}</span>
          </div>
        </button>
      {/each}
    {/if}
  </div>

  <button class="fab" onclick={() => (showAddMenu = true)}>
    <Plus size={24} />
  </button>

  <SliceContainer bind:show={showAddMenu}>
    <div class="add-menu">
      <h3>Crear nueva</h3>
      <div class="menu-options">
        <button class="menu-btn" onclick={() => openEditor("text")}>
          <div class="menu-icon text">
            <Type size={24} />
          </div>
          <span>Texto</span>
        </button>
        <button class="menu-btn" onclick={() => openEditor("todo")}>
          <div class="menu-icon todo">
            <CheckSquare size={24} />
          </div>
          <span>Lista</span>
        </button>
      </div>
    </div>
  </SliceContainer>

  <!-- Full Screen Editor Overlay -->
  {#if showEditor}
    <div class="editor-overlay" style="background-color: {noteColor}">
      <div class="editor-header">
        <button class="icon-btn" onclick={saveNote} aria-label="Atrás">
          <ArrowLeft size={24} color="#333" />
        </button>
        <div class="editor-actions">
          <div class="color-picker-wrapper">
            <button class="icon-btn" aria-label="Color">
              <Palette size={22} color="#333" />
            </button>
            <div class="color-options">
              {#each colors as color}
                <button
                  class="color-circle"
                  style="background-color: {color}; border: {noteColor === color
                    ? '2px solid #333'
                    : '1px solid #ddd'}"
                  onclick={() => (noteColor = color)}
                  aria-label="Color"
                ></button>
              {/each}
            </div>
          </div>
          <button class="icon-btn save-btn" onclick={saveNote} aria-label="Guardar">
            <Check size={22} color="#333" />
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

  header {
    margin-bottom: 24px;
    flex-shrink: 0;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .search-bar {
    background: var(--bg-card);
    border-radius: 12px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .search-bar input {
    border: none;
    outline: none;
    background: none;
    font-size: 15px;
    flex: 1;
    color: var(--text-primary);
  }

  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
    overflow-y: auto;
    padding-bottom: 8px;
    flex: 1;
  }

  .empty-state {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 60px;
    color: #aaa;
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
    color: #bdbdbd;
  }

  .empty-state p {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: #878787;
  }

  .note-card {
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid rgba(0, 0, 0, 0.03);
    text-align: left;
    height: 180px; /* Fixed height for masonry-like feel */
    cursor: pointer;
    transition: transform 0.2s;
    position: relative;
    overflow: hidden;
  }

  .note-card:active {
    transform: scale(0.98);
  }

  .note-card h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    display: -webkit-box;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
    line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .todo-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .preview-item span.completed {
    text-decoration: line-through;
    color: #999;
  }

  .checkbox-sm {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1.5px solid #878787;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
    background: transparent;
    padding: 0;
  }

  .checkbox-sm.checked {
    background: #878787;
    border-color: #878787;
  }

  .more-items {
    font-size: 11px;
    color: #878787;
    font-style: italic;
  }

  .note-date {
    font-size: 10px;
    color: rgba(0, 0, 0, 0.4);
    font-weight: 500;
  }

  .fab {
    position: absolute;
    bottom: var(--floating-action-bottom);
    right: 24px;
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #333 0%, #000 100%);
    border-radius: 50%;
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: transform 0.2s;
  }

  .fab:active {
    transform: scale(0.9);
  }

  .add-menu {
    padding: 20px;
  }

  .add-menu h3 {
    margin: 0 0 24px;
    font-size: 18px;
    text-align: center;
  }

  .menu-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .menu-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    background: var(--bg-input);
    border-radius: 16px;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
  }

  .menu-btn:active {
    background: #eee;
  }

  .menu-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .menu-icon.text {
    background: #ab47bc;
  }

  .menu-icon.todo {
    background: #26a69a;
  }

  .menu-btn span {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
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
    padding: 16px 12px;
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
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
  }

  .icon-btn:active {
    background: var(--bg-input);
  }

  .color-picker-wrapper {
    position: relative;
  }

  .color-picker-wrapper:hover .color-options {
    display: flex;
  }

  .color-options {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--bg-card);
    padding: 8px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    width: 160px;
    flex-wrap: wrap;
    gap: 6px;
    z-index: 20;
  }

  .color-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
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
    border: 2px solid #878787;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    padding: 0;
    flex-shrink: 0;
  }

  .checkbox-md.checked {
    background: #878787;
    border-color: #878787;
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
    color: #333;
  }

  .todo-row input.completed {
    text-decoration: line-through;
    color: #999;
  }

  .remove-btn {
    padding: 4px;
    background: transparent;
    border: none;
    color: #bbb;
    cursor: pointer;
  }

  .add-item-row input {
    color: #666;
  }

  .add-btn {
    background: #333;
    color: white;
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

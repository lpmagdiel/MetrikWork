<script>
  import {
    Package,
    Plus,
    Search,
    Edit2,
    Trash2,
    AlertTriangle,
    X,
    Save,
    ChevronLeft,
    Image as ImageIcon
  } from "lucide-svelte";
  import {
    inventoryStore,
    addProduct,
    updateProduct,
    deleteProduct,
    selectedTeamId,
    selectedTeam,
    userStore,
    subscribeToTeamInventory,
    hasTeamPermission,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { uploader, resizer } from "../data/fileHelper.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Product from "../components/Product.svelte";

  const CLOUDINARY_PRESET_INVENTARY =
    import.meta.env.CLOUDINARY_PRESET_INVENTARY || "MetricWorkInventary";

  let searchTerm = $state("");
  let teamId = $derived($selectedTeamId);
  let team = $derived($selectedTeam);
  let canViewInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "view"));
  let canCreateInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "create"));
  let canEditInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "edit"));
  let canDeleteInventory = $derived(hasTeamPermission(team, $userStore?.uid, "inventory", "delete"));
  let showModal = $state(false);
  let editingId = $state(null);
  let fileInput;
  let pendingImageData = $state("");
  let isSaving = $state(false);

  $effect(() => {
    if ($selectedTeamId && canViewInventory) {
      subscribeToTeamInventory($selectedTeamId);
    }
    return () => subscribeToTeamInventory(null);
  });

  // Form Data
  let formData = $state({
    name: "",
    quantity: 0,
    price: 0,
    category: "",
    minStock: 5,
    imageUrl: "",
  });

  // Derived filtered items
  let filteredItems = $derived($inventoryStore.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchTerm.toLowerCase()),
  ));

  // Stats
  let totalItems = $derived($inventoryStore.length);
  let lowStockItems = $derived($inventoryStore.filter(
    (item) => item.quantity <= item.minStock,
  ).length);
  let totalValue = $derived($inventoryStore.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  ));

  function openModal(item = null) {
    if ((item && !canEditInventory) || (!item && !canCreateInventory)) return;
    if (item) {
      editingId = item.id;
      formData = {
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        minStock: item.minStock,
        imageUrl: item.imageUrl || "",
      };
    } else {
      editingId = null;
      formData = {
        name: "",
        quantity: 0,
        price: 0,
        category: "",
        minStock: 5,
        imageUrl: "",
      };
    }
    pendingImageData = "";
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingId = null;
    pendingImageData = "";
    isSaving = false;
  }

  function openFilePicker() {
    fileInput && fileInput.click();
  }

  async function handleImageChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Selecciona un archivo de imagen válido");
      e.target.value = null;
      return;
    }

    try {
      const imageData = await readFileAsDataUrl(file);
      const resizedImage = await resizer(imageData, 700);
      pendingImageData = resizedImage;
      formData.imageUrl = resizedImage;
    } catch (error) {
      console.error("Error processing product image", error);
      alert("No se pudo cargar la imagen");
    } finally {
      e.target.value = null;
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function removeProductImage() {
    formData.imageUrl = "";
    pendingImageData = "";
  }

  async function handleSubmit() {
    if (!$selectedTeamId) {
      alert("Por favor selecciona un equipo primero");
      return;
    }
    if ((editingId && !canEditInventory) || (!editingId && !canCreateInventory)) return;
    if (isSaving) return;
    isSaving = true;
    try {
      const productData = { ...formData };
      if (pendingImageData) {
        productData.imageUrl = await uploader(
          pendingImageData,
          CLOUDINARY_PRESET_INVENTARY,
        );
      }
      if (editingId) {
        await updateProduct($selectedTeamId, editingId, productData);
      } else {
        await addProduct($selectedTeamId, productData);
      }
      closeModal();
    } catch (error) {
      alert("Error al guardar el producto: " + error.message);
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete(id) {
    if (!$selectedTeamId || !canDeleteInventory) return;
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      await deleteProduct($selectedTeamId, id);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  }
</script>

<div class="page-container">
  {#if canCreateInventory}
    <button class="fab" onclick={() => openModal()}>
      <Plus size={30} />
    </button>
  {/if}
  <div class="header">
    <div class="title-group">
    <button class="back-btn" onclick={() => navigateTo(`/teams/${teamId}`)}>
    <ChevronLeft size={24} />
    </button>
      <Package size={32} color="var(--text-primary)" />
      <h1>Inventario</h1>
    </div>
  </div>

  {#if !canViewInventory}
    <div class="empty-state">
      No tienes permiso para ver el inventario de este equipo.
    </div>
  {:else}
    <div class="inventory-resum-container">
      <div class="stat-card">
        <h3>Total Productos</h3>
        <p class="stat-value">{totalItems}</p>
      </div>
      <div class="stat-card warning">
        <h3>Stock Bajo</h3>
        <p class="stat-value">{lowStockItems}</p>
      </div>
      <div class="stat-card">
        <h3>Valor Total</h3>
        <p class="stat-value">{formatCurrency(totalValue)}</p>
      </div>
    </div>

    <div class="content">
    <div class="toolbar">
      <div class="search-bar">
        <Search size={20} color="var(--text-secondary)" />
        <input
          type="text"
          placeholder="Buscar producto..."
          bind:value={searchTerm}
        />
      </div>
    </div>

    <div class="table-container">
      {#each filteredItems as item (item.id)}
        <Product 
          product={item} 
          isEditable={canEditInventory} 
          onEdit={(product) => openModal(product)}
        />
      {/each}
    </div>
    </div>
  {/if}
</div>

<SliceContainer bind:show={showModal}>
  <div class="slice-content">
    <div class="slice-header">
      <h2>{editingId ? "Editar Producto" : "Nuevo Producto"}</h2>
    </div>
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="form-group">
        <label for="product-image">Imagen del Producto</label>
        <div class="image-picker">
          <div class="image-preview">
            {#if formData.imageUrl}
              <img src={formData.imageUrl} alt="Vista previa del producto" />
            {:else}
              <ImageIcon size={28} />
            {/if}
          </div>
          <div class="image-actions">
            <button type="button" class="image-btn" onclick={openFilePicker}>
              <ImageIcon size={18} />
              <span>{formData.imageUrl ? "Cambiar imagen" : "Agregar imagen"}</span>
            </button>
            {#if formData.imageUrl}
              <button type="button" class="remove-image-btn" onclick={removeProductImage}>
                <X size={18} />
              </button>
            {/if}
          </div>
          <input
            bind:this={fileInput}
            id="product-image"
            type="file"
            accept="image/*"
            onchange={handleImageChange}
            style="display:none"
          />
        </div>
      </div>

      <div class="form-group">
        <label for="name">Nombre del Producto</label>
        <input
          id="name"
          type="text"
          bind:value={formData.name}
          required
          placeholder="Ej. Laptop HP"
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="category">Categoría</label>
          <input
            id="category"
            type="text"
            bind:value={formData.category}
            placeholder="Ej. Electrónica"
          />
        </div>
        <div class="form-group">
          <label for="price">Precio</label>
          <div class="input-with-icon">
            <span class="currency-symbol">$</span>
            <input
              id="price"
              type="number"
              bind:value={formData.price}
              min="0"
              step="0.01"
              required
            />
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="quantity">Cantidad Actual</label>
          <input
            id="quantity"
            type="number"
            bind:value={formData.quantity}
            min="0"
            required
          />
        </div>
        <div class="form-group">
          <label for="minStock">Stock Mínimo</label>
          <input
            id="minStock"
            type="number"
            bind:value={formData.minStock}
            min="0"
            required
          />
        </div>
      </div>

      <div class="slice-actions">
        <button type="submit" class="save-btn block-btn" disabled={isSaving}>
          {#if isSaving}
            <span>Guardando...</span>
          {:else}
            <Save size={20} />
            <span>{editingId ? "Actualizar" : "Guardar"}</span>
          {/if}
        </button>
        <div class="center">
          <button
          class="icon-btn delete block-btn"
          onclick={() => handleDelete(editingId)}
        >
          <Trash2 size={18} />
          <span>Eliminar</span>
        </button>
        </div>
      </div>
    </form>

  </div>
</SliceContainer>

<style>
  .page-container {
    padding: 24px 20px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
    overflow-y: auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .back-btn {
    background: var(--bg-card);
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
    cursor: pointer;
    color: var(--text-primary);
  }
  .title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  h1 {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }


  .inventory-resum-container {
    display: flex;
    gap: 8px;
  }
  .fab {
    position: fixed;
    bottom: var(--floating-action-bottom);
    right: 24px;
    width: 60px;
    height: 60px;
    background: var(--accent-strong);
    color: #ffffff;
    border: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 80;
  }

  .fab:active {
    transform: scale(0.9);
  }

  .fab:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
  .stat-card {
    flex: 1;
    min-width: 0;
    background: var(--bg-card);
    padding: 20px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    border-left: 4px solid var(--accent-color);
  }

  .stat-card.warning {
    border-left-color: var(--warning-color);
  }

  .stat-card h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .stat-value {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .toolbar {
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-input);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    max-width: 300px;
  }

  .search-bar input {
    border: none;
    background: transparent;
    outline: none;
    width: 100%;
    font-size: 14px;
    color: var(--text-primary);
  }

  .table-container {
    overflow-y: scroll;
    gap: 10px;
    display: grid;
    padding-top: 10px;
  }

  .icon-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-sm);
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn.delete {
    color: var(--danger-color);
  }
  .icon-btn.delete:hover {
    background: var(--bg-danger-subtle);
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 40px;
  }

  /* Modal */

  .form-group {
    margin-bottom: 16px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  input {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  input:focus {
    border-color: var(--accent-color);
    outline: none;
  }

  .image-picker {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 14px;
    align-items: center;
  }

  .image-preview {
    width: 96px;
    aspect-ratio: 1;
    border-radius: 14px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .image-actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .image-btn,
  .remove-image-btn {
    border: none;
    border-radius: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s, opacity 0.2s;
  }

  .image-btn {
    min-height: 44px;
    padding: 0 14px;
    gap: 8px;
    background: var(--accent-strong);
    color: var(--bg-card);
    font-weight: 600;
  }

  .remove-image-btn {
    width: 44px;
    height: 44px;
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
  }

  .image-btn:active,
  .remove-image-btn:active {
    transform: scale(0.96);
  }

  /* Slice Styles */
  .slice-content {
    padding: 24px;
    padding-bottom: 40px;
  }

  .slice-header h2 {
    margin: 0 0 24px 0;
    font-size: 20px;
    color: var(--text-primary);
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    font-size: 15px;
    box-sizing: border-box;
    transition: border-color 0.2s;
    background: var(--bg-input);
    color: var(--text-primary);
  }

  @media (max-width: 640px) {
    .header {
      align-items: flex-start;
      flex-direction: column;
    }

    .form-row {
      grid-template-columns: 1fr;
    }
  }

  input:focus {
    border-color: var(--accent-color);
    background: var(--bg-card);
    outline: none;
  }

  .input-with-icon {
    position: relative;
  }

  .currency-symbol {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    font-weight: 500;
  }

  .input-with-icon input {
    padding-left: 28px;
  }

  .slice-actions {
    margin-top: 32px;
  }

  .save-btn.block-btn {
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 16px;
    margin-bottom: 10px;
  }

  .save-btn:hover {
    background: var(--text-primary);
  }

  .save-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
</style>

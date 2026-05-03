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
  } from "lucide-svelte";
  import {
    inventoryStore,
    addProduct,
    updateProduct,
    deleteProduct,
    selectedTeamId,
    subscribeToTeamInventory,
  } from "../data/stores.js";
  import SliceContainer from "../components/SliceContainer.svelte";

  let searchTerm = $state("");
  let showModal = $state(false);
  let editingId = $state(null);

  $effect(() => {
    if ($selectedTeamId) {
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
    if (item) {
      editingId = item.id;
      formData = {
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        minStock: item.minStock,
      };
    } else {
      editingId = null;
      formData = {
        name: "",
        quantity: 0,
        price: 0,
        category: "",
        minStock: 5,
      };
    }
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingId = null;
  }

  async function handleSubmit() {
    if (!$selectedTeamId) {
      alert("Por favor selecciona un equipo primero");
      return;
    }
    try {
      if (editingId) {
        await updateProduct($selectedTeamId, editingId, formData);
      } else {
        await addProduct($selectedTeamId, formData);
      }
      closeModal();
    } catch (error) {
      alert("Error al guardar el producto: " + error.message);
    }
  }

  async function handleDelete(id) {
    if (!$selectedTeamId) return;
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
  <div class="header">
    <div class="title-group">
      <Package size={32} color="var(--text-primary)" />
      <h1>Inventario</h1>
    </div>
    <button class="primary-btn" onclick={() => openModal()}>
      <Plus size={20} />
      <span>Nuevo Producto</span>
    </button>
  </div>

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
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredItems as item (item.id)}
            <tr>
              <td><span class="product-name">{item.name}</span></td>
              <td
                ><span class="category-tag">{item.category || "General"}</span
                ></td
              >
              <td>{formatCurrency(item.price)}</td>
              <td>{item.quantity}</td>
              <td>
                {#if item.quantity <= item.minStock}
                  <span class="status-badge low">
                    <AlertTriangle size={14} /> Bajo
                  </span>
                {:else}
                  <span class="status-badge ok">OK</span>
                {/if}
              </td>
              <td>
                <div class="actions">
                  <button
                    class="icon-btn edit"
                    onclick={() => openModal(item)}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    class="icon-btn delete"
                    onclick={() => handleDelete(item.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
          {#if filteredItems.length === 0}
            <tr>
              <td colspan="6" class="empty-state">
                No se encontraron productos
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<SliceContainer bind:show={showModal}>
  <div class="slice-content">
    <div class="slice-header">
      <h2>{editingId ? "Editar Producto" : "Nuevo Producto"}</h2>
    </div>
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
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
        <button type="submit" class="save-btn block-btn">
          <Save size={20} />
          <span>{editingId ? "Actualizar" : "Guardar"}</span>
        </button>
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

  .primary-btn {
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    padding: 10px 20px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }

  .primary-btn:hover {
    background: var(--text-primary);
    transform: translateY(-1px);
  }

  .inventory-resum-container {
    display: flex;
    gap: 8px;
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
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .content {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
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
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 16px;
    background: var(--bg-input);
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  td {
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
    font-size: 14px;
  }

  .product-name {
    font-weight: 600;
    color: var(--text-primary);
  }

  .category-tag {
    background: var(--bg-input);
    color: var(--text-secondary);
    padding: 4px 8px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }

  .status-badge.ok {
    background: var(--bg-success-subtle);
    color: var(--success-color);
  }

  .status-badge.low {
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .actions {
    display: flex;
    gap: 8px;
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

  .icon-btn.edit {
    color: var(--info-color);
  }
  .icon-btn.edit:hover {
    background: var(--bg-info-subtle);
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

    .primary-btn {
      width: 100%;
      justify-content: center;
    }

    .inventory-resum-container {
      display: grid;
      grid-template-columns: 1fr;
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
  }

  .save-btn:hover {
    background: var(--text-primary);
  }
</style>

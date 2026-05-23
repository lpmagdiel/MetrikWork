<script>
  import {
    Package,
    Plus,
    Search,
    Trash2,
    X,
    Save,
    ChevronLeft,
    Image as ImageIcon,
    Wrench,
    Boxes,
    ArrowRight,

    Archive,

    DollarSign,

    Wallet,
    MapPin,
    TriangleAlert,
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
    teamLocationsStore,
    subscribeToTeamLocations,
    createNotification,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { uploader, resizer } from "../data/fileHelper.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Product from "../components/Product.svelte";
  import BadgetButton from "../components/BadgetButton.svelte";
  import { confirmAlert, showErrorAlert, showInfoAlert, showSuccessAlert } from "../data/alerts.js";
  import CircleAddButton from "../components/CircleAddButton.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { optimizeCloudinary } from "../helpers/image.js";

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
  let showReportModal = $state(false);
  let reportProduct = $state(null);
  let reportDescription = $state("");
  let isReporting = $state(false);
  let selectedInventoryType = $state("material");

  const inventoryTypes = [
    {
      value: "tool",
      title: "Herramientas",
      description: "Elementos no consumibles",
      Icon: Wrench,
    },
    {
      value: "material",
      title: "Productos",
      description: "Materiales y consumibles",
      Icon: Boxes,
    },
  ];

  function goToTeamHome() {
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  $effect(() => {
    if ($selectedTeamId && canViewInventory) {
      subscribeToTeamInventory($selectedTeamId);
    }
    return () => subscribeToTeamInventory(null);
  });

  $effect(() => {
    if ($selectedTeamId && canViewInventory) {
      subscribeToTeamLocations($selectedTeamId);
    }
    return () => subscribeToTeamLocations(null);
  });

  // Form Data
  let formData = $state({
    name: "",
    quantity: 0,
    price: 0,
    category: "",
    minStock: 5,
    imageUrl: "",
    productType: "material",
    locationId: "",
    locationName: "",
  });

  function getProductType(item) {
    return item.productType || "material";
  }

  function getTypeCount(type) {
    return $inventoryStore.filter((item) => getProductType(item) === type).length;
  }

  function getProductLocationName(item) {
    return (
      $teamLocationsStore.find((location) => location.id === item.locationId)?.name ||
      item.locationName ||
      ""
    );
  }

  let currentTypeLabel = $derived(
    inventoryTypes.find((type) => type.value === selectedInventoryType)?.title || "Inventario",
  );

  let typeFilteredItems = $derived($inventoryStore.filter(
    (item) => getProductType(item) === selectedInventoryType,
  ));

  let filteredItems = $derived(typeFilteredItems.filter(
    (item) => {
      const normalizedSearch = searchTerm.toLowerCase();
      return (
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.category?.toLowerCase().includes(normalizedSearch) ||
        getProductLocationName(item).toLowerCase().includes(normalizedSearch)
      );
    },
  ));

  // Stats
  let totalItems = $derived(typeFilteredItems.length);
  let lowStockItems = $derived(typeFilteredItems.filter(
    (item) => item.quantity <= item.minStock,
  ).length);
  let totalValue = $derived(typeFilteredItems.reduce(
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
        productType: item.productType || "material",
        locationId: item.locationId || "",
        locationName: item.locationName || "",
      };
      selectedInventoryType = formData.productType;
    } else {
      editingId = null;
      formData = {
        name: "",
        quantity: 0,
        price: 0,
        category: "",
        minStock: 5,
        imageUrl: "",
        productType: selectedInventoryType,
        locationId: "",
        locationName: "",
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
      showInfoAlert("Archivo no válido", "Selecciona un archivo de imagen válido");
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
      showErrorAlert("Error", "No se pudo cargar la imagen");
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

  function openReportModal(product) {
    reportProduct = product;
    reportDescription = "";
    showReportModal = true;
  }

  function closeReportModal() {
    showReportModal = false;
    reportProduct = null;
    reportDescription = "";
    isReporting = false;
  }

  function getReporterName() {
    return $userStore?.name || $userStore?.displayName || $userStore?.email || "Un miembro";
  }

  function getReportRecipients() {
    const reporterId = $userStore?.uid;
    const members = Array.isArray(team?.members) ? team.members : [];
    const recipients = members.filter((memberId) => memberId && memberId !== reporterId);
    return recipients.length ? recipients : reporterId ? [reporterId] : [];
  }

  async function handleReportProblem() {
    if (!reportProduct || !reportDescription.trim() || isReporting) return;

    const recipients = getReportRecipients();
    if (!recipients.length) {
      showErrorAlert("Error", "No se pudo encontrar a quién notificar.");
      return;
    }

    isReporting = true;
    try {
      const reporter = getReporterName();
      const reportDate = new Date().toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const locationText = reportProduct.locationName
        ? `\nUbicación: ${reportProduct.locationName}`
        : "";
      const message = `Producto: ${reportProduct.name}${locationText}\nProblema: ${reportDescription.trim()}\nReportado por: ${reporter}\nFecha: ${reportDate}`;

      await Promise.all(
        recipients.map((recipientId) =>
          createNotification(recipientId, "Problema reportado en inventario", message, {
            type: "inventory-problem",
            sourceId: reportProduct.id,
            teamId,
            url: `/teams/${teamId}/inventory`,
          }),
        ),
      );

      closeReportModal();
      showSuccessAlert("Listo", "Problema reportado correctamente.");
    } catch (error) {
      console.error("Error reporting product problem:", error);
      showErrorAlert("Error", "No se pudo reportar el problema.");
    } finally {
      isReporting = false;
    }
  }

  async function handleSubmit() {
    if (!$selectedTeamId) {
      showInfoAlert("Selecciona un equipo", "Por favor selecciona un equipo primero");
      return;
    }
    if ((editingId && !canEditInventory) || (!editingId && !canCreateInventory)) return;
    if (isSaving) return;
    isSaving = true;
    try {
      const productData = {
        ...formData,
        productType: formData.productType || selectedInventoryType,
        locationName:
          $teamLocationsStore.find((location) => location.id === formData.locationId)?.name ||
          "",
      };
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
      selectedInventoryType = productData.productType;
      closeModal();
    } catch (error) {
      showErrorAlert("Error al guardar el producto", error.message);
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete(id) {
    if (!$selectedTeamId || !canDeleteInventory) return;
    const confirmed = await confirmAlert({
      title: "Eliminar producto",
      text: "¿Estás seguro de eliminar este producto?",
      confirmButtonText: "Eliminar",
      danger: true,
    });
    if (!confirmed) return;
    await deleteProduct($selectedTeamId, id);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: team?.projectBudgetCurrency || "MXN",
    }).format(Number(amount) || 0);
  }
</script>

<div class="page-container">
  {#if canCreateInventory}
    <CircleAddButton onClick={() => openModal()} floating={true} />
  {/if}
  <div class="header">
      <TitleHeader title="Inventario" description={$selectedTeam?.name || ""} action={goToTeamHome}/>
  </div>

  {#if !canViewInventory}
    <div class="empty-state">
      No tienes permiso para ver el inventario de este equipo.
    </div>
  {:else}
    <div class="inventory-resum-container">
      <BadgetButton text={`Total: ${totalItems}`} >
        <Package size={24} color="var(--text-primary)" />
      </BadgetButton>
      <BadgetButton text={`Bajos: ${lowStockItems}`} >
        <Archive size={24} color="var(--text-primary)" />
      </BadgetButton>
            <BadgetButton text={`${formatCurrency(totalValue)}`} >
        <Wallet size={24} color="var(--text-primary)" />
      </BadgetButton>
    </div>

    <div class="content">
    <div class="toolbar">
      <div class="search-bar">
        <Search size={20} color="var(--text-secondary)" />
        <input
          type="text"
          placeholder={`Buscar en ${currentTypeLabel.toLowerCase()}...`}
          bind:value={searchTerm}
        />
      </div>
    </div>

    <div class="inventory-type-grid" aria-label="Tipos de inventario">
      {#each inventoryTypes as type}
        <button
          class:active={selectedInventoryType === type.value}
          class="inventory-type-card"
          type="button"
          onclick={() => {
            selectedInventoryType = type.value;
            searchTerm = "";
          }}
        >
          <span class="type-icon">
            <svelte:component this={type.Icon} size={28} />
          </span>
          <span class="type-copy">
            <strong>{type.title}</strong>
            <small>{type.description}</small>
          </span>
          <span class="type-meta">
            <span>{getTypeCount(type.value)}</span>
            <ArrowRight size={18} />
          </span>
        </button>
      {/each}
    </div>

    <div class="table-container">
      {#if filteredItems.length}
        {#each filteredItems as item (item.id)}
          <Product
            product={{ ...item, locationName: getProductLocationName(item) }}
            currency={team?.projectBudgetCurrency || "MXN"}
            isEditable={canEditInventory}
            onEdit={(product) => openModal(product)}
            onReport={(product) => openReportModal(product)}
          />
        {/each}
      {:else}
        <div class="empty-state">
          No hay elementos en {currentTypeLabel.toLowerCase()}.
        </div>
      {/if}
    </div>
    </div>
  {/if}
</div>

<SliceContainer bind:show={showReportModal}>
  <div class="slice-content">
    <div class="slice-header">
      <h2>Reportar problema</h2>
    </div>

    {#if reportProduct}
      <div class="report-product-summary">
        <TriangleAlert size={22} />
        <div>
          <strong>{reportProduct.name}</strong>
          {#if reportProduct.locationName}
            <span>{reportProduct.locationName}</span>
          {/if}
        </div>
      </div>

      <div class="form-group">
        <label for="report-description">Descripción del problema</label>
        <textarea
          id="report-description"
          rows="5"
          bind:value={reportDescription}
          placeholder="Describe qué ocurre con este producto..."
        ></textarea>
      </div>

      <div class="slice-actions">
        <button
          type="button"
          class="save-btn block-btn"
          onclick={handleReportProblem}
          disabled={isReporting || !reportDescription.trim()}
        >
          {#if isReporting}
            <span>Enviando...</span>
          {:else}
            <TriangleAlert size={20} />
            <span>Enviar reporte</span>
          {/if}
        </button>
      </div>
    {/if}
  </div>
</SliceContainer>

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
              <img src={optimizeCloudinary(formData.imageUrl, 200)} alt="Vista previa del producto" loading="lazy" />
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

      <div class="form-group">
        <label>Tipo de inventario</label>
        <div class="type-selector">
          {#each inventoryTypes as type}
            <button
              type="button"
              class:active={formData.productType === type.value}
              onclick={() => (formData.productType = type.value)}
            >
              <svelte:component this={type.Icon} size={18} />
              <span>{type.title}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="locationId">Ubicación</label>
        <div class="select-with-icon">
          <MapPin size={18} />
          <select id="locationId" bind:value={formData.locationId}>
            <option value="">Sin ubicación</option>
            {#each $teamLocationsStore as location (location.id)}
              <option value={location.id}>{location.name}</option>
            {/each}
          </select>
        </div>
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



  .inventory-resum-container {
    display: flex;
    gap: 5px;
    width: 100%;
    justify-content: space-between;
    align-items: center;
  }

  .inventory-type-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .inventory-type-card {
    min-height: 118px;
    width: 100%;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    color: var(--text-primary);
    cursor: pointer;
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 18px;
    text-align: left;
  }

  .inventory-type-card:hover {
    border-color: color-mix(in srgb, var(--accent-color) 55%, var(--border-color));
    box-shadow: var(--shadow-soft);
    transform: translateY(-1px);
  }

  .inventory-type-card.active {
    border-color: var(--accent-color);
    background: color-mix(in srgb, var(--bg-accent-subtle) 24%, var(--bg-card));
    box-shadow: var(--shadow-soft);
  }

  .type-icon {
    width: 50px;
    aspect-ratio: 1;
    border-radius: 14px;
    background: var(--bg-input);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .inventory-type-card.active .type-icon {
    background: var(--accent-strong);
    color: var(--bg-card);
  }

  .type-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .type-copy strong {
    font-size: 17px;
    line-height: 1.15;
    color: var(--text-primary);
  }

  .type-copy small {
    font-size: 13px;
    line-height: 1.25;
    color: var(--text-secondary);
  }

  .type-meta {
    min-width: 54px;
    min-height: 34px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 13px;
    font-weight: 800;
  }

  .inventory-type-card.active .type-meta {
    background: var(--bg-card);
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

  .table-container .empty-state {
    background: var(--bg-card);
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
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

  textarea {
    width: 100%;
    min-height: 132px;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-primary);
    box-sizing: border-box;
    font-size: 15px;
    line-height: 1.4;
    resize: vertical;
    outline: none;
  }

  textarea:focus {
    border-color: var(--accent-color);
    background: var(--bg-card);
  }

  .report-product-summary {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding: 14px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-warning-subtle);
    color: var(--warning-color);
  }

  .report-product-summary div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .report-product-summary strong {
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.25;
  }

  .report-product-summary span {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.25;
  }

  .select-with-icon {
    width: 100%;
    min-height: 48px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    box-sizing: border-box;
  }

  .select-with-icon:focus-within {
    border-color: var(--accent-color);
    background: var(--bg-card);
  }

  .select-with-icon select {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: 15px;
    min-width: 0;
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

  .type-selector {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .type-selector button {
    min-height: 48px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-input);
    color: var(--text-secondary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 700;
  }

  .type-selector button.active {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
    color: var(--bg-card);
  }

  @media (max-width: 640px) {
    .header {
      align-items: flex-start;
      flex-direction: column;
    }

    .inventory-resum-container,
    .inventory-type-grid,
    .form-row {
      grid-template-columns: 1fr;
    }

    .inventory-type-card {
      min-height: 104px;
      padding: 16px;
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

<script>
  import { onDestroy } from "svelte";
  import {
    Copy,
    Folder,
    FolderPlus,
    Image as ImageIcon,
    Images,
    Link,
    LoaderCircle,
    QrCode,
    Search,
    Share2,
    Trash2,
    Upload,
    X,
  } from "lucide-svelte";
  import QRCode from "qrcode";
  import {
    addGalleryImages,
    createGalleryFolder,
    deleteGalleryFolder,
    deleteGalleryImage,
    ensureGalleryShare,
    galleryFoldersStore,
    galleryImagesStore,
    selectedTeam,
    selectedTeamId,
    subscribeToTeamGallery,
    updateGalleryImageName,
    userStore,
  } from "../data/stores.js";
  import { navigateTo } from "../router.js";
  import { openSliceContainers } from "../data/ui.js";
  import { destroyer, resizeImageFile, uploader } from "../data/fileHelper.js";
  import { confirmAlert, promptAlert, showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import { optimizeCloudinary, stripImageFileExtension } from "../helpers/image.js";
  import BadgetButton from "../components/BadgetButton.svelte";
  import GalleryImage from "../components/GalleryImage.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import TitleHeader from "../components/TitleHeader.svelte";

  const CLOUDINARY_PRESET_GALLERY =
    import.meta.env.VITE_CLOUDINARY_PRESET_GALLERY ||
    import.meta.env.CLOUDINARY_PRESET_GALLERY ||
    "MetricWork";

  let teamId = $derived($selectedTeamId);
  let selectedFolderId = $state("all");
  let searchTerm = $state("");
  let isUploading = $state(false);
  let uploadProgress = $state("");
  let fileInput;
  let showShare = $state(false);
  let shareUrl = $state("");
  let qrCodeUrl = $state("");
  let isPreparingShare = $state(false);
  let lightboxImage = $state(null);
  let lightboxRegistered = false;

  let selectedFolder = $derived(
    $galleryFoldersStore.find((folder) => folder.id === selectedFolderId) || null,
  );

  let filteredImages = $derived($galleryImagesStore.filter((image) => {
    const belongsToFolder = selectedFolderId === "all"
      || (selectedFolderId === "root" && !image.folderId)
      || image.folderId === selectedFolderId;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch = !normalizedSearch
      || String(image.name || "").toLowerCase().includes(normalizedSearch);
    return belongsToFolder && matchesSearch;
  }));

  $effect(() => {
    if (!teamId) return;
    return subscribeToTeamGallery(teamId);
  });

  $effect(() => {
    const shouldRegister = Boolean(lightboxImage);
    if (shouldRegister === lightboxRegistered) return;

    openSliceContainers.update((count) =>
      Math.max(0, count + (shouldRegister ? 1 : -1)),
    );
    lightboxRegistered = shouldRegister;
  });

  onDestroy(() => {
    if (!lightboxRegistered) return;
    openSliceContainers.update((count) => Math.max(0, count - 1));
  });

  function goToTeamHome() {
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }

  function getFolderName(folderId) {
    if (!folderId) return "Sin carpeta";
    return $galleryFoldersStore.find((folder) => folder.id === folderId)?.name || "Carpeta";
  }

  function getFolderCount(folderId) {
    if (folderId === "all") return $galleryImagesStore.length;
    if (folderId === "root") return $galleryImagesStore.filter((image) => !image.folderId).length;
    return $galleryImagesStore.filter((image) => image.folderId === folderId).length;
  }

  function chooseFolder(folderId) {
    selectedFolderId = folderId;
    searchTerm = "";
  }

  async function createFolder() {
    const name = await promptAlert({
      title: "Nueva carpeta",
      inputLabel: "Nombre de la carpeta",
      inputPlaceholder: "Ej. Obra terminada",
      confirmButtonText: "Crear carpeta",
    });
    if (!name) return;

    try {
      const folderId = await createGalleryFolder(teamId, name, $userStore?.uid);
      selectedFolderId = folderId;
      showSuccessAlert("Carpeta creada", `Ya puedes guardar imágenes en ${name}.`, { timer: 1800 });
    } catch (error) {
      showErrorAlert("No se pudo crear", error.message || "Inténtalo de nuevo");
    }
  }

  async function removeSelectedFolder() {
    if (!selectedFolder) return;
    const confirmed = await confirmAlert({
      title: `¿Eliminar ${selectedFolder.name}?`,
      text: "Solo se puede eliminar una carpeta vacía.",
      confirmButtonText: "Eliminar carpeta",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteGalleryFolder(teamId, selectedFolder.id);
      selectedFolderId = "all";
      showSuccessAlert("Carpeta eliminada", "La galería se ha actualizado.", { timer: 1600 });
    } catch (error) {
      showErrorAlert("No se pudo eliminar", error.message || "Inténtalo de nuevo");
    }
  }

  function openFilePicker() {
    if (!isUploading) fileInput?.click();
  }

  async function handleFiles(event) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      showErrorAlert("Archivos no válidos", "Selecciona una o varias imágenes.");
      return;
    }

    isUploading = true;
    const uploadedImages = [];
    const folderId = selectedFolderId === "all" || selectedFolderId === "root"
      ? ""
      : selectedFolderId;

    try {
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        uploadProgress = `Subiendo ${index + 1} de ${imageFiles.length}`;
        try {
          const resized = await resizeImageFile(file, 1800, {
            type: "image/webp",
            quality: 0.82,
          });
          const url = await uploader(resized, CLOUDINARY_PRESET_GALLERY);
          uploadedImages.push({ url, name: file.name, folderId });
        } catch (error) {
          console.error("Error uploading gallery image:", error);
        }
      }

      if (uploadedImages.length) {
        await addGalleryImages(teamId, uploadedImages, $userStore?.uid);
      }

      if (uploadedImages.length === imageFiles.length) {
        showSuccessAlert(
          uploadedImages.length === 1 ? "Imagen guardada" : "Imágenes guardadas",
          `${uploadedImages.length} ${uploadedImages.length === 1 ? "imagen añadida" : "imágenes añadidas"} a la galería.`,
          { timer: 1800 },
        );
      } else {
        showErrorAlert(
          "Carga incompleta",
          `Se guardaron ${uploadedImages.length} de ${imageFiles.length} imágenes.`,
        );
      }
    } catch (error) {
      showErrorAlert("No se pudieron guardar", error.message || "Inténtalo de nuevo");
    } finally {
      isUploading = false;
      uploadProgress = "";
    }
  }

  async function removeImage(image) {
    const confirmed = await confirmAlert({
      title: "¿Eliminar esta imagen?",
      text: stripImageFileExtension(
        image.name,
        "La imagen dejará de aparecer también en el enlace compartido.",
      ),
      confirmButtonText: "Eliminar imagen",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteGalleryImage(teamId, image.id);
      destroyer(image.url).catch((error) => console.warn("Cloud image cleanup failed:", error));
      if (lightboxImage?.id === image.id) lightboxImage = null;
    } catch (error) {
      showErrorAlert("No se pudo eliminar", error.message || "Inténtalo de nuevo");
    }
  }

  async function renameImage(image) {
    const name = await promptAlert({
      title: "Cambiar nombre",
      inputLabel: "Nombre de la imagen",
      inputPlaceholder: "Escribe un nombre",
      inputValue: stripImageFileExtension(image.name, ""),
      confirmButtonText: "Guardar nombre",
    });
    if (!name || name === stripImageFileExtension(image.name, "")) return;

    try {
      await updateGalleryImageName(teamId, image.id, name);
      showSuccessAlert("Nombre actualizado", "La galería compartida también se ha actualizado.", { timer: 1600 });
    } catch (error) {
      showErrorAlert("No se pudo cambiar el nombre", error.message || "Inténtalo de nuevo");
    }
  }

  async function openSharePanel() {
    isPreparingShare = true;
    showShare = true;
    try {
      const token = await ensureGalleryShare(teamId);
      shareUrl = `${window.location.origin}/gallery/${token}`;
      qrCodeUrl = await QRCode.toDataURL(shareUrl, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    } catch (error) {
      showShare = false;
      showErrorAlert("No se pudo compartir", error.message || "Inténtalo de nuevo");
    } finally {
      isPreparingShare = false;
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showSuccessAlert("Enlace copiado", "Cualquiera con el enlace podrá ver la galería.", { timer: 1600 });
    } catch {
      showErrorAlert("No se pudo copiar", "Mantén pulsado el enlace para copiarlo.");
    }
  }

  async function shareGallery() {
    if (!navigator.share) {
      await copyShareLink();
      return;
    }

    try {
      await navigator.share({
        title: `Galería · ${$selectedTeam?.name || "MetricWork"}`,
        text: "Galería compartida en modo de solo lectura",
        url: shareUrl,
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        showErrorAlert("No se pudo compartir", "Puedes copiar el enlace manualmente.");
      }
    }
  }
</script>

<div class="gallery-page">
  <header>
    <TitleHeader
      title="Galería"
      description={$selectedTeam?.name || ""}
      action={goToTeamHome}
    />
    <div class="header-actions">
      <button class="secondary-action" type="button" onclick={openSharePanel}>
        <Share2 size={19} />
        <span>Compartir</span>
      </button>
      <button class="primary-action" type="button" onclick={openFilePicker} disabled={isUploading}>
        {#if isUploading}
          <span class="inline-spinner"><LoaderCircle size={20} /></span>
        {:else}
          <Upload size={19} />
        {/if}
        <span>{isUploading ? uploadProgress : "Subir imágenes"}</span>
      </button>
      <input
        class="file-input"
        type="file"
        accept="image/*"
        multiple
        bind:this={fileInput}
        onchange={handleFiles}
      />
    </div>
  </header>

  <section class="folders-section" aria-labelledby="folders-title">
    <div class="section-heading">
      <div>
        <span class="eyebrow">Organización</span>
        <h2 id="folders-title">Carpetas</h2>
      </div>
      {#if selectedFolder}
        <button
          class="delete-folder"
          type="button"
          aria-label={`Eliminar carpeta ${selectedFolder.name}`}
          onclick={removeSelectedFolder}
        >
          <Trash2 size={18} />
        </button>
      {/if}
    </div>

    <div class="folder-strip">
      <button
        class:active={selectedFolderId === "all"}
        class="folder-filter"
        type="button"
        onclick={() => chooseFolder("all")}
      >
        <BadgetButton text={`Todas (${getFolderCount("all")})`}>
          <Images size={24} />
        </BadgetButton>
      </button>
      <button
        class:active={selectedFolderId === "root"}
        class="folder-filter"
        type="button"
        onclick={() => chooseFolder("root")}
      >
        <BadgetButton text={`Sin carpeta (${getFolderCount("root")})`}>
          <ImageIcon size={24} />
        </BadgetButton>
      </button>
      {#each $galleryFoldersStore as folder (folder.id)}
        <button
          class:active={selectedFolderId === folder.id}
          class="folder-filter"
          type="button"
          onclick={() => chooseFolder(folder.id)}
        >
          <BadgetButton text={`${folder.name} (${getFolderCount(folder.id)})`}>
            <Folder size={24} />
          </BadgetButton>
        </button>
      {/each}
      <button class="folder-filter create" type="button" onclick={createFolder}>
        <BadgetButton text="Nueva carpeta">
          <FolderPlus size={24} />
        </BadgetButton>
      </button>
    </div>
  </section>

  <section class="content-section" aria-labelledby="images-title">
    <div class="content-heading">
      <div>
        <span class="eyebrow">Contenido</span>
        <h2 id="images-title">
          {selectedFolderId === "all" ? "Todas las imágenes" : selectedFolderId === "root" ? "Sin carpeta" : selectedFolder?.name || "Imágenes"}
        </h2>
      </div>
      <span class="result-count">{filteredImages.length}</span>
    </div>

    <label class="search-bar">
      <Search size={20} />
      <input type="search" placeholder="Buscar imágenes..." bind:value={searchTerm} />
      {#if searchTerm}
        <button type="button" aria-label="Limpiar búsqueda" onclick={() => (searchTerm = "")}>
          <X size={17} />
        </button>
      {/if}
    </label>

    <div class="images-list">
      {#if filteredImages.length}
        {#each filteredImages as image (image.id)}
          <GalleryImage
            {image}
            folderName={getFolderName(image.folderId)}
            onOpen={(selectedImage) => (lightboxImage = selectedImage)}
            onEdit={renameImage}
            onDelete={removeImage}
          />
        {/each}
      {:else}
        <div class="empty-state">
          <Images size={48} />
          <h3>No hay imágenes aquí</h3>
          <p>Sube imágenes o selecciona otra carpeta.</p>
          <button type="button" onclick={openFilePicker}><Upload size={18} /> Subir imágenes</button>
        </div>
      {/if}
    </div>
  </section>
</div>

<SliceContainer bind:show={showShare}>
  <div class="share-panel">
    <div class="share-icon"><QrCode size={28} /></div>
    <h2>Compartir galería</h2>
    <p>El enlace y el QR permiten ver las carpetas e imágenes, pero no modificarlas.</p>

    {#if isPreparingShare}
      <div class="share-loading">
        <span class="inline-spinner large"><LoaderCircle size={32} /></span>
        Preparando enlace...
      </div>
    {:else if shareUrl}
      {#if qrCodeUrl}
        <img class="qr-code" src={qrCodeUrl} alt="Código QR de la galería" width="240" height="240" />
      {/if}
      <div class="share-link">
        <Link size={18} />
        <span>{shareUrl}</span>
        <button type="button" aria-label="Copiar enlace" onclick={copyShareLink}><Copy size={18} /></button>
      </div>
      <div class="share-actions">
        <button class="secondary-action" type="button" onclick={copyShareLink}><Copy size={18} /> Copiar</button>
        <button class="primary-action" type="button" onclick={shareGallery}><Share2 size={18} /> Compartir</button>
      </div>
    {/if}
  </div>
</SliceContainer>

{#if lightboxImage}
  <div
    class="lightbox"
    role="presentation"
    onclick={(event) => event.target === event.currentTarget && (lightboxImage = null)}
  >
    <button class="close-lightbox" type="button" aria-label="Cerrar imagen" onclick={() => (lightboxImage = null)}>
      <X size={24} />
    </button>
    <img
      src={optimizeCloudinary(lightboxImage.url, 1800)}
      alt={stripImageFileExtension(lightboxImage.name)}
    />
  </div>
{/if}

<style>
  .gallery-page {
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: var(--page-top-safe) 20px var(--bottom-nav-clearance);
    background: var(--bg-page);
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header-actions,
  .share-actions {
    display: grid;
    grid-template-columns: 1fr 1.35fr;
    gap: 10px;
  }

  .primary-action,
  .secondary-action {
    min-height: 46px;
    padding: 0 15px;
    border-radius: var(--radius-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 750;
    cursor: pointer;
  }

  .primary-action {
    border: 1px solid var(--accent-strong);
    color: var(--accent-ink);
    background: var(--accent-strong);
  }

  .secondary-action {
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    background: var(--bg-card);
  }

  .primary-action:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  .inline-spinner {
    display: inline-flex;
    animation: gallery-spin 0.8s linear infinite;
  }

  @keyframes gallery-spin {
    to { transform: rotate(360deg); }
  }

  .file-input {
    display: none;
  }

  .folders-section,
  .content-section {
    min-width: 0;
  }

  .section-heading,
  .content-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .eyebrow {
    display: block;
    margin-bottom: 3px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 20px;
  }

  .delete-folder {
    width: 40px;
    height: 40px;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--danger-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .folder-strip {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    padding: 2px 2px 8px;
    scrollbar-width: none;
  }

  .folder-strip::-webkit-scrollbar {
    display: none;
  }

  .folder-filter {
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 32px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
  }

  .folder-filter.active {
    outline: 2px solid var(--accent-color);
    outline-offset: -2px;
    box-shadow: var(--shadow-soft);
  }

  .folder-filter.create {
    color: var(--accent-color);
  }

  .result-count {
    min-width: 36px;
    height: 32px;
    padding: 0 10px;
    border-radius: 999px;
    color: var(--text-secondary);
    background: var(--bg-input);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
  }

  .search-bar {
    min-height: 48px;
    margin-bottom: 14px;
    padding: 0 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .search-bar:focus-within {
    border-color: var(--accent-color);
  }

  .search-bar input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: 15px;
  }

  .search-bar button {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .images-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .empty-state {
    min-height: 240px;
    padding: 28px;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .empty-state h3 {
    margin: 12px 0 5px;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0 0 18px;
  }

  .empty-state button {
    min-height: 42px;
    padding: 0 15px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent-strong);
    color: var(--accent-ink);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 750;
    cursor: pointer;
  }

  .share-panel {
    width: min(100% - 32px, 520px);
    margin: 0 auto;
    padding: 4px 0 32px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .share-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    color: var(--info-color);
    background: var(--bg-info-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .share-panel p {
    max-width: 420px;
    margin: -4px 0 2px;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .share-loading {
    min-height: 220px;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .qr-code {
    width: min(240px, 72vw);
    height: auto;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: #ffffff;
  }

  .share-link {
    width: 100%;
    min-height: 48px;
    box-sizing: border-box;
    padding: 0 8px 0 13px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .share-link span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    font-size: 13px;
  }

  .share-link button {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: var(--bg-card);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .share-actions {
    width: 100%;
    grid-template-columns: 1fr 1fr;
  }

  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 220;
    padding: 70px 18px 30px;
    box-sizing: border-box;
    background: rgba(4, 7, 12, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lightbox img {
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--radius-md);
    object-fit: contain;
  }

  .close-lightbox {
    position: absolute;
    top: max(18px, env(safe-area-inset-top));
    right: 18px;
    width: 42px;
    height: 42px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  @media (min-width: 760px) {
    .gallery-page {
      max-width: 920px;
      margin: 0 auto;
    }

    .images-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .header-actions {
      grid-template-columns: 0.9fr 1.2fr;
    }

    .primary-action,
    .secondary-action {
      padding-inline: 10px;
      font-size: 13px;
    }
  }
</style>

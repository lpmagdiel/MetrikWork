<script>
  import { Eye, Folder, Image as ImageIcon, Images, LoaderCircle, Search, X } from "lucide-svelte";
  import { currentPath } from "../router.js";
  import { getPublicGallery } from "../data/stores.js";
  import { optimizeCloudinary, stripImageFileExtension } from "../helpers/image.js";
  import BadgetButton from "../components/BadgetButton.svelte";
  import GalleryImage from "../components/GalleryImage.svelte";

  let gallery = $state(null);
  let loading = $state(true);
  let errorMessage = $state("");
  let selectedFolderId = $state("all");
  let searchTerm = $state("");
  let lightboxImage = $state(null);
  let loadRequestId = 0;

  let shareToken = $derived.by(() => {
    const path = $currentPath.split("?")[0].split("#")[0];
    const token = path.split("/")[2] || "";
    try {
      return decodeURIComponent(token);
    } catch {
      return token;
    }
  });

  let folders = $derived(Array.isArray(gallery?.folders) ? gallery.folders : []);
  let images = $derived(Array.isArray(gallery?.images) ? gallery.images : []);
  let selectedFolder = $derived(folders.find((folder) => folder.id === selectedFolderId) || null);
  let filteredImages = $derived(images.filter((image) => {
    const belongsToFolder = selectedFolderId === "all"
      || (selectedFolderId === "root" && !image.folderId)
      || image.folderId === selectedFolderId;
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return belongsToFolder && (
      !normalizedSearch || String(image.name || "").toLowerCase().includes(normalizedSearch)
    );
  }));

  $effect(() => {
    if (!shareToken) {
      loading = false;
      errorMessage = "El enlace de esta galería no es válido.";
      return;
    }
    loadGallery(shareToken);
  });

  async function loadGallery(token) {
    const requestId = ++loadRequestId;
    loading = true;
    errorMessage = "";
    gallery = null;

    try {
      const sharedGallery = await getPublicGallery(token);
      if (requestId !== loadRequestId) return;
      if (!sharedGallery) {
        errorMessage = "Esta galería no existe o el enlace ya no está disponible.";
        return;
      }
      gallery = sharedGallery;
    } catch (error) {
      console.error("Error loading shared gallery:", error);
      if (requestId === loadRequestId) {
        errorMessage = "No se pudo cargar la galería. Revisa el enlace e inténtalo de nuevo.";
      }
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function chooseFolder(folderId) {
    selectedFolderId = folderId;
    searchTerm = "";
  }

  function getFolderName(folderId) {
    if (!folderId) return "Sin carpeta";
    return folders.find((folder) => folder.id === folderId)?.name || "Carpeta";
  }

  function getFolderCount(folderId) {
    if (folderId === "all") return images.length;
    if (folderId === "root") return images.filter((image) => !image.folderId).length;
    return images.filter((image) => image.folderId === folderId).length;
  }
</script>

<div class="public-gallery">
  <header>
    <div class="brand-mark"><Images size={26} /></div>
    <div class="header-copy">
      <span>MetricWork · Galería compartida</span>
      <h1>{gallery?.teamName || "Galería"}</h1>
    </div>
    <div class="readonly-badge"><Eye size={15} /> Solo lectura</div>
  </header>

  {#if loading}
    <div class="status-state">
      <span class="loading-icon"><LoaderCircle size={40} /></span>
      <p>Cargando galería...</p>
    </div>
  {:else if errorMessage}
    <div class="status-state error">
      <Images size={52} />
      <h2>No pudimos abrir la galería</h2>
      <p>{errorMessage}</p>
    </div>
  {:else}
    <main>
      <section class="folders-section" aria-labelledby="shared-folders-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Explorar</span>
            <h2 id="shared-folders-title">Carpetas</h2>
          </div>
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
          {#each folders as folder (folder.id)}
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
        </div>
      </section>

      <section class="images-section" aria-labelledby="shared-images-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Contenido</span>
            <h2 id="shared-images-title">
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
              />
            {/each}
          {:else}
            <div class="empty-state">
              <Images size={48} />
              <h3>No hay imágenes en esta carpeta</h3>
              <p>Puedes seleccionar otra carpeta para seguir explorando.</p>
            </div>
          {/if}
        </div>
      </section>
    </main>
  {/if}
</div>

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
  .public-gallery {
    height: 100%;
    min-height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: max(24px, env(safe-area-inset-top)) 20px 48px;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  header,
  main {
    width: min(100%, 920px);
    margin-inline: auto;
  }

  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-card);
  }

  .brand-mark {
    width: 50px;
    height: 50px;
    border-radius: 14px;
    color: var(--accent-ink);
    background: var(--accent-strong);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-copy {
    min-width: 0;
  }

  .header-copy span,
  .eyebrow {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h1 {
    margin: 3px 0 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: clamp(20px, 4vw, 27px);
  }

  .readonly-badge,
  .result-count {
    min-height: 32px;
    padding: 0 11px;
    border-radius: 999px;
    color: var(--info-color);
    background: var(--bg-info-subtle);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 800;
  }

  main {
    margin-top: 28px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .eyebrow {
    display: block;
    margin-bottom: 3px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
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

  .result-count {
    min-width: 34px;
    color: var(--text-secondary);
    background: var(--bg-input);
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
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--bg-input);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .images-list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .empty-state,
  .status-state {
    min-height: 260px;
    padding: 32px;
    box-sizing: border-box;
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

  .status-state {
    width: min(100%, 920px);
    margin: 28px auto 0;
  }

  .empty-state h3,
  .status-state h2 {
    margin: 12px 0 6px;
    color: var(--text-primary);
  }

  .empty-state p,
  .status-state p {
    margin: 0;
    line-height: 1.5;
  }

  .status-state.error {
    color: var(--danger-color);
  }

  .loading-icon {
    display: inline-flex;
    color: var(--accent-color);
    animation: gallery-spin 0.8s linear infinite;
  }

  @keyframes gallery-spin {
    to { transform: rotate(360deg); }
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
    .images-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    header {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .readonly-badge {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>

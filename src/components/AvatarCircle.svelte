<script>
  import { updateUserProfile, userStore } from "../data/stores.js";
  import {
    cropToSquare,
    resizer,
    uploader,
    destroyer,
  } from "../data/fileHelper.js";
  import { showErrorAlert } from "../data/alerts.js";
  import { Camera, Loader2, User } from "lucide-svelte";

  const { editable = true, size = 100 } = $props();
  const CLOUDINARY_PRESET_AVATAR =
    import.meta.env.VITE_CLOUDINARY_PRESET_AVATAR ||
    import.meta.env.CLOUDINARY_PRESET_AVATAR ||
    "MetricWorkProfile";

  let isSaving = $state(false);
  let isLoading = $state(true);
  let hasError = $state(false);
  let optimisticAvatar = $state(null);

  // Optimiza la URL de Cloudinary para pedir el tamaño exacto y el formato más eficiente
  import { optimizeCloudinary } from "../helpers/image.js";
  function getOptimizedUrl(url, targetSize) {
    const imageSize = targetSize * 2;
    return optimizeCloudinary(url, imageSize, {
      height: imageSize,
      crop: "fill",
      gravity: "auto",
    });
  }

  // Helper to determine if the avatar is a URL/DataURI or an emoji/text
  function isImageUrl(url) {
    if (!url) return false;
    return url.startsWith("http") || url.startsWith("data:");
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (file) {
      try {
        isSaving = true;
        const oldAvatar = $userStore?.avatar;

        // Optimistic UI: mostrar la imagen localmente antes de subirla
        const cropped = await cropToSquare(file);
        optimisticAvatar = cropped;

        const resized = await resizer(cropped, 400); // 400px para pantallas retina
        const avatarUrl = await uploader(resized, CLOUDINARY_PRESET_AVATAR);

        await updateUserProfile($userStore.uid, { avatar: avatarUrl });

        // Si el avatar anterior era una imagen de Cloudinary, la eliminamos
        if (oldAvatar && oldAvatar.includes("cloudinary.com")) {
          try {
            await destroyer(oldAvatar);
          } catch (deleteError) {
            console.warn(
              "No se pudo eliminar el avatar antiguo de Cloudinary:",
              deleteError,
            );
          }
        }
      } catch (error) {
        console.error("Error processing image:", error);
        showErrorAlert("Error", "No se pudo subir la imagen. Inténtalo de nuevo.");
        optimisticAvatar = null;
      } finally {
        isSaving = false;
        // Reset the input so the same file can be uploaded again if needed
        event.target.value = "";
      }
    }
  }

  // Resetear estados de carga cuando cambia el avatar en el store
  $effect(() => {
    if ($userStore?.avatar || $userStore?.photoURL) {
      isLoading = true;
      hasError = false;
      optimisticAvatar = null;
    }
  });

  const displayAvatar = $derived(optimisticAvatar || $userStore?.avatar || $userStore?.photoURL);
  const isImage = $derived(isImageUrl(displayAvatar));
</script>

<div class="avatar-container" style="width: {size}px; height: {size}px;">
  <div class="avatar-circle" style="width: 100%; height: 100%;">
    {#if isSaving}
      <div class="loader-overlay">
        <Loader2 class="animate-spin" size={size * 0.3} />
      </div>
    {/if}

    {#if isImage && !hasError}
      {#if isLoading}
        <div class="skeleton-pulse"></div>
      {/if}

      <img
        src={getOptimizedUrl(displayAvatar, size)}
        alt={$userStore?.name || "Usuario"}
        class="img-avatar"
        class:loading={isLoading}
        width={size}
        height={size}
        loading="eager"
        decoding="async"
        onload={() => (isLoading = false)}
        onerror={() => {
          isLoading = false;
          hasError = true;
        }}
      />
    {:else}
      <div class="avatar-fallback" style="font-size: {size * 0.48}px;">
        {#if hasError || !displayAvatar}
          <User size={size * 0.5} />
        {:else}
          <span class="avatar-emoji">
            {displayAvatar}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  {#if editable}
    <input
      type="file"
      accept="image/*"
      name="avatar-upload"
      id="avatar-upload"
      onchange={handleAvatarUpload}
      style="display: none"
      disabled={isSaving}
    />

    <label
      for="avatar-upload"
      class="edit-avatar-btn"
      class:disabled={isSaving}
      aria-label="Cambiar avatar"
    >
      <Camera size={14} />
    </label>
  {/if}
</div>

<style>
  .avatar-container {
    position: relative;
    flex-shrink: 0;
  }

  .avatar-circle {
    position: relative;
    background: var(--bg-card-secondary, #f0f0f0);
    border: 3px solid var(--bg-card);
    box-shadow: var(--shadow-button);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--accent-color);
    color: var(--text-primary);
  }

  .avatar-emoji {
    user-select: none;
  }

  .loader-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    backdrop-filter: blur(4px);
  }

  .skeleton-pulse {
    position: absolute;
    inset: 0;
    background-color: var(--bg-card-secondary, #eee);
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.4) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    background-size: 200% 100%;
    animation: pulse 1.5s infinite;
    z-index: 1;
  }

  @keyframes pulse {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .img-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
    transition: opacity 0.3s ease;
    z-index: 2;
    position: relative;
  }

  .img-avatar.loading {
    opacity: 0;
  }

  .edit-avatar-btn {
    position: absolute;
    bottom: 0;
    right: 0;
    background: var(--text-primary);
    color: var(--bg-card);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 11;
  }

  .edit-avatar-btn:hover:not(.disabled) {
    transform: scale(1.1);
    background: var(--accent-strong);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .edit-avatar-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>

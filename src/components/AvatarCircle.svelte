<script>
  import { updateUserProfile, userStore } from "../data/stores.js";
  import { cropToSquare, resizer, uploader, destroyer } from "../data/fileHelper.js";
  import { Camera, Loader2 } from "lucide-svelte";

  const { editable = true, size = 100 } = $props();

  let isSaving = $state(false);

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
        
        const cropped = await cropToSquare(file);
        const resized = await resizer(cropped, 200);
        const avatarUrl = await uploader(resized, "MetricWorkProfile");
        
        await updateUserProfile($userStore.uid, { avatar: avatarUrl });

        // Si el avatar anterior era una imagen de Cloudinary, la eliminamos
        if (oldAvatar && oldAvatar.includes("cloudinary.com")) {
          try {
            await destroyer(oldAvatar);
          } catch (deleteError) {
            console.warn("No se pudo eliminar el avatar antiguo de Cloudinary:", deleteError);
          }
        }
      } catch (error) {
        console.error("Error processing image:", error);
        alert("No se pudo subir la imagen. Inténtalo de nuevo.");
      } finally {
        isSaving = false;
        // Reset the input so the same file can be uploaded again if needed
        event.target.value = "";
      }
    }
  }
</script>

<div class="avatar-container" style="width: {size}px; height: {size}px;">
  <div class="avatar-circle" style="width: 100%; height: 100%;">
    {#if isSaving}
      <div class="loader-overlay">
        <Loader2 class="animate-spin" size={size * 0.3} />
      </div>
    {/if}

    {#if isImageUrl($userStore?.avatar)}
      <img
        src={$userStore.avatar}
        alt={$userStore.name || "Usuario"}
        class="img-avatar"
      />
    {:else}
      <span class="avatar-emoji" style="font-size: {size * 0.48}px;">
        {$userStore?.avatar || "👤"}
      </span>
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
    background: var(--accent-color);
    border: 3px solid var(--bg-card);
    box-shadow: var(--shadow-button);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .avatar-emoji {
    font-size: 48px;
    user-select: none;
  }

  .loader-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    backdrop-filter: blur(2px);
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

  .avatar-circle .img-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
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
    transition: all 0.2s ease;
    z-index: 3;
  }

  .edit-avatar-btn:hover:not(.disabled) {
    transform: scale(1.1);
    background: var(--accent-strong);
  }

  .edit-avatar-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
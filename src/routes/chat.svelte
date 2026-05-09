<script>
  // @ts-nocheck

  import { onMount, onDestroy } from "svelte";
  import { ChevronLeft, Send, Image as ImageIcon } from "lucide-svelte";
  import {
    userStore,
    chatMessagesStore,
    subscribeToTeamChat,
    sendTeamMessage,
    getOlderTeamMessages,
    mergeChatMessages,
    selectedTeamId,
    teamsStore,
  } from "../data/stores.js";
  import { get } from "svelte/store";
  import { navigateTo } from "../router.js";
  import { uploader, resizer } from "../data/fileHelper.js";
  import SliceContainer from "../components/SliceContainer.svelte";

  let messageInput = $state("");
  let messages = $derived($chatMessagesStore);
  let teamId = $derived($selectedTeamId);
  let teamName = $derived(
    $teamsStore.find((t) => t.id === teamId)?.name || "Chat de Equipo",
  );
  let chatContainer;
  let showImageSlice = $state(false);
  let fileInput;
  let previewUrl = $state("");
  let isUploading = $state(false);
  let isLoadingOlder = $state(false);
  let hasOlderMessages = $state(true);
  let shouldStickToBottom = $state(true);
  const pageSize = 30;

  $effect(() => {
    if (teamId) {
      hasOlderMessages = true;
      shouldStickToBottom = true;
      subscribeToTeamChat(teamId, pageSize);
    }
    return () => subscribeToTeamChat(null);
  });

  $effect(() => {
    if (messages.length && chatContainer && shouldStickToBottom) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });

  function handleMessagesScroll() {
    if (!chatContainer) return;
    const distanceFromBottom =
      chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    shouldStickToBottom = distanceFromBottom < 90;
    if (chatContainer.scrollTop < 80) {
      loadOlderMessages();
    }
  }

  async function loadOlderMessages() {
    if (!teamId || isLoadingOlder || !hasOlderMessages || messages.length === 0) return;
    isLoadingOlder = true;
    const previousHeight = chatContainer?.scrollHeight || 0;
    const oldestMessage = messages[0];
    try {
      const olderMessages = await getOlderTeamMessages(teamId, oldestMessage, pageSize);
      if (olderMessages.length < pageSize) {
        hasOlderMessages = false;
      }
      if (olderMessages.length > 0) {
        chatMessagesStore.set(mergeChatMessages(get(chatMessagesStore), olderMessages));
        requestAnimationFrame(() => {
          if (!chatContainer) return;
          chatContainer.scrollTop = chatContainer.scrollHeight - previousHeight;
        });
      }
    } catch (error) {
      console.error("Error loading older messages", error);
    } finally {
      isLoadingOlder = false;
    }
  }

  async function handleSendMessage() {
    if (!messageInput.trim() || !teamId || !$userStore) return;

    try {
      shouldStickToBottom = true;
      await sendTeamMessage(teamId, messageInput.trim(), $userStore);
      messageInput = "";
    } catch (error) {
      console.error("Error sending message", error);
    }
  }

  function openFilePicker() {
    fileInput && fileInput.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        previewUrl = await resizer(event.target.result, 400);
        showImageSlice = true;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error resizing image", error);
    }
    e.target.value = null;
  }

  async function handleSendImage() {
    if (!previewUrl || isUploading) return;
    isUploading = true;
    try {
      const imageUrl = await uploader(previewUrl);
      shouldStickToBottom = true;
      await sendTeamMessage(teamId, "", $userStore, imageUrl);
      showImageSlice = false;
      previewUrl = "";
    } catch (error) {
      console.error("Error uploading image", error);
      alert("Error al enviar la imagen");
    } finally {
      isUploading = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }
</script>

<div class="chat-page">
  <header>
    <button
      class="back-btn"
      onclick={() => navigateTo(`/teams/${teamId}`)}
    >
      <ChevronLeft size={24} />
    </button>
    <h1>{teamName}</h1>
  </header>

  <div class="messages-container" bind:this={chatContainer} onscroll={handleMessagesScroll}>
    {#if messages.length === 0}
      <div class="empty-state">
        <p>No hay mensajes aún. ¡Di hola!</p>
      </div>
    {:else}
      {#if hasOlderMessages}
        <button
          class="load-more-btn"
          onclick={loadOlderMessages}
          disabled={isLoadingOlder}
        >
          {isLoadingOlder ? "Cargando..." : "Cargar mensajes anteriores"}
        </button>
      {/if}
      {#each messages as msg (msg.id)}
        <div
          class="message-wrapper"
          class:me={msg.senderId === $userStore?.uid}
        >
          {#if msg.senderId !== $userStore?.uid}
            <span class="sender-name">{msg.senderName}</span>
          {/if}
          <div class="message-bubble">
            {#if msg.imageUrl}
              <img src={msg.imageUrl} alt="Imagen" class="chat-image" />
            {/if}
            {#if msg.text}
              <p>{msg.text}</p>
            {/if}
          </div>
          <span class="timestamp">
            {new Date(msg.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      {/each}
    {/if}
  </div>

  <div class="input-area">
    <input
      type="text"
      placeholder="Escribe un mensaje..."
      bind:value={messageInput}
      onkeydown={handleKeydown}
    />
    <button class="image-btn" onclick={openFilePicker} title="Enviar imagen">
      <ImageIcon />
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      onchange={handleFileChange}
      style="display:none"
    />
    <button
      class="send-btn"
      onclick={handleSendMessage}
      disabled={!messageInput.trim()}
    >
      <Send size={20} />
    </button>
  </div>
</div>
<div class="space"></div>
<SliceContainer bind:show={showImageSlice} bg="var(--bg-card)">
  <div
    style="padding:24px; display:flex; flex-direction:column; align-items:center; gap:20px;"
  >
    <img
      src={previewUrl}
      alt="Vista previa"
      style="max-width:100%; border-radius:16px; box-shadow:var(--shadow-card);"
    />
    <button
      class="send-image-btn"
      onclick={handleSendImage}
      disabled={isUploading}
    >
      {#if isUploading}
        <span>Enviando...</span>
      {:else}
        <Send size={18} />
        <span>Enviar Imagen</span>
      {/if}
    </button>
  </div>
</SliceContainer>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--bg-page);
    box-sizing: border-box;
    padding-top: var(--page-top-safe);
  }

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px 20px 16px;
    z-index: 10;
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

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .messages-container {
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .load-more-btn {
    align-self: center;
    border: none;
    border-radius: 999px;
    background: var(--bg-card);
    color: var(--text-secondary);
    box-shadow: var(--shadow-card);
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    margin-bottom: 4px;
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .message-wrapper {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 75%;
    gap: 4px;
  }

  .message-wrapper.me {
    align-self: flex-end;
    align-items: flex-end;
  }

  .sender-name {
    font-size: 11px;
    color: var(--text-secondary);
    margin-left: 8px;
  }

  .message-bubble {
    padding: 12px 16px;
    background: var(--bg-card);
    border-radius: 16px;
    border-bottom-left-radius: 4px;
    font-size: 15px;
    line-height: 1.4;
    color: var(--text-primary);
    box-shadow: var(--shadow-card);
  }

  .message-wrapper.me .message-bubble {
    background: var(--accent-strong);
    color: var(--bg-card);
    border-radius: 16px;
    border-bottom-right-radius: 4px;
  }

  .timestamp {
    font-size: 10px;
    color: var(--text-muted);
    margin: 0 4px;
  }

  .input-area {
    background: var(--bg-card);
    padding: 16px 24px;
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
    width: 100%;
    min-height: 90px;
    z-index: 90;
    box-sizing: border-box;
    padding-bottom: calc(2px + var(--bottom-nav-clearance, 0px));
  }

  input {
    flex: 1;
    background: var(--bg-input);
    border: none;
    border-radius: 24px;
    padding: 12px 20px;
    font-size: 15px;
    outline: none;
    color: var(--text-primary);
  }

  .send-btn,
  .image-btn {
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .send-btn:active {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chat-image {
    max-width: 100%;
    border-radius: 8px;
    display: block;
    margin-bottom: 4px;
  }

  .message-bubble p {
    margin: 0;
  }

  .send-image-btn {
    width: 100%;
    background: var(--accent-strong);
    color: var(--bg-card);
    border: none;
    padding: 14px;
    border-radius: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
  }

  .send-image-btn:disabled {
    opacity: 0.6;
  }
</style>

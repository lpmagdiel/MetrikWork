<script>
  // @ts-nocheck

  import { onMount, onDestroy } from "svelte";
  import { ChevronLeft, Send, Image as ImageIcon } from "lucide-svelte";
  import {
    userStore,
    chatMessagesStore,
    subscribeToTeamChat,
    sendTeamMessage,
    selectedTeamId,
    teamsStore,
  } from "../data/stores.js";
  import { currentPath } from "../router.js";
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
  let imageCanvas;

  $effect(() => {
    if (teamId) {
      subscribeToTeamChat(teamId);
    }
    return () => subscribeToTeamChat(null);
  });

  $effect(() => {
    if (messages.length && chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });

  async function handleSendMessage() {
    if (!messageInput.trim() || !teamId || !$userStore) return;

    try {
      await sendTeamMessage(teamId, messageInput.trim(), $userStore);
      messageInput = "";
    } catch (error) {
      console.error("Error sending message", error);
    }
  }

  function openFilePicker() {
    fileInput && fileInput.click();
  }

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = imageCanvas;
        if (!canvas) return;
        const maxW = Math.min(img.width, 800);
        const scale = maxW / img.width;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        showImageSlice = true;
      };
    };
    reader.readAsDataURL(file);
    // reset input
    e.target.value = null;
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
      onclick={() => ($currentPath = `#/teams/${teamId}`)}
    >
      <ChevronLeft size={24} />
    </button>
    <h1>{teamName} chat</h1>
  </header>

  <div class="messages-container" bind:this={chatContainer}>
    {#if messages.length === 0}
      <div class="empty-state">
        <p>No hay mensajes aún. ¡Di hola!</p>
      </div>
    {:else}
      {#each messages as msg (msg.id)}
        <div
          class="message-wrapper"
          class:me={msg.senderId === $userStore?.uid}
        >
          {#if msg.senderId !== $userStore?.uid}
            <span class="sender-name">{msg.senderName}</span>
          {/if}
          <div class="message-bubble">
            {msg.text}
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
    style="padding:16px; display:flex; flex-direction:column; align-items:center; gap:12px;"
  >
    <canvas
      bind:this={imageCanvas}
      style="max-width:90%; border-radius:8px; box-shadow:var(--shadow-card);"
    ></canvas>
  </div>
</SliceContainer>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--bg-page);
    box-sizing: border-box;
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
    padding: 24px 24px calc(var(--bottom-nav-clearance) + 90px);
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
    position: absolute;
    bottom: var(--bottom-nav-occupied);
    left: 0;
    width: 100%;
    height: 90px;
    z-index: 90;
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
</style>

<script>
  // @ts-nocheck

  import { onMount, onDestroy } from "svelte";
  import { BarChart3, ChevronLeft, Image as ImageIcon, MapPinned, Plus, Send, Trash2 } from "lucide-svelte";
  import {
    userStore,
    chatMessagesStore,
    subscribeToTeamChat,
    sendTeamMessage,
    voteTeamPoll,
    getOlderTeamMessages,
    mergeChatMessages,
    selectedTeamId,
    teamsStore,
    locationsStore,
  } from "../data/stores.js";
  import { get } from "svelte/store";
  import { navigateTo } from "../router.js";
  import { uploader, resizer } from "../data/fileHelper.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import LocationBox from "../components/LocationBox.svelte";
  import { showErrorAlert } from "../data/alerts.js";

  let messageInput = $state("");
  let messages = $derived($chatMessagesStore);
  let teamId = $derived($selectedTeamId);
  let teamName = $derived(
    $teamsStore.find((t) => t.id === teamId)?.name || "Chat de Equipo",
  );
  let chatContainer;
  let showImageSlice = $state(false);
  let showAttachMenu = $state(false);
  let showLocationSlice = $state(false);
  let showPollSlice = $state(false);
  let fileInput;
  let previewUrl = $state("");
  let isUploading = $state(false);
  let isSendingPoll = $state(false);
  let pollQuestion = $state("");
  let pollOptions = $state(["", ""]);
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
    showAttachMenu = false;
    fileInput && fileInput.click();
  }

  function openLocationPicker() {
    showAttachMenu = false;
    showLocationSlice = true;
  }

  function openPollCreator() {
    showAttachMenu = false;
    pollQuestion = "";
    pollOptions = ["", ""];
    showPollSlice = true;
  }

  function addPollOption() {
    if (pollOptions.length >= 6) return;
    pollOptions = [...pollOptions, ""];
  }

  function removePollOption(index) {
    if (pollOptions.length <= 2) return;
    pollOptions = pollOptions.filter((_, optionIndex) => optionIndex !== index);
  }

  function updatePollOption(index, value) {
    pollOptions = pollOptions.map((option, optionIndex) =>
      optionIndex === index ? value : option,
    );
  }

  function createPollOptionId(index) {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${index}`;
  }

  async function handleSendPoll() {
    const question = pollQuestion.trim();
    const options = pollOptions
      .map((option) => option.trim())
      .filter(Boolean)
      .map((text, index) => ({ id: createPollOptionId(index), text }));

    if (!question || options.length < 2 || !teamId || !$userStore || isSendingPoll) return;

    isSendingPoll = true;
    try {
      shouldStickToBottom = true;
      await sendTeamMessage(teamId, "", $userStore, null, {
        type: "POLL",
        poll: {
          question,
          options,
          votes: {},
          allowMultiple: false,
        },
      });
      showPollSlice = false;
      pollQuestion = "";
      pollOptions = ["", ""];
    } catch (error) {
      console.error("Error sending poll", error);
      showErrorAlert("Error", "Error al enviar la encuesta");
    } finally {
      isSendingPoll = false;
    }
  }

  async function handlePollVote(message, optionId) {
    if (!teamId || !$userStore?.uid || !message?.id || !optionId) return;
    try {
      await voteTeamPoll(teamId, message.id, $userStore.uid, optionId);
    } catch (error) {
      console.error("Error voting poll", error);
      showErrorAlert("Error", "No se pudo registrar tu voto");
    }
  }

  function getPollVotes(poll) {
    return Object.values(poll?.votes || {});
  }

  function getPollOptionVotes(poll, optionId) {
    return getPollVotes(poll).filter((vote) => vote === optionId).length;
  }

  function getPollPercentage(poll, optionId) {
    const totalVotes = getPollVotes(poll).length;
    if (!totalVotes) return 0;
    return Math.round((getPollOptionVotes(poll, optionId) / totalVotes) * 100);
  }

  function getMyPollVote(poll) {
    return poll?.votes?.[$userStore?.uid] || "";
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
      await sendTeamMessage(teamId, "", $userStore, imageUrl, { type: "IMAGE" });
      showImageSlice = false;
      previewUrl = "";
    } catch (error) {
      console.error("Error uploading image", error);
      showErrorAlert("Error", "Error al enviar la imagen");
    } finally {
      isUploading = false;
    }
  }

  async function handleSendLocation(location) {
    if (!teamId || !$userStore || !location) return;

    try {
      shouldStickToBottom = true;
      await sendTeamMessage(teamId, "", $userStore, null, {
        type: "SIMPLE_LOCATION",
        location: {
          id: location.id,
          name: location.name,
          description: location.description || "",
          gps: location.gps || null,
        },
      });
      showLocationSlice = false;
    } catch (error) {
      console.error("Error sending location", error);
      showErrorAlert("Error", "Error al enviar la ubicación");
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
          <div
            class="message-bubble"
            class:location-bubble={msg.type === "SIMPLE_LOCATION" && msg.location}
            class:poll-bubble={msg.type === "POLL" && msg.poll}
          >
            {#if msg.type === "SIMPLE_LOCATION" && msg.location}
              <LocationBox
                gps={msg.location.gps}
                name={msg.location.name}
                description={msg.location.description || "Sin descripción"}
              />
            {:else if msg.type === "POLL" && msg.poll}
              <div class="poll-card">
                <div class="poll-heading">
                  <BarChart3 size={18} />
                  <h3>{msg.poll.question}</h3>
                </div>
                <div class="poll-options">
                  {#each msg.poll.options || [] as option}
                    {@const voteCount = getPollOptionVotes(msg.poll, option.id)}
                    {@const percentage = getPollPercentage(msg.poll, option.id)}
                    {@const isSelected = getMyPollVote(msg.poll) === option.id}
                    <button
                      type="button"
                      class="poll-option"
                      class:selected={isSelected}
                      onclick={() => handlePollVote(msg, option.id)}
                    >
                      <span class="poll-fill" style={`width: ${percentage}%;`}></span>
                      <span class="poll-option-text">{option.text}</span>
                      <span class="poll-option-meta">{voteCount} · {percentage}%</span>
                    </button>
                  {/each}
                </div>
                <span class="poll-total">{getPollVotes(msg.poll).length} votos</span>
              </div>
            {:else if msg.imageUrl}
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
    <div class="attach-wrapper">
      {#if showAttachMenu}
        <div class="attach-menu">
          <button type="button" onclick={openLocationPicker} title="Enviar ubicación">
            <MapPinned size={20} />
          </button>
          <button type="button" onclick={openFilePicker} title="Enviar imagen">
            <ImageIcon size={20} />
          </button>
          <button type="button" onclick={openPollCreator} title="Crear encuesta">
            <BarChart3 size={20} />
          </button>
        </div>
      {/if}
      <button class="attach-btn" onclick={() => (showAttachMenu = !showAttachMenu)} title="Adjuntar">
        <Plus />
      </button>
    </div>
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

<SliceContainer bind:show={showPollSlice} bg="var(--bg-card)">
  <div class="poll-creator">
    <div class="location-picker-header">
      <BarChart3 size={22} />
      <h2>Nueva encuesta</h2>
    </div>

    <label for="poll-question">Pregunta</label>
    <input
      id="poll-question"
      type="text"
      bind:value={pollQuestion}
      placeholder="Ej. ¿Qué día nos reunimos?"
    />

    <div class="poll-option-editor">
      <span>Opciones</span>
      {#each pollOptions as option, index}
        <div class="poll-option-input">
          <input
            type="text"
            value={option}
            oninput={(event) => updatePollOption(index, event.currentTarget.value)}
            placeholder={`Opción ${index + 1}`}
          />
          <button
            type="button"
            onclick={() => removePollOption(index)}
            disabled={pollOptions.length <= 2}
            aria-label="Eliminar opción"
          >
            <Trash2 size={16} />
          </button>
        </div>
      {/each}
    </div>

    <button
      type="button"
      class="add-option-btn"
      onclick={addPollOption}
      disabled={pollOptions.length >= 6}
    >
      <Plus size={16} />
      Añadir opción
    </button>

    <button
      class="send-image-btn"
      onclick={handleSendPoll}
      disabled={isSendingPoll || !pollQuestion.trim() || pollOptions.filter((option) => option.trim()).length < 2}
    >
      {#if isSendingPoll}
        <span>Enviando...</span>
      {:else}
        <Send size={18} />
        <span>Enviar encuesta</span>
      {/if}
    </button>
  </div>
</SliceContainer>

<SliceContainer bind:show={showLocationSlice} bg="var(--bg-card)">
  <div class="location-picker">
    <div class="location-picker-header">
      <MapPinned size={22} />
      <h2>Enviar ubicación</h2>
    </div>

    {#if $locationsStore.length === 0}
      <div class="location-empty">
        <p>No tienes ubicaciones guardadas.</p>
        <button onclick={() => navigateTo("/locations")}>Crear ubicación</button>
      </div>
    {:else}
      <div class="location-picker-list">
        {#each $locationsStore as location (location.id)}
          <article class="location-option">
            <LocationBox
              gps={location.gps}
              name={location.name}
              description={location.description || "Sin descripción"}
            />
            <button class="send-location-btn" onclick={() => handleSendLocation(location)}>
              <Send size={16} />
              Enviar
            </button>
          </article>
        {/each}
      </div>
    {/if}
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
    background: var(--translucend-ligth);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border-bottom-left-radius: 4px;
    font-size: 15px;
    line-height: 1.4;
    color: var(--text-primary);
    box-shadow: var(--shadow-card);
  }

  .message-wrapper.me .message-bubble {
    background: var(--translucend-dark);
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
    gap: 8px;
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
  .attach-btn {
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

  .attach-wrapper {
    position: relative;
    width: 44px;
    height: 44px;
  }

  .attach-menu {
    position: absolute;
    right: 0;
    bottom: 54px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border-radius: 999px;
    background: var(--bg-card);
    box-shadow: var(--shadow-soft);
    border: 1px solid var(--border-color);
    z-index: 100;
  }

  .attach-menu button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 50%;
    background: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
  }

  .send-btn:active,
  .attach-btn:active {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chat-image {
    max-width: 100%;
    border-radius: 12px;
    display: block;
    margin-bottom: 4px;
  }

  .message-bubble p {
    margin: 0;
  }

  .message-bubble.location-bubble {
    width: min(320px, 76vw);
    padding: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text-primary);
    
  }

  .message-wrapper.me .message-bubble.location-bubble {
    background: transparent;
    color: var(--text-primary);
  }

  .message-bubble.location-bubble :global(.location-box) {
    margin: 0;
  }

  .message-bubble.poll-bubble {
    width: min(340px, 78vw);
    padding: 10px;
    background: var(--bg-card);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .message-wrapper.me .message-bubble.poll-bubble {
    background: var(--bg-card);
    color: var(--text-primary);
  }

  .poll-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .poll-heading {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--text-primary);
  }

  .poll-heading h3 {
    margin: 0;
    font-size: 15px;
    line-height: 1.3;
    font-weight: 800;
  }

  .poll-options {
    display: grid;
    gap: 8px;
  }

  .poll-option {
    position: relative;
    overflow: hidden;
    width: 100%;
    min-height: 42px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    text-align: left;
  }

  .poll-option.selected {
    border-color: var(--accent-strong);
  }

  .poll-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--bg-accent-subtle);
    opacity: 0.75;
    pointer-events: none;
  }

  .poll-option-text,
  .poll-option-meta {
    position: relative;
    z-index: 1;
  }

  .poll-option-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 800;
  }

  .poll-option-meta {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .poll-total {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
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

  .location-picker {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 24px;
  }

  .location-picker-header {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-primary);
  }

  .location-picker-header h2 {
    font-size: 20px;
    line-height: 1.2;
  }

  .location-picker-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .location-option {
    position: relative;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }

  .location-option :global(.location-box) {
    margin: 0;
  }

  .send-location-btn {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--accent-strong);
    color: var(--bg-card);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }

  .location-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    gap: 14px;
    color: var(--text-secondary);
    text-align: center;
  }

  .location-empty button {
    min-height: 42px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: var(--accent-strong);
    color: var(--bg-card);
    font-weight: 700;
    cursor: pointer;
  }

  .poll-creator {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 8px 16px 24px;
  }

  .poll-creator label,
  .poll-option-editor > span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .poll-creator input {
    width: 100%;
    box-sizing: border-box;
    border-radius: var(--radius-sm);
  }

  .poll-option-editor {
    display: grid;
    gap: 8px;
  }

  .poll-option-input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 42px;
    gap: 8px;
    align-items: center;
  }

  .poll-option-input button,
  .add-option-btn {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    min-height: 42px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 800;
  }

  .poll-option-input button:disabled,
  .add-option-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .add-option-btn {
    width: 100%;
  }
  .location-bubble{
    padding: 4px !important;
  }
</style>

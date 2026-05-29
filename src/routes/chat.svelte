<script>
  // @ts-nocheck

  import { onDestroy } from "svelte";
  import {
    BarChart3,
    Crosshair,
    Image as ImageIcon,
    MapPinned,
    Mic,
    MicOff,
    Phone,
    PhoneOff,
    Plus,
    Send,
    Trash2,
    UserRound,
    UsersRound,
    Video,
    VideoOff,
  } from "lucide-svelte";
  import {
    userStore,
    chatMessagesStore,
    subscribeToTeamChat,
    sendTeamMessage,
    subscribeToPrivateChat,
    sendPrivateMessage,
    getOrCreatePrivateChat,
    getOlderPrivateMessages,
    createPrivateCall,
    subscribeToPrivateCalls,
    updatePrivateCall,
    endPrivateCall,
    addCallCandidate,
    subscribeToCallCandidates,
    clearCallCandidates,
    voteTeamPoll,
    getOlderTeamMessages,
    mergeChatMessages,
    selectedTeamId,
    teamsStore,
    locationsStore,
    getUserProfile,
    getProfileImage,
    userPresenceStore,
    subscribeToUsersPresence,
    isUserPresenceActive,
  } from "../data/stores.js";
  import { get } from "svelte/store";
  import { currentPath, navigateTo } from "../router.js";
  import { uploader, resizer } from "../data/fileHelper.js";
  import { getCurrentGpsPosition } from "../data/geolocation.js";
  import SliceContainer from "../components/SliceContainer.svelte";
  import LocationBox from "../components/LocationBox.svelte";
  import { showErrorAlert } from "../data/alerts.js";
  import TitleHeader from "../components/TitleHeader.svelte";
  import { optimizeCloudinary } from "../helpers/image.js";
  import { geocodeAddress } from "../helpers/navigation.js";

  let messageInput = $state("");
  let messages = $derived($chatMessagesStore);
  let teamId = $derived($selectedTeamId);
  let team = $derived($teamsStore.find((t) => t.id === teamId));
  let teamName = $derived(
    team?.name || "Chat de Equipo",
  );
  let teamMembers = $derived((team?.membersData || []).filter((member) => member.id !== $userStore?.uid));
  let chatMode = $state("team");
  let selectedMemberId = $state("");
  let selectedMember = $derived(teamMembers.find((member) => member.id === selectedMemberId) || null);
  let privateChatId = $state("");
  let chatTitle = $derived(chatMode === "private" && selectedMember ? selectedMember.name : teamName);
  let chatContainer;
  let showImageSlice = $state(false);
  let showAttachMenu = $state(false);
  let showLocationSlice = $state(false);
  let showPollSlice = $state(false);
  let fileInput;
  let previewUrl = $state("");
  let isUploading = $state(false);
  let isSendingPoll = $state(false);
  let isSendingLocation = $state(false);
  let isGettingCurrentLocation = $state(false);
  let pollQuestion = $state("");
  let pollOptions = $state(["", ""]);
  let isLoadingOlder = $state(false);
  let hasOlderMessages = $state(true);
  let shouldStickToBottom = $state(true);
  let presenceNow = $state(Date.now());
  let activeCall = $state(null);
  let isCallOpen = $state(false);
  let callStatus = $state("idle");
  let isMuted = $state(false);
  let isCameraOff = $state(false);
  let remoteHasVideo = $state(false);
  let remoteProfile = $state(null);
  let localVideo = $state();
  let remoteVideo = $state();
  let localStream = null;
  let remoteStream = null;
  let peerConnection = null;
  let candidateUnsubscribe = null;
  let hasHandledRemoteDescription = false;
  let currentCallId = "";
  let pendingRemoteCandidates = [];
  let remoteUserId = $derived(activeCall
    ? (activeCall.callerId === $userStore?.uid ? activeCall.receiverId : activeCall.callerId)
    : selectedMember?.id);
  let remoteDisplayName = $derived(
    remoteProfile?.name ||
    selectedMember?.name ||
    activeCall?.callerName ||
    activeCall?.receiverName ||
    "Usuario",
  );
  let remoteAvatarUrl = $derived(getProfileImage(remoteProfile) || getProfileImage(selectedMember) || "");
  let remoteVideoEnabled = $derived(activeCall?.media?.[remoteUserId]?.videoEnabled !== false);
  let showRemoteAvatar = $derived(!remoteHasVideo || !remoteVideoEnabled);
  const pageSize = 20;
  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };
  let appliedRouteParamsKey = $state("");

  let routeChatParams = $derived.by(() => {
    try {
      const url = new URL($currentPath, window.location.origin);
      return {
        mode: url.searchParams.get("mode") || "",
        member: url.searchParams.get("member") || "",
        call: url.searchParams.get("call") || "",
      };
    } catch {
      return { mode: "", member: "", call: "" };
    }
  });

  $effect(() => {
    const interval = setInterval(() => {
      presenceNow = Date.now();
    }, 30000);

    return () => clearInterval(interval);
  });

  $effect(() => {
    return subscribeToUsersPresence(teamMembers.map((member) => member.id));
  });

  $effect(() => {
    const { mode, member, call } = routeChatParams;
    if (mode !== "private" && !member && !call) return;

    const routeKey = `${mode}:${member}:${call}`;
    if (routeKey === appliedRouteParamsKey) return;
    if (member && !teamMembers.some((teamMember) => teamMember.id === member)) return;

    chatMode = "private";
    if (member) selectedMemberId = member;
    appliedRouteParamsKey = routeKey;
  });

  $effect(() => {
    if (chatMode === "private" && teamMembers.length === 0) {
      selectedMemberId = "";
      return;
    }

    if (
      chatMode === "private" &&
      teamMembers.length > 0 &&
      (!selectedMemberId || !teamMembers.some((member) => member.id === selectedMemberId))
    ) {
      selectedMemberId = teamMembers[0].id;
    }
  });

  $effect(() => {
    hasOlderMessages = true;
    shouldStickToBottom = true;
    privateChatId = "";

    if (chatMode === "team" && teamId) {
      subscribeToTeamChat(teamId, pageSize);
    } else if (chatMode === "private" && teamId && $userStore && selectedMember) {
      subscribeToPrivateChat(teamId, $userStore, selectedMember, pageSize).then((chatId) => {
        privateChatId = chatId || "";
      });
    } else {
      subscribeToTeamChat(null);
    }
    return () => subscribeToTeamChat(null);
  });

  $effect(() => {
    if (chatMode === "private" && privateChatId && $userStore?.uid) {
      subscribeToPrivateCalls(privateChatId, $userStore.uid, (call) => {
        activeCall = call;
        handleCallSnapshot(call);
      });
    } else {
      subscribeToPrivateCalls(null, null);
      activeCall = null;
    }
  });

  $effect(() => {
    const uid = remoteUserId;
    if (!uid) {
      remoteProfile = null;
      return;
    }

    getUserProfile(uid).then((profile) => {
      if (remoteUserId === uid) {
        remoteProfile = profile;
      }
    });
  });

  onDestroy(() => {
    subscribeToTeamChat(null);
    subscribeToPrivateCalls(null, null);
    cleanupCall(false);
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
      const olderMessages = chatMode === "private"
        ? await getOlderPrivateMessages(privateChatId, oldestMessage, pageSize)
        : await getOlderTeamMessages(teamId, oldestMessage, pageSize);
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
    if (chatMode === "private" && !selectedMember) return;

    try {
      shouldStickToBottom = true;
      if (chatMode === "private") {
        const chatId = privateChatId || await getOrCreatePrivateChat(teamId, $userStore, selectedMember);
        privateChatId = chatId || "";
        await sendPrivateMessage(chatId, messageInput.trim(), $userStore, selectedMember, null, teamId);
      } else {
        await sendTeamMessage(teamId, messageInput.trim(), $userStore);
      }
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
    if (chatMode === "private") return;
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
    if (chatMode === "private") return;
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
    if (chatMode === "private") return;
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
      if (chatMode === "private") {
        const chatId = privateChatId || await getOrCreatePrivateChat(teamId, $userStore, selectedMember);
        privateChatId = chatId || "";
        await sendPrivateMessage(chatId, "", $userStore, selectedMember, imageUrl, teamId);
      } else {
        await sendTeamMessage(teamId, "", $userStore, imageUrl, { type: "IMAGE" });
      }
      showImageSlice = false;
      previewUrl = "";
    } catch (error) {
      console.error("Error uploading image", error);
      showErrorAlert("Error", "Error al enviar la imagen");
    } finally {
      isUploading = false;
    }
  }

  function normalizeChatLocation(location) {
    return {
      id: location.id || "",
      name: location.name || "Ubicación",
      description: location.description || "",
      gps: location.gps || null,
    };
  }

  async function sendChatLocation(location) {
    if (!teamId || !$userStore || !location) return;

    if (chatMode === "private") {
      if (!selectedMember) return;
      const chatId = privateChatId || await getOrCreatePrivateChat(teamId, $userStore, selectedMember);
      privateChatId = chatId || "";
      await sendPrivateMessage(chatId, "", $userStore, selectedMember, null, teamId, {
        type: "SIMPLE_LOCATION",
        location: normalizeChatLocation(location),
      });
      return;
    }

    await sendTeamMessage(teamId, "", $userStore, null, {
      type: "SIMPLE_LOCATION",
      location: normalizeChatLocation(location),
    });
  }

  async function handleSendLocation(location) {
    if (!teamId || !$userStore || !location) return;

    isSendingLocation = true;
    try {
      shouldStickToBottom = true;
      await sendChatLocation(location);
      showLocationSlice = false;
    } catch (error) {
      console.error("Error sending location", error);
      showErrorAlert("Error", "Error al enviar la ubicación");
    } finally {
      isSendingLocation = false;
    }
  }

  async function handleSendCurrentLocation() {
    if (!teamId || !$userStore || isSendingLocation) return;
    if (chatMode === "private" && !selectedMember) return;

    isSendingLocation = true;
    isGettingCurrentLocation = true;
    try {
      const gps = await getCurrentGpsPosition();
      let description = "Ubicación compartida desde el dispositivo";

      try {
        description = await geocodeAddress(gps);
      } catch (error) {
        console.warn("No se pudo resolver la dirección de la ubicación actual:", error?.message || error);
      }

      shouldStickToBottom = true;
      await sendChatLocation({
        id: `current-${Date.now()}`,
        name: "Mi ubicación actual",
        description,
        gps,
      });
      showLocationSlice = false;
    } catch (error) {
      console.error("Error sending current location", error);
      showErrorAlert("Error", error.message || "No se pudo obtener tu ubicación actual");
    } finally {
      isGettingCurrentLocation = false;
      isSendingLocation = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function setChatMode(mode) {
    chatMode = mode;
    showAttachMenu = false;
    messageInput = "";
  }

  function isMemberActive(memberId) {
    return isUserPresenceActive($userPresenceStore[memberId], presenceNow);
  }

  function getMemberPresenceLabel(memberId) {
    return isMemberActive(memberId) ? "Activo" : "Inactivo";
  }

  async function prepareMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    remoteStream = new MediaStream();
    if (localVideo) localVideo.srcObject = localStream;
    if (remoteVideo) remoteVideo.srcObject = remoteStream;
  }

  function createPeerConnection(candidateSide) {
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
      remoteHasVideo = remoteStream.getVideoTracks().some((track) => track.readyState === "live");
      if (remoteVideo) remoteVideo.srcObject = remoteStream;
    };
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && privateChatId && currentCallId) {
        addCallCandidate(privateChatId, currentCallId, candidateSide, event.candidate).catch(console.error);
      }
    };
  }

  async function startCall() {
    if (chatMode !== "private" || !teamId || !$userStore || !selectedMember || callStatus !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showErrorAlert("Llamadas no disponibles", "Tu navegador no permite usar cámara o micrófono.");
      return;
    }

    try {
      const chatId = privateChatId || await getOrCreatePrivateChat(teamId, $userStore, selectedMember);
      privateChatId = chatId || "";
      currentCallId = await createPrivateCall(chatId, teamId, $userStore, selectedMember);
      isCallOpen = true;
      callStatus = "calling";
      hasHandledRemoteDescription = false;
      await prepareMedia();
      createPeerConnection("caller");
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await updatePrivateCall(chatId, currentCallId, {
        offer: { type: offer.type, sdp: offer.sdp },
        [`media.${$userStore.uid}.videoEnabled`]: true,
        [`media.${$userStore.uid}.audioEnabled`]: true,
        status: "ringing",
      });
      candidateUnsubscribe = subscribeToCallCandidates(chatId, currentCallId, "receiver", async (candidate) => {
        if (peerConnection?.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingRemoteCandidates = [...pendingRemoteCandidates, candidate];
        }
      });
    } catch (error) {
      console.error("Error starting call", error);
      showErrorAlert("Error", "No se pudo iniciar la llamada.");
      cleanupCall(true);
    }
  }

  async function acceptCall() {
    if (!activeCall || !privateChatId || !$userStore || callStatus === "active") return;
    try {
      currentCallId = activeCall.id;
      isCallOpen = true;
      callStatus = "connecting";
      hasHandledRemoteDescription = true;
      await prepareMedia();
      createPeerConnection("receiver");
      await peerConnection.setRemoteDescription(new RTCSessionDescription(activeCall.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await updatePrivateCall(privateChatId, activeCall.id, {
        answer: { type: answer.type, sdp: answer.sdp },
        [`media.${$userStore.uid}.videoEnabled`]: true,
        [`media.${$userStore.uid}.audioEnabled`]: true,
        status: "active",
      });
      candidateUnsubscribe = subscribeToCallCandidates(privateChatId, activeCall.id, "caller", async (candidate) => {
        await peerConnection?.addIceCandidate(new RTCIceCandidate(candidate));
      });
      callStatus = "active";
    } catch (error) {
      console.error("Error accepting call", error);
      showErrorAlert("Error", "No se pudo aceptar la llamada.");
      cleanupCall(true);
    }
  }

  async function handleCallSnapshot(call) {
    if (!call) {
      if (callStatus !== "idle") cleanupCall(false);
      return;
    }

    const isCaller = call.callerId === $userStore?.uid;
    const isIncoming = call.receiverId === $userStore?.uid && call.status === "ringing";
    if (isIncoming && callStatus === "idle") {
      currentCallId = call.id;
      isCallOpen = true;
      callStatus = "incoming";
      return;
    }

    if (isCaller && peerConnection && call.answer && !hasHandledRemoteDescription) {
      hasHandledRemoteDescription = true;
      await peerConnection.setRemoteDescription(new RTCSessionDescription(call.answer));
      await Promise.all(
        pendingRemoteCandidates.map((candidate) =>
          peerConnection.addIceCandidate(new RTCIceCandidate(candidate)),
        ),
      );
      pendingRemoteCandidates = [];
      callStatus = "active";
    }
  }

  async function hangUp() {
    const callId = currentCallId || activeCall?.id;
    if (privateChatId && callId) {
      await endPrivateCall(privateChatId, callId).catch(console.error);
      await clearCallCandidates(privateChatId, callId).catch(console.error);
    }
    cleanupCall(false);
  }

  function cleanupCall(shouldNotify) {
    if (shouldNotify && privateChatId && currentCallId) {
      endPrivateCall(privateChatId, currentCallId).catch(console.error);
    }
    candidateUnsubscribe?.();
    candidateUnsubscribe = null;
    peerConnection?.close();
    peerConnection = null;
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    remoteStream = null;
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    currentCallId = "";
    pendingRemoteCandidates = [];
    remoteHasVideo = false;
    hasHandledRemoteDescription = false;
    isCallOpen = false;
    callStatus = "idle";
    isMuted = false;
    isCameraOff = false;
  }

  function toggleMute() {
    isMuted = !isMuted;
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    if (privateChatId && (currentCallId || activeCall?.id) && $userStore?.uid) {
      updatePrivateCall(privateChatId, currentCallId || activeCall.id, {
        [`media.${$userStore.uid}.audioEnabled`]: !isMuted,
      }).catch(console.error);
    }
  }

  function toggleCamera() {
    isCameraOff = !isCameraOff;
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !isCameraOff;
    });
    if (privateChatId && (currentCallId || activeCall?.id) && $userStore?.uid) {
      updatePrivateCall(privateChatId, currentCallId || activeCall.id, {
        [`media.${$userStore.uid}.videoEnabled`]: !isCameraOff,
      }).catch(console.error);
    }
  }

  function goToTeamHome() {
    navigateTo(teamId ? `/teams/${teamId}` : "/teams");
  }
</script>

<div class="chat-page">
  <TitleHeader title="Chat" description={chatTitle} action={goToTeamHome} paddingHorizontal={true}/>

  <div class="chat-switcher">
    <div class="mode-tabs" aria-label="Tipo de chat">
      <button
        type="button"
        class:active={chatMode === "team"}
        onclick={() => setChatMode("team")}
      >
        <UsersRound size={17} />
        Equipo
      </button>
      <button
        type="button"
        class:active={chatMode === "private"}
        onclick={() => setChatMode("private")}
      >
        <UserRound size={17} />
        Privado
      </button>
    </div>

    {#if chatMode === "private"}
      <div class="private-toolbar">
        <div class="private-member-list" aria-label="Seleccionar miembro">
          {#if teamMembers.length === 0}
            <div class="private-member-empty">Sin miembros disponibles</div>
          {:else}
            {#each teamMembers as member (member.id)}
              <button
                type="button"
                class:active={selectedMemberId === member.id}
                onclick={() => (selectedMemberId = member.id)}
                title={`${member.name || member.email || "Miembro"} - ${getMemberPresenceLabel(member.id)}`}
              >
                <span
                  class="private-presence-dot"
                  class:active={isMemberActive(member.id)}
                  aria-label={getMemberPresenceLabel(member.id)}
                ></span>
                <span class="private-member-name">{member.name || member.email || "Miembro"}</span>
              </button>
            {/each}
          {/if}
        </div>
        <button
          type="button"
          class="call-btn"
          onclick={startCall}
          disabled={!selectedMember || callStatus !== "idle"}
          title="Iniciar llamada"
        >
          <Phone size={18} />
        </button>
      </div>
    {/if}
  </div>

  <div class="messages-container" bind:this={chatContainer} onscroll={handleMessagesScroll}>
    {#if messages.length === 0}
      <div class="empty-state">
        <p>{chatMode === "private" && !selectedMember ? "No hay miembros para iniciar un chat privado." : "No hay mensajes aún. ¡Di hola!"}</p>
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
              <img src={optimizeCloudinary(msg.imageUrl, 640, { crop: "limit" })} alt="Imagen" class="chat-image" loading="eager" decoding="async" />
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
      disabled={chatMode === "private" && !selectedMember}
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
          {#if chatMode === "team"}
            <button type="button" onclick={openPollCreator} title="Crear encuesta">
              <BarChart3 size={20} />
            </button>
          {/if}
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
      disabled={!messageInput.trim() || (chatMode === "private" && !selectedMember)}
    >
      <Send size={20} />
    </button>
  </div>
</div>
<div class="space"></div>

{#if isCallOpen}
  <div class="call-overlay">
    <div class="call-panel">
      <div class="call-header">
        <span>{selectedMember?.name || activeCall?.callerName || activeCall?.receiverName || "Llamada"}</span>
        <small>
          {#if callStatus === "incoming"}
            Llamada entrante
          {:else if callStatus === "calling"}
            Llamando...
          {:else if callStatus === "connecting"}
            Conectando...
          {:else}
            En llamada
          {/if}
        </small>
      </div>

      {#if callStatus === "incoming"}
        <div class="incoming-call-actions">
          <button class="decline-call" type="button" onclick={hangUp} title="Rechazar">
            <PhoneOff size={22} />
          </button>
          <button class="accept-call" type="button" onclick={acceptCall} title="Aceptar">
            <Phone size={22} />
          </button>
        </div>
      {:else}
        <div class="video-grid">
          <div class="remote-avatar-backdrop" class:visible={showRemoteAvatar}>
            <div class="remote-avatar-ring">
              {#if remoteAvatarUrl}
                <img src={optimizeCloudinary(remoteAvatarUrl, 276, { height: 276, crop: "fill", gravity: "auto" })} alt={remoteDisplayName} width="138" height="138" loading="eager" decoding="async" />
              {:else}
                <span>{remoteDisplayName.slice(0, 1).toUpperCase()}</span>
              {/if}
            </div>
            <strong>{remoteDisplayName}</strong>
          </div>
          <video
            bind:this={remoteVideo}
            autoplay
            playsinline
            class:hidden-video={showRemoteAvatar}
          ></video>
          <video bind:this={localVideo} autoplay playsinline muted class="local-video"></video>
        </div>

        <div class="call-controls">
          <button type="button" onclick={toggleMute} title={isMuted ? "Activar micrófono" : "Silenciar"}>
            {#if isMuted}<MicOff size={21} />{:else}<Mic size={21} />{/if}
          </button>
          <button type="button" onclick={toggleCamera} title={isCameraOff ? "Activar cámara" : "Desactivar cámara"}>
            {#if isCameraOff}<VideoOff size={21} />{:else}<Video size={21} />{/if}
          </button>
          <button class="decline-call" type="button" onclick={hangUp} title="Colgar">
            <PhoneOff size={21} />
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

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

    <button
      type="button"
      class="current-location-btn"
      onclick={handleSendCurrentLocation}
      disabled={isSendingLocation || (chatMode === "private" && !selectedMember)}
    >
      <Crosshair size={18} />
      <span>{isGettingCurrentLocation ? "Obteniendo ubicación..." : "Enviar mi ubicación actual"}</span>
    </button>

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
            <button
              class="send-location-btn"
              onclick={() => handleSendLocation(location)}
              disabled={isSendingLocation}
            >
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



  .chat-switcher {
    display: grid;
    gap: 10px;
    padding: 0 24px 10px;
  }

  .mode-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 5px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--bg-card);
  }

  .mode-tabs button,
  .call-btn,
  .call-controls button,
  .incoming-call-actions button {
    border: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mode-tabs button {
    min-height: 38px;
    gap: 7px;
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
  }

  .mode-tabs button.active {
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .private-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    gap: 8px;
    align-items: center;
  }

  .private-member-list {
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .private-member-list::-webkit-scrollbar {
    display: none;
  }

  .private-member-list button,
  .private-member-empty {
    min-height: 44px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--bg-card);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
  }

  .private-member-list button {
    max-width: 190px;
    cursor: pointer;
  }

  .private-member-list button.active {
    border-color: var(--accent-strong);
    background: var(--bg-accent-subtle);
    color: var(--accent-ink);
  }

  .private-member-empty {
    width: 100%;
    justify-content: center;
    color: var(--text-secondary);
  }

  .private-member-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .private-presence-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #9ca3af;
    box-shadow: 0 0 0 2px var(--bg-card);
    flex: 0 0 10px;
  }

  .private-member-list button.active .private-presence-dot {
    box-shadow: 0 0 0 2px var(--bg-accent-subtle);
  }

  .private-presence-dot.active {
    background: #22c55e;
  }

  .call-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #1f9d55;
    color: white;
  }

  .call-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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

  .current-location-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    width: 100%;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--accent-strong);
    color: var(--bg-card);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  .current-location-btn:disabled,
  .send-location-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .call-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.68);
  }

  .call-panel {
    width: min(560px, 100%);
    min-height: 420px;
    border-radius: 20px;
    background: #111318;
    color: white;
    display: grid;
    grid-template-rows: auto 1fr auto;
    overflow: hidden;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
  }

  .call-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px 20px;
  }

  .call-header span {
    font-size: 18px;
    font-weight: 900;
  }

  .call-header small {
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    font-weight: 700;
  }

  .video-grid {
    position: relative;
    min-height: 300px;
    overflow: hidden;
    background:
      radial-gradient(circle at 30% 18%, rgba(31, 157, 85, 0.28), transparent 34%),
      radial-gradient(circle at 78% 72%, rgba(93, 95, 239, 0.24), transparent 36%),
      linear-gradient(135deg, #12151c, #050608);
  }

  .video-grid video {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    min-height: 300px;
    object-fit: cover;
    background: transparent;
    transition: opacity 0.2s ease;
  }

  .video-grid video.hidden-video {
    opacity: 0;
  }

  .remote-avatar-backdrop {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    opacity: 0;
    transform: scale(0.98);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
  }

  .remote-avatar-backdrop.visible {
    opacity: 1;
    transform: scale(1);
  }

  .remote-avatar-ring {
    width: 138px;
    height: 138px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.14);
    border: 3px solid rgba(255, 255, 255, 0.26);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.38);
  }

  .remote-avatar-ring img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .remote-avatar-ring span {
    font-size: 60px;
    line-height: 1;
    font-weight: 900;
    color: white;
  }

  .remote-avatar-backdrop strong {
    color: white;
    font-size: 18px;
    font-weight: 900;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  }

  .video-grid .local-video {
    position: absolute;
    z-index: 3;
    right: 14px;
    bottom: 14px;
    width: 132px;
    height: 176px;
    min-height: 0;
    border-radius: 14px;
    border: 2px solid rgba(255, 255, 255, 0.28);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  }

  .call-controls,
  .incoming-call-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 18px;
  }

  .call-controls button,
  .incoming-call-actions button {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    color: white;
  }

  .incoming-call-actions {
    min-height: 260px;
  }

  .accept-call {
    background: #1f9d55 !important;
  }

  .decline-call {
    background: #e03131 !important;
  }
</style>

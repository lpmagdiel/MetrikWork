import { writable } from 'svelte/store';
import { db } from './firebase.js';
import {
    onSnapshot,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    startAfter,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    setDoc,
    deleteDoc,
    where
} from 'firebase/firestore';
import { createNotification } from './notifications.js';

export const chatMessagesStore = writable([]);
let chatUnsubscribe;
let privateCallsUnsubscribe;
let incomingPrivateCallsUnsubscribe;
const CHAT_PAGE_SIZE = 30;

function normalizeMessageDoc(doc) {
    return { id: doc.id, ...doc.data(), _snapshot: doc };
}

function sortMessages(messages) {
    return messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function subscribeToTeamChat(teamId, pageSize = CHAT_PAGE_SIZE) {
    if (chatUnsubscribe) chatUnsubscribe();
    chatMessagesStore.set([]);
    if (!teamId) return;
    const messagesQuery = query(
        collection(db, 'teams', teamId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
    );
    chatUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs.map(normalizeMessageDoc);
        chatMessagesStore.set(sortMessages(messages));
    }, (error) => {
        console.error("Error in chat listener:", error);
    });
}

export async function getOlderTeamMessages(teamId, oldestMessage, pageSize = CHAT_PAGE_SIZE) {
    if (!teamId || !oldestMessage?._snapshot) return [];
    const messagesQuery = query(
        collection(db, 'teams', teamId, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(oldestMessage._snapshot),
        limit(pageSize)
    );
    const snapshot = await getDocs(messagesQuery);
    return sortMessages(snapshot.docs.map(normalizeMessageDoc));
}

export function mergeChatMessages(existingMessages = [], olderMessages = []) {
    const messagesById = new Map();
    [...olderMessages, ...existingMessages].forEach((message) => {
        messagesById.set(message.id, message);
    });
    return sortMessages(Array.from(messagesById.values()));
}

function getMessagePreview(messageData) {
    if (messageData.text) return messageData.text;
    if (messageData.type === 'IMAGE' || messageData.imageUrl) return 'Envió una imagen';
    if (messageData.type === 'SIMPLE_LOCATION') return 'Envió una ubicación';
    if (messageData.type === 'POLL') return 'Envió una encuesta';
    return 'Nuevo mensaje';
}

function getPrivateChatUrl(teamId, memberId, callId = '') {
    if (!teamId || !memberId) return teamId ? `/teams/${encodeURIComponent(teamId)}/chat` : '/teams';

    const params = new URLSearchParams({
        mode: 'private',
        member: memberId
    });

    if (callId) params.set('call', callId);

    return `/teams/${encodeURIComponent(teamId)}/chat?${params.toString()}`;
}

async function notifyTeamMembersAboutMessage(teamId, messageId, messageData) {
    try {
        const teamSnapshot = await getDoc(doc(db, 'teams', teamId));
        if (!teamSnapshot.exists()) return;

        const teamData = teamSnapshot.data();
        const members = Array.isArray(teamData.members) ? teamData.members : [];
        const recipients = members.filter((memberId) => memberId && memberId !== messageData.senderId);
        if (recipients.length === 0) return;

        const teamName = teamData.team || teamData.name || 'Equipo';
        const senderName = messageData.senderName || 'Alguien';
        const title = `${senderName} en ${teamName}`;
        const message = getMessagePreview(messageData);
        const url = `/teams/${teamId}/chat`;

        const results = await Promise.allSettled(
            recipients.map((uid) =>
                createNotification(uid, title, message, {
                    url,
                    type: 'chat_message',
                    sourceId: messageId,
                    teamId,
                    showInForeground: false
                })
            )
        );

        results
            .filter((result) => result.status === 'rejected')
            .forEach((result) => {
                console.warn('Chat notification failed:', result.reason);
            });
    } catch (error) {
        console.warn('Message was sent, but chat notifications failed:', error);
    }
}

export async function sendTeamMessage(teamId, content, user, imageUrl = null, extraData = {}) {
    if (!user || !teamId) return;
    try {
        const messageData = {
            text: content,
            imageUrl: imageUrl,
            type: extraData.type || (imageUrl ? 'IMAGE' : 'TEXT'),
            senderId: user.uid,
            senderName: user.name || user.email,
            createdAt: new Date().toISOString()
        };

        if (extraData.location) {
            messageData.location = extraData.location;
        }

        if (extraData.poll) {
            messageData.poll = extraData.poll;
        }

        const docRef = await addDoc(collection(db, 'teams', teamId, 'messages'), {
            ...messageData
        });
        notifyTeamMembersAboutMessage(teamId, docRef.id, messageData);
        try {
            const chatStats = JSON.parse(localStorage.getItem('chatStats')) || { totalMessages: 0 };
            chatStats.totalMessages = (chatStats.totalMessages || 0) + 1;
            localStorage.setItem('chatStats', JSON.stringify(chatStats));
        } catch (e) {
            console.log('Error saving chat stats to localStorage:', e);
        }
    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

export function getPrivateChatId(teamId, firstUserId, secondUserId) {
    if (!teamId || !firstUserId || !secondUserId) return '';
    return `${teamId}_${[firstUserId, secondUserId].sort().join('_')}`;
}

async function ensurePrivateChat(teamId, currentUser, member) {
    const chatId = getPrivateChatId(teamId, currentUser?.uid, member?.id);
    if (!chatId) return null;

    await setDoc(doc(db, 'privateChats', chatId), {
        teamId,
        participants: [currentUser.uid, member.id].sort(),
        participantNames: {
            [currentUser.uid]: currentUser.name || currentUser.email || 'Usuario',
            [member.id]: member.name || member.email || 'Usuario'
        },
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
    }, { merge: true });

    return chatId;
}

export async function getOrCreatePrivateChat(teamId, currentUser, member) {
    return ensurePrivateChat(teamId, currentUser, member);
}

export async function subscribeToPrivateChat(teamId, currentUser, member, pageSize = CHAT_PAGE_SIZE) {
    if (chatUnsubscribe) chatUnsubscribe();
    chatMessagesStore.set([]);
    if (!teamId || !currentUser?.uid || !member?.id) return null;

    const chatId = await ensurePrivateChat(teamId, currentUser, member);
    if (!chatId) return null;

    const messagesQuery = query(
        collection(db, 'privateChats', chatId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
    );
    chatUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs.map(normalizeMessageDoc);
        chatMessagesStore.set(sortMessages(messages));
    }, (error) => {
        console.error("Error in private chat listener:", error);
    });

    return chatId;
}

export async function getOlderPrivateMessages(chatId, oldestMessage, pageSize = CHAT_PAGE_SIZE) {
    if (!chatId || !oldestMessage?._snapshot) return [];
    const messagesQuery = query(
        collection(db, 'privateChats', chatId, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(oldestMessage._snapshot),
        limit(pageSize)
    );
    const snapshot = await getDocs(messagesQuery);
    return sortMessages(snapshot.docs.map(normalizeMessageDoc));
}

export async function sendPrivateMessage(chatId, content, user, recipient, imageUrl = null, teamId = '', extraData = {}) {
    if (!chatId || !user?.uid || !recipient?.id) return;
    try {
        const messageData = {
            text: content,
            imageUrl,
            type: extraData.type || (imageUrl ? 'IMAGE' : 'TEXT'),
            senderId: user.uid,
            senderName: user.name || user.email,
            recipientId: recipient.id,
            createdAt: new Date().toISOString()
        };

        if (extraData.location) {
            messageData.location = extraData.location;
        }

        const docRef = await addDoc(collection(db, 'privateChats', chatId, 'messages'), messageData);
        await updateDoc(doc(db, 'privateChats', chatId), {
            lastMessage: getMessagePreview(messageData),
            lastMessageAt: messageData.createdAt,
            updatedAt: messageData.createdAt
        });

        createNotification(recipient.id, user.name || 'Mensaje privado', getMessagePreview(messageData), {
            url: getPrivateChatUrl(teamId, user.uid),
            type: 'private_chat_message',
            sourceId: docRef.id,
            chatId,
            teamId,
            memberId: user.uid,
            showInForeground: false
        }).catch((error) => {
            console.warn('Private chat notification failed:', error);
        });
    } catch (error) {
        console.error("Error sending private message:", error);
        throw error;
    }
}

export async function createPrivateCall(chatId, teamId, caller, receiver) {
    if (!chatId || !caller?.uid || !receiver?.id) return null;
    const now = new Date().toISOString();
    const callRef = await addDoc(collection(db, 'privateChats', chatId, 'calls'), {
        teamId,
        chatId,
        callerId: caller.uid,
        callerName: caller.name || caller.email || 'Usuario',
        receiverId: receiver.id,
        receiverName: receiver.name || receiver.email || 'Usuario',
        participants: [caller.uid, receiver.id].sort(),
        status: 'ringing',
        createdAt: now,
        updatedAt: now
    });

    createNotification(receiver.id, 'Llamada entrante', `${caller.name || caller.email || 'Alguien'} te está llamando`, {
        url: getPrivateChatUrl(teamId, caller.uid, callRef.id),
        type: 'private_call',
        sourceId: callRef.id,
        chatId,
        teamId,
        memberId: caller.uid,
        callId: callRef.id,
        showInForeground: true
    }).catch((error) => {
        console.warn('Private call notification failed:', error);
    });

    return callRef.id;
}

export function subscribeToPrivateCalls(chatId, userId, callback) {
    if (privateCallsUnsubscribe) privateCallsUnsubscribe();
    if (!chatId || !userId) {
        callback?.(null);
        return;
    }

    privateCallsUnsubscribe = onSnapshot(collection(db, 'privateChats', chatId, 'calls'), (snapshot) => {
        const activeCall = snapshot.docs
            .map((callDoc) => ({ id: callDoc.id, ...callDoc.data() }))
            .filter((call) =>
                call.participants?.includes(userId) &&
                ['ringing', 'connecting', 'active'].includes(call.status)
            )
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
        callback?.(activeCall);
    }, (error) => {
        console.error('Error in private calls listener:', error);
    });
}

export function subscribeToIncomingPrivateCalls(userId, callback) {
    incomingPrivateCallsUnsubscribe?.();
    incomingPrivateCallsUnsubscribe = null;

    if (!userId) {
        callback?.(null);
        return () => {};
    }

    const callUnsubscribers = new Map();
    const activeCallsByChat = new Map();

    function emitLatestCall() {
        const latestCall = Array.from(activeCallsByChat.values())
            .flat()
            .filter((call) => call.receiverId === userId && ['ringing', 'connecting', 'active'].includes(call.status))
            .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))[0] || null;
        callback?.(latestCall);
    }

    function unsubscribeChatCalls(chatId) {
        callUnsubscribers.get(chatId)?.();
        callUnsubscribers.delete(chatId);
        activeCallsByChat.delete(chatId);
    }

    const chatsQuery = query(
        collection(db, 'privateChats'),
        where('participants', 'array-contains', userId)
    );

    const chatsUnsubscribe = onSnapshot(chatsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const chatId = change.doc.id;

            if (change.type === 'removed') {
                unsubscribeChatCalls(chatId);
                emitLatestCall();
                return;
            }

            if (callUnsubscribers.has(chatId)) return;

            const callsQuery = query(
                collection(db, 'privateChats', chatId, 'calls'),
                where('participants', 'array-contains', userId)
            );

            const callsUnsubscribe = onSnapshot(callsQuery, (callsSnapshot) => {
                const activeCalls = callsSnapshot.docs
                    .map((callDoc) => ({
                        id: callDoc.id,
                        ...callDoc.data(),
                        chatId: callDoc.data().chatId || chatId
                    }))
                    .filter((call) =>
                        call.receiverId === userId &&
                        ['ringing', 'connecting', 'active'].includes(call.status)
                    );

                activeCallsByChat.set(chatId, activeCalls);
                emitLatestCall();
            }, (error) => {
                console.error('Error in incoming private calls listener:', error);
            });

            callUnsubscribers.set(chatId, callsUnsubscribe);
        });
    }, (error) => {
        console.error('Error in private chats listener:', error);
        callback?.(null);
    });

    incomingPrivateCallsUnsubscribe = () => {
        chatsUnsubscribe();
        callUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        callUnsubscribers.clear();
        activeCallsByChat.clear();
        callback?.(null);
    };

    return incomingPrivateCallsUnsubscribe;
}

export async function updatePrivateCall(chatId, callId, data) {
    if (!chatId || !callId) return;
    await updateDoc(doc(db, 'privateChats', chatId, 'calls', callId), {
        ...data,
        updatedAt: new Date().toISOString()
    });
}

export async function endPrivateCall(chatId, callId) {
    if (!chatId || !callId) return;
    await updatePrivateCall(chatId, callId, { status: 'ended', endedAt: new Date().toISOString() });
}

export async function addCallCandidate(chatId, callId, side, candidate) {
    if (!chatId || !callId || !candidate) return;
    await addDoc(collection(db, 'privateChats', chatId, 'calls', callId, `${side}Candidates`), candidate.toJSON());
}

export function subscribeToCallCandidates(chatId, callId, side, callback) {
    if (!chatId || !callId || !side) return () => {};
    return onSnapshot(collection(db, 'privateChats', chatId, 'calls', callId, `${side}Candidates`), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') callback?.(change.doc.data());
        });
    }, (error) => {
        console.error('Error in call candidates listener:', error);
    });
}

export async function clearCallCandidates(chatId, callId) {
    if (!chatId || !callId) return;
    const candidateGroups = ['callerCandidates', 'receiverCandidates'];
    await Promise.all(candidateGroups.map(async (group) => {
        const snapshot = await getDocs(collection(db, 'privateChats', chatId, 'calls', callId, group));
        await Promise.all(snapshot.docs.map((candidateDoc) => deleteDoc(candidateDoc.ref)));
    }));
}

export async function voteTeamPoll(teamId, messageId, userId, optionId) {
    if (!teamId || !messageId || !userId || !optionId) return;
    try {
        const messageRef = doc(db, 'teams', teamId, 'messages', messageId);
        await updateDoc(messageRef, {
            [`poll.votes.${userId}`]: optionId,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error voting poll:", error);
        throw error;
    }
}

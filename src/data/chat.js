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
    doc
} from 'firebase/firestore';
import { createNotification } from './notifications.js';

export const chatMessagesStore = writable([]);
let chatUnsubscribe;
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
    return 'Nuevo mensaje';
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

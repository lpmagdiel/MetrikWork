import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, addDoc } from 'firebase/firestore';

export const chatMessagesStore = writable([]);
let chatUnsubscribe;

export function subscribeToTeamChat(teamId) {
    if (chatUnsubscribe) chatUnsubscribe();
    chatMessagesStore.set([]);
    if (!teamId) return;
    chatUnsubscribe = onSnapshot(collection(db, 'teams', teamId, 'messages'), (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        // @ts-ignore
        messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        chatMessagesStore.set(messages);
    }, (error) => {
        console.error("Error in chat listener:", error);
    });
}

export async function sendTeamMessage(teamId, content, user, imageUrl = null) {
    if (!user || !teamId) return;
    try {
        await addDoc(collection(db, 'teams', teamId, 'messages'), {
            text: content,
            imageUrl: imageUrl,
            senderId: user.uid,
            senderName: user.name || user.email,
            createdAt: new Date().toISOString()
        });
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

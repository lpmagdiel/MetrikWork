import { writable, get } from 'svelte/store';
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

export const userStore = writable(null);
export const authReady = writable(false);
export const settingsStore = writable(null);

let settingsUnsubscribe;

export function isProfileImage(value) {
    if (!value || typeof value !== 'string') return false;
    return /^(https?:|data:|blob:)/i.test(value.trim());
}

export function getProfileImage(profile) {
    if (!profile) return '';
    const avatar = typeof profile.avatar === 'string' ? profile.avatar.trim() : '';
    const photoURL = typeof profile.photoURL === 'string' ? profile.photoURL.trim() : '';
    if (isProfileImage(avatar)) return avatar;
    if (isProfileImage(photoURL)) return photoURL;
    return '';
}

export function subscribeToSettings(uid) {
    if (settingsUnsubscribe) settingsUnsubscribe();
    settingsStore.set(null);
    if (!uid) return;

    const settingsDoc = doc(db, 'users', uid, 'settings', 'default');
    settingsUnsubscribe = onSnapshot(settingsDoc, (doc) => {
        if (doc.exists()) {
            settingsStore.set(doc.data());
        }
    }, (error) => {
        console.error("Error in settings listener:", error);
    });
}

export function initAuth(setupListeners) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const userData = {
                uid: user.uid,
                email: user.email,
                name: user.displayName,
                photoURL: user.photoURL,
            };
            userStore.set(userData);
            
            // Save basic profile for others to see
            setDoc(doc(db, 'users', user.uid), {
                email: user.email,
                emailNormalized: user.email?.trim().toLowerCase() || '',
                name: user.displayName || '',
                photoURL: user.photoURL || '',
                lastLogin: new Date().toISOString()
            }, { merge: true });

            if (setupListeners) setupListeners(user.uid);
        } else {
            userStore.set(null);
            if (setupListeners) setupListeners(null);
        }
        authReady.set(true);
    });
}

const userProfileCache = {}; // In-memory cache to prevent redundant reads

export async function getUserProfile(uid) {
    if (userProfileCache[uid]) {
        return userProfileCache[uid];
    }
    
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            const data = {...userDoc.data(), id: uid};
            const image = getProfileImage(data);
            if (image && !isProfileImage(data.avatar)) {
                data.avatar = image;
            }
            if (image && !data.photoURL) {
                data.photoURL = image;
            }
            userProfileCache[uid] = data;
            return data;
        }
        return null;
    } catch (error) {
        console.error("Error getting user profile:", error);
        return null;
    }
}

export async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
}

export async function updateUserProfile(uid, data) {
    try {
        const userRef = doc(db, 'users', uid);
        const profileData = {
            ...data,
            updatedAt: new Date().toISOString()
        };

        await setDoc(userRef, profileData, { merge: true });
        
        // Update Firebase Auth profile if name is changed
        if (data.name && auth.currentUser) {
            await updateProfile(auth.currentUser, {
                displayName: data.name
            });
        }

        // Update local userStore if it's the current user
        const currentUser = get(userStore);
        if (currentUser && currentUser.uid === uid) {
            userStore.update(u => ({ ...u, ...data }));
        }

        userProfileCache[uid] = {
            ...(userProfileCache[uid] || {}),
            ...profileData,
            id: uid
        };

        return true;
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
}
export async function updateSettings(uid, data) {
    try {
        const settingsRef = doc(db, 'users', uid, 'settings', 'default');
        // Usamos setDoc con merge para crear el documento si no existe o actualizar campos
        await setDoc(settingsRef, {
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (error) {
        console.error("Error updating settings:", error);
        throw error;
    }
}

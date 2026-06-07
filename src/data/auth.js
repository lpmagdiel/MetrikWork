import { writable, get } from 'svelte/store';
import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { deleteField, doc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { uploader } from './fileHelper.js';

export const userStore = writable(null);
export const authReady = writable(false);
export const settingsStore = writable(null);

let settingsUnsubscribe;
const PRIVATE_PROFILE_FIELDS = ['phone', 'address', 'iban', 'bankName'];
const CLOUDINARY_PRESET_AVATAR =
    import.meta.env.VITE_CLOUDINARY_PRESET_AVATAR ||
    import.meta.env.CLOUDINARY_PRESET_AVATAR ||
    'MetricWorkProfile';

function splitProfileData(data = {}) {
    const publicData = {};
    const privateData = {};

    for (const [key, value] of Object.entries(data)) {
        if (PRIVATE_PROFILE_FIELDS.includes(key)) {
            privateData[key] = value;
        } else {
            publicData[key] = value;
        }
    }

    return { publicData, privateData };
}

function stripPrivateProfileData(data = {}) {
    const publicData = { ...data };
    for (const field of PRIVATE_PROFILE_FIELDS) {
        delete publicData[field];
    }
    return publicData;
}

function getPrivateProfileData(data = {}) {
    return PRIVATE_PROFILE_FIELDS.reduce((profile, field) => {
        profile[field] = typeof data[field] === 'string' ? data[field] : '';
        return profile;
    }, {});
}

async function migrateLegacyPrivateProfile(uid) {
    if (!uid) return;

    try {
        const userRef = doc(db, 'users', uid);
        const userSnapshot = await getDoc(userRef);
        if (!userSnapshot.exists()) return;

        const legacyPrivateData = getPrivateProfileData(userSnapshot.data());
        const hasLegacyPrivateData = PRIVATE_PROFILE_FIELDS.some((field) => legacyPrivateData[field]);
        if (!hasLegacyPrivateData) return;

        await setDoc(doc(db, 'users', uid, 'private', 'profile'), {
            ...legacyPrivateData,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        await updateDoc(userRef, PRIVATE_PROFILE_FIELDS.reduce((updates, field) => {
            updates[field] = deleteField();
            return updates;
        }, {}));
    } catch (error) {
        console.error("Error migrating private user profile:", error);
    }
}

async function saveAuthPublicProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    const userSnapshot = await getDoc(userRef);
    const existingData = userSnapshot.exists() ? userSnapshot.data() : {};
    const existingAvatar = isProfileImage(existingData.avatar) && !isProviderProfileImage(existingData.avatar)
        ? existingData.avatar
        : '';
    const existingPhotoURL = isProfileImage(existingData.photoURL) && !isProviderProfileImage(existingData.photoURL)
        ? existingData.photoURL
        : '';
    let copiedProviderImage = '';

    if (!existingAvatar && !existingPhotoURL && isProviderProfileImage(user.photoURL)) {
        try {
            copiedProviderImage = await uploader(user.photoURL, CLOUDINARY_PRESET_AVATAR);
        } catch (error) {
            console.warn('No se pudo copiar la foto de Google a Cloudinary:', error);
        }
    }

    const profileImage = existingAvatar || existingPhotoURL || copiedProviderImage;
    const publicProfile = {
        email: user.email,
        emailNormalized: user.email?.trim().toLowerCase() || '',
        name: user.displayName || '',
        photoURL: profileImage || '',
        lastLogin: new Date().toISOString()
    };

    if (copiedProviderImage && !existingAvatar) {
        publicProfile.avatar = copiedProviderImage;
    }

    if (userSnapshot.exists()) {
        await updateDoc(userRef, {
            ...publicProfile,
            ...PRIVATE_PROFILE_FIELDS.reduce((updates, field) => {
                updates[field] = deleteField();
                return updates;
            }, {})
        });
    } else {
        await setDoc(userRef, publicProfile, { merge: true });
    }

    if (copiedProviderImage && auth.currentUser?.uid === user.uid) {
        try {
            await updateProfile(auth.currentUser, { photoURL: copiedProviderImage });
        } catch (error) {
            console.warn('No se pudo actualizar la foto en Firebase Auth:', error);
        }
    }

    const currentUser = get(userStore);
    if (currentUser?.uid === user.uid) {
        userStore.update((storedUser) => ({
            ...storedUser,
            photoURL: publicProfile.photoURL,
            ...(publicProfile.avatar ? { avatar: publicProfile.avatar } : {})
        }));
    }
}

export function isProfileImage(value) {
    if (!value || typeof value !== 'string') return false;
    return /^(https?:|data:|blob:)/i.test(value.trim());
}

export function isProviderProfileImage(value) {
    if (!value || typeof value !== 'string') return false;

    try {
        const { hostname } = new URL(value.trim());
        return hostname === 'lh3.googleusercontent.com' || hostname.endsWith('.googleusercontent.com');
    } catch {
        return false;
    }
}

export function getProfileImage(profile) {
    if (!profile) return '';
    const avatar = typeof profile.avatar === 'string' ? profile.avatar.trim() : '';
    const photoURL = typeof profile.photoURL === 'string' ? profile.photoURL.trim() : '';
    if (isProfileImage(avatar) && !isProviderProfileImage(avatar)) return avatar;
    if (isProfileImage(photoURL) && !isProviderProfileImage(photoURL)) return photoURL;
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
            
            // Save only public profile data for others to see.
            migrateLegacyPrivateProfile(user.uid)
                .then(() => saveAuthPublicProfile(user))
                .catch((error) => console.error("Error saving auth public profile:", error));

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
            const data = {...stripPrivateProfileData(userDoc.data()), id: uid};
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

export async function getUserPrivateProfile(uid) {
    if (!uid) return null;

    try {
        const privateDoc = await getDoc(doc(db, 'users', uid, 'private', 'profile'));
        if (privateDoc.exists()) {
            return getPrivateProfileData(privateDoc.data());
        }

        if (auth.currentUser?.uid === uid) {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
                return getPrivateProfileData(userDoc.data());
            }
        }

        return null;
    } catch (error) {
        console.error("Error getting private user profile:", error);
        return null;
    }
}

export async function getTeamMemberPrivateProfile(teamId, memberId) {
    if (!teamId || !memberId) return null;

    try {
        const privateDoc = await getDoc(doc(db, 'teams', teamId, 'privateMemberProfiles', memberId));
        return privateDoc.exists() ? getPrivateProfileData(privateDoc.data()) : null;
    } catch (error) {
        console.error("Error getting team member private profile:", error);
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

export async function updateUserProfile(uid, data, options = {}) {
    try {
        await migrateLegacyPrivateProfile(uid);

        const userRef = doc(db, 'users', uid);
        const { publicData, privateData } = splitProfileData(data);
        const now = new Date().toISOString();
        const profileData = {
            ...publicData,
            updatedAt: now
        };

        const userSnapshot = await getDoc(userRef);
        if (userSnapshot.exists()) {
            await updateDoc(userRef, {
                ...profileData,
                ...PRIVATE_PROFILE_FIELDS.reduce((updates, field) => {
                    updates[field] = deleteField();
                    return updates;
                }, {})
            });
        } else {
            await setDoc(userRef, profileData, { merge: true });
        }

        if (Object.keys(privateData).length > 0) {
            const privateProfileData = {
                ...getPrivateProfileData(privateData),
                updatedAt: now
            };
            await setDoc(doc(db, 'users', uid, 'private', 'profile'), privateProfileData, { merge: true });

            const teamIds = Array.isArray(options.teamIds) ? options.teamIds.filter(Boolean) : [];
            await Promise.all(teamIds.map((teamId) =>
                setDoc(doc(db, 'teams', teamId, 'privateMemberProfiles', uid), {
                    phone: privateProfileData.phone || '',
                    iban: privateProfileData.iban || '',
                    bankName: privateProfileData.bankName || '',
                    updatedAt: now
                }, { merge: true })
            ));
        }
        
        // Update Firebase Auth profile if name is changed
        if (data.name && auth.currentUser) {
            await updateProfile(auth.currentUser, {
                displayName: data.name
            });
        }

        // Update local userStore if it's the current user
        const currentUser = get(userStore);
        if (currentUser && currentUser.uid === uid) {
            userStore.update(u => ({ ...u, ...publicData }));
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

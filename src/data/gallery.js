import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { stripImageFileExtension } from '../helpers/image.js';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';

export const galleryFoldersStore = writable([]);
export const galleryImagesStore = writable([]);
export const galleryShareStore = writable(null);

let foldersUnsubscribe;
let imagesUnsubscribe;
let shareUnsubscribe;

function sortByCreatedAt(items = []) {
    return [...items].sort((a, b) => {
        const dateComparison = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        return dateComparison || String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });
}

function stopGallerySubscriptions() {
    foldersUnsubscribe?.();
    imagesUnsubscribe?.();
    shareUnsubscribe?.();
    foldersUnsubscribe = null;
    imagesUnsubscribe = null;
    shareUnsubscribe = null;
}

export function subscribeToTeamGallery(teamId) {
    stopGallerySubscriptions();
    galleryFoldersStore.set([]);
    galleryImagesStore.set([]);
    galleryShareStore.set(null);

    if (!teamId) return () => {};

    foldersUnsubscribe = onSnapshot(
        collection(db, 'teams', teamId, 'galleryFolders'),
        (snapshot) => {
            galleryFoldersStore.set(sortByCreatedAt(
                snapshot.docs.map((folderDoc) => ({ id: folderDoc.id, ...folderDoc.data() }))
            ));
        },
        (error) => console.error('Error loading gallery folders:', error)
    );

    imagesUnsubscribe = onSnapshot(
        collection(db, 'teams', teamId, 'galleryImages'),
        (snapshot) => {
            galleryImagesStore.set(sortByCreatedAt(
                snapshot.docs.map((imageDoc) => ({ id: imageDoc.id, ...imageDoc.data() }))
            ).reverse());
        },
        (error) => console.error('Error loading gallery images:', error)
    );

    shareUnsubscribe = onSnapshot(
        doc(db, 'teams', teamId, 'galleryMeta', 'share'),
        (snapshot) => galleryShareStore.set(snapshot.exists()
            ? { id: snapshot.id, ...snapshot.data() }
            : null),
        (error) => console.error('Error loading gallery share settings:', error)
    );

    return stopGallerySubscriptions;
}

export async function createGalleryFolder(teamId, name, actorId = '') {
    const normalizedName = String(name || '').trim().slice(0, 60);
    if (!teamId || !normalizedName) throw new Error('Escribe un nombre para la carpeta');

    const folderRef = await addDoc(collection(db, 'teams', teamId, 'galleryFolders'), {
        name: normalizedName,
        createdAt: new Date().toISOString(),
        createdBy: actorId || ''
    });
    await syncPublicGallery(teamId);
    return folderRef.id;
}

export async function addGalleryImages(teamId, images = [], actorId = '') {
    if (!teamId) throw new Error('Equipo no válido');
    const validImages = images.filter((image) => image?.url);
    if (!validImages.length) return [];

    const createdAt = new Date().toISOString();
    const references = await Promise.all(validImages.map((image, index) => addDoc(
        collection(db, 'teams', teamId, 'galleryImages'),
        {
            name: stripImageFileExtension(image.name, `Imagen ${index + 1}`).slice(0, 120),
            url: image.url,
            folderId: image.folderId || '',
            createdAt,
            uploadedBy: actorId || ''
        }
    )));

    await syncPublicGallery(teamId);
    return references.map((reference) => reference.id);
}

export async function deleteGalleryImage(teamId, imageId) {
    if (!teamId || !imageId) return;
    await deleteDoc(doc(db, 'teams', teamId, 'galleryImages', imageId));
    await syncPublicGallery(teamId);
}

export async function updateGalleryImageName(teamId, imageId, name) {
    const normalizedName = stripImageFileExtension(name, '').slice(0, 120);
    if (!teamId || !imageId) throw new Error('Imagen no válida');
    if (!normalizedName) throw new Error('Escribe un nombre para la imagen');

    await updateDoc(doc(db, 'teams', teamId, 'galleryImages', imageId), {
        name: normalizedName,
        updatedAt: new Date().toISOString()
    });
    await syncPublicGallery(teamId);
}

export async function deleteGalleryFolder(teamId, folderId) {
    if (!teamId || !folderId) return;

    const folderImages = await getDocs(query(
        collection(db, 'teams', teamId, 'galleryImages'),
        where('folderId', '==', folderId)
    ));
    if (!folderImages.empty) {
        throw new Error('La carpeta contiene imágenes. Elimínalas antes de borrar la carpeta.');
    }

    await deleteDoc(doc(db, 'teams', teamId, 'galleryFolders', folderId));
    await syncPublicGallery(teamId);
}

export async function ensureGalleryShare(teamId) {
    if (!teamId) throw new Error('Equipo no válido');
    const metaRef = doc(db, 'teams', teamId, 'galleryMeta', 'share');
    const metaSnapshot = await getDoc(metaRef);
    let token = metaSnapshot.data()?.token || '';

    if (!token) {
        token = doc(collection(db, 'galleryShares')).id;
        await setDoc(metaRef, {
            token,
            createdAt: new Date().toISOString()
        });
    }

    await syncPublicGallery(teamId, token);
    return token;
}

export async function syncPublicGallery(teamId, knownToken = '') {
    if (!teamId) return null;

    let token = knownToken;
    if (!token) {
        const metaSnapshot = await getDoc(doc(db, 'teams', teamId, 'galleryMeta', 'share'));
        token = metaSnapshot.data()?.token || '';
    }
    if (!token) return null;

    const [teamSnapshot, foldersSnapshot, imagesSnapshot] = await Promise.all([
        getDoc(doc(db, 'teams', teamId)),
        getDocs(collection(db, 'teams', teamId, 'galleryFolders')),
        getDocs(collection(db, 'teams', teamId, 'galleryImages'))
    ]);

    const folders = sortByCreatedAt(foldersSnapshot.docs.map((folderDoc) => ({
        id: folderDoc.id,
        name: folderDoc.data().name || '',
        createdAt: folderDoc.data().createdAt || ''
    })));
    const images = sortByCreatedAt(imagesSnapshot.docs.map((imageDoc) => ({
        id: imageDoc.id,
        name: imageDoc.data().name || '',
        url: imageDoc.data().url || '',
        folderId: imageDoc.data().folderId || '',
        createdAt: imageDoc.data().createdAt || ''
    }))).reverse();

    await setDoc(doc(db, 'galleryShares', token), {
        teamId,
        teamName: teamSnapshot.data()?.team || 'Galería compartida',
        folders,
        images,
        readOnly: true,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return token;
}

export async function getPublicGallery(token) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) throw new Error('Enlace de galería no válido');

    const shareSnapshot = await getDoc(doc(db, 'galleryShares', normalizedToken));
    if (!shareSnapshot.exists()) return null;
    return { id: shareSnapshot.id, ...shareSnapshot.data() };
}

import { writable } from 'svelte/store';
import { db } from './firebase.js';
import {
    onSnapshot,
    collection,
    addDoc,
    doc,
    deleteDoc,
    updateDoc,
    query,
    where,
    getDoc
} from 'firebase/firestore';

export const inventoryStore = writable([]);
export const inventoryMovementsStore = writable([]);
let inventoryUnsubscribe;
let inventoryMovementsUnsubscribe;

const TRACKED_INVENTORY_FIELDS = [
    'name',
    'quantity',
    'price',
    'category',
    'minStock',
    'productType',
    'locationId',
    'locationName',
    'imageUrl'
];

export function subscribeToTeamInventory(teamId) {
    if (inventoryUnsubscribe) inventoryUnsubscribe();
    inventoryStore.set([]);
    if (!teamId) return;
    const inventoryCollection = collection(db, 'teams', teamId, 'inventory');
    inventoryUnsubscribe = onSnapshot(inventoryCollection, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
        });
        inventoryStore.set(items);
    }, (error) => {
        console.error("Error in inventory listener:", error);
    });
}

export function subscribeToProductMovements(teamId, productId) {
    if (inventoryMovementsUnsubscribe) inventoryMovementsUnsubscribe();
    inventoryMovementsStore.set([]);
    if (!teamId || !productId) return () => {};

    const movementsQuery = query(
        collection(db, 'teams', teamId, 'inventoryMovements'),
        where('productId', '==', productId)
    );
    const unsubscribe = onSnapshot(movementsQuery, (snapshot) => {
        const movements = snapshot.docs
            .map((movementDoc) => ({ id: movementDoc.id, ...movementDoc.data() }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        inventoryMovementsStore.set(movements);
    }, (error) => {
        console.error("Error in inventory movements listener:", error);
        inventoryMovementsStore.set([]);
    });
    inventoryMovementsUnsubscribe = unsubscribe;

    return () => {
        unsubscribe();
        if (inventoryMovementsUnsubscribe === unsubscribe) {
            inventoryMovementsUnsubscribe = null;
            inventoryMovementsStore.set([]);
        }
    };
}

function normalizeActor(actor = {}) {
    return {
        actorId: actor.uid || actor.id || '',
        actorName: actor.name || actor.displayName || actor.email || 'Usuario',
        actorEmail: actor.email || ''
    };
}

function normalizeInventoryNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeProductForMovement(product = {}) {
    return {
        name: product.name || '',
        quantity: normalizeInventoryNumber(product.quantity),
        price: normalizeInventoryNumber(product.price),
        category: product.category || '',
        minStock: normalizeInventoryNumber(product.minStock),
        productType: product.productType || 'material',
        locationId: product.locationId || '',
        locationName: product.locationName || '',
        imageUrl: product.imageUrl || ''
    };
}

function getChangedFields(before = {}, after = {}) {
    return TRACKED_INVENTORY_FIELDS.filter((field) => {
        const beforeValue = before[field] ?? '';
        const afterValue = after[field] ?? '';
        return String(beforeValue) !== String(afterValue);
    });
}

function getMovementAction(before = {}, after = {}) {
    const beforeQuantity = normalizeInventoryNumber(before.quantity);
    const afterQuantity = normalizeInventoryNumber(after.quantity);

    if (afterQuantity > beforeQuantity) return 'stock-in';
    if (afterQuantity < beforeQuantity) return 'stock-out';
    return 'updated';
}

function buildMovementPayload({
    productId,
    before = null,
    after = null,
    action,
    actor
}) {
    const beforeProduct = before ? normalizeProductForMovement(before) : null;
    const afterProduct = after ? normalizeProductForMovement(after) : null;
    const referenceProduct = afterProduct || beforeProduct || {};
    const beforeQuantity = beforeProduct ? normalizeInventoryNumber(beforeProduct.quantity) : null;
    const afterQuantity = afterProduct ? normalizeInventoryNumber(afterProduct.quantity) : null;
    const changedFields = beforeProduct && afterProduct ? getChangedFields(beforeProduct, afterProduct) : [];

    return {
        productId,
        productName: referenceProduct.name || 'Producto',
        productType: referenceProduct.productType || 'material',
        action,
        changedFields,
        quantityBefore: beforeQuantity,
        quantityAfter: afterQuantity,
        quantityDelta:
            beforeQuantity !== null && afterQuantity !== null
                ? afterQuantity - beforeQuantity
                : afterQuantity ?? null,
        locationBefore: beforeProduct?.locationName || '',
        locationAfter: afterProduct?.locationName || '',
        priceBefore: beforeProduct?.price ?? null,
        priceAfter: afterProduct?.price ?? null,
        categoryBefore: beforeProduct?.category || '',
        categoryAfter: afterProduct?.category || '',
        minStockBefore: beforeProduct?.minStock ?? null,
        minStockAfter: afterProduct?.minStock ?? null,
        ...normalizeActor(actor),
        createdAt: new Date().toISOString()
    };
}

async function addInventoryMovement(teamId, payload) {
    if (!teamId || !payload?.productId) return;
    try {
        await addDoc(collection(db, 'teams', teamId, 'inventoryMovements'), payload);
    } catch (error) {
        console.warn("No se pudo registrar el movimiento de inventario:", error);
    }
}

export async function addProduct(teamId, productData, options = {}) {
    if (!teamId) return;
    try {
        const itemData = {
            ...productData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'teams', teamId, 'inventory'), itemData);
        await addInventoryMovement(teamId, buildMovementPayload({
            productId: docRef.id,
            after: itemData,
            action: 'created',
            actor: options.actor
        }));
        return docRef.id;
    } catch (error) {
        console.error("Error adding product:", error);
        throw error;
    }
}

export async function updateProduct(teamId, productId, data, options = {}) {
    if (!teamId) return;
    try {
        const productRef = doc(db, 'teams', teamId, 'inventory', productId);
        const snapshot = await getDoc(productRef);
        const previousData = snapshot.exists() ? snapshot.data() : {};
        const nextData = { ...previousData, ...data, updatedAt: new Date().toISOString() };
        const changedFields = getChangedFields(
            normalizeProductForMovement(previousData),
            normalizeProductForMovement(nextData)
        );

        await updateDoc(productRef, { ...data, updatedAt: nextData.updatedAt });

        if (changedFields.length > 0) {
            await addInventoryMovement(teamId, buildMovementPayload({
                productId,
                before: previousData,
                after: nextData,
                action: getMovementAction(previousData, nextData),
                actor: options.actor
            }));
        }
    } catch (error) {
        console.error("Error updating product:", error);
        throw error;
    }
}

export async function deleteProduct(teamId, productId, options = {}) {
    if (!teamId) return;
    try {
        const productRef = doc(db, 'teams', teamId, 'inventory', productId);
        const snapshot = await getDoc(productRef);
        const previousData = snapshot.exists() ? snapshot.data() : {};
        await addInventoryMovement(teamId, buildMovementPayload({
            productId,
            before: previousData,
            action: 'deleted',
            actor: options.actor
        }));
        await deleteDoc(productRef);
    } catch (error) {
        console.error("Error deleting product:", error);
        throw error;
    }
}

import { get } from 'svelte/store';
import { db } from './firebase.js';
import {
    addDoc,
    arrayUnion,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    writeBatch,
    where
} from 'firebase/firestore';
import { userStore } from './auth.js';
import { teamsStore } from './teams.js';
import { createNotification } from './notifications.js';
import { normalizeTeamPermissions } from './permissions.js';

export const REQUEST_STATUS = {
    pending: 'pendiente',
    accepted: 'aceptado',
    rejected: 'rechazado'
};

export const ABSENCE_TYPES = [
    { value: 'dia_libre', label: 'Día libre' },
    { value: 'vacaciones', label: 'Vacaciones' },
    { value: 'cita_medica', label: 'Cita médica' },
    { value: 'baja_enfermedad', label: 'Baja por enfermedad' },
    { value: 'permiso_maternidad', label: 'Permiso por maternidad' },
    { value: 'permiso_paternidad', label: 'Permiso por paternidad' },
    { value: 'asunto_personal', label: 'Asunto personal' },
    { value: 'emergencia_familiar', label: 'Emergencia familiar' },
    { value: 'duelo', label: 'Duelo o fallecimiento' },
    { value: 'formacion', label: 'Formación o capacitación' },
    { value: 'permiso_sin_sueldo', label: 'Permiso sin sueldo' },
    { value: 'permiso_oficial', label: 'Permiso oficial' }
];

function getAbsenceTypeLabel(value) {
    return ABSENCE_TYPES.find((type) => type.value === value)?.label || value || 'Ausencia';
}

function sortRequests(requests) {
    return requests.sort((a, b) => {
        const aDate = a.createdAt || a.startDate || '';
        const bDate = b.createdAt || b.startDate || '';
        return bDate.localeCompare(aDate);
    });
}

function snapshotToRequests(snapshot) {
    return snapshot.docs.map((requestDoc) => ({
        id: requestDoc.id,
        ...requestDoc.data()
    }));
}

export async function createAbsenceRequest({ teamId, absenceType, startDate, endDate, note = '' }) {
    const user = get(userStore);
    const teams = get(teamsStore) || [];
    const team = teams.find((item) => item.id === teamId);

    if (!user?.uid) throw new Error('Usuario no autenticado');
    if (!team) throw new Error('Equipo no encontrado');
    if (!team.admin) throw new Error('El equipo no tiene administrador configurado');
    if (!absenceType || !startDate || !endDate) throw new Error('Solicitud incompleta');

    const typeLabel = getAbsenceTypeLabel(absenceType);
    const requesterName = user.name || user.email || 'Un miembro';
    const teamName = team.name || team.team || 'Equipo';
    const now = new Date().toISOString();

    const docRef = await addDoc(collection(db, 'absenceRequests'), {
        teamId,
        teamName,
        adminId: team.admin,
        requesterId: user.uid,
        requesterName,
        requesterEmail: user.email || '',
        absenceType,
        absenceTypeLabel: typeLabel,
        startDate,
        endDate,
        note: note.trim(),
        status: REQUEST_STATUS.pending,
        createdAt: now,
        updatedAt: now
    });

    if (team.admin !== user.uid) {
        await createNotification(
            team.admin,
            'Nueva solicitud de ausencia',
            `${requesterName} solicitó ${typeLabel} en ${teamName}.`,
            {
                url: '/requests',
                type: 'absence_request',
                sourceId: docRef.id,
                teamId
            }
        );
    }

    return docRef.id;
}

export async function getAbsenceRequestsForUser(uid) {
    if (!uid) return { own: [], incoming: [], invitations: [] };

    const [ownSnapshot, incomingSnapshot, invitationsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'absenceRequests'), where('requesterId', '==', uid))),
        getDocs(query(collection(db, 'absenceRequests'), where('adminId', '==', uid))),
        getDocs(collection(db, 'users', uid, 'teamInvitations'))
    ]);

    return {
        own: sortRequests(snapshotToRequests(ownSnapshot)),
        incoming: sortRequests(snapshotToRequests(incomingSnapshot)),
        invitations: sortRequests(snapshotToRequests(invitationsSnapshot))
    };
}

export async function updateAbsenceRequestStatus(requestId, status) {
    const user = get(userStore);
    if (!user?.uid) throw new Error('Usuario no autenticado');
    if (![REQUEST_STATUS.accepted, REQUEST_STATUS.rejected].includes(status)) {
        throw new Error('Estado de solicitud no válido');
    }

    const requestRef = doc(db, 'absenceRequests', requestId);
    const requestSnapshot = await getDoc(requestRef);
    if (!requestSnapshot.exists()) throw new Error('Solicitud no encontrada');

    const requestData = requestSnapshot.data();
    const now = new Date().toISOString();

    await updateDoc(requestRef, {
        status,
        reviewedAt: now,
        reviewedBy: user.uid,
        updatedAt: now
    });

    const accepted = status === REQUEST_STATUS.accepted;
    await createNotification(
        requestData.requesterId,
        accepted ? 'Solicitud aceptada' : 'Solicitud rechazada',
        `Tu solicitud de ${requestData.absenceTypeLabel || 'ausencia'} en ${requestData.teamName || 'el equipo'} fue ${status}.`,
        {
            url: '/requests',
            type: 'absence_request_status',
            sourceId: requestId,
            teamId: requestData.teamId
        }
    );

    return true;
}

export async function updateTeamInvitationStatus(teamId, status) {
    const user = get(userStore);
    if (!user?.uid) throw new Error('Usuario no autenticado');
    if (![REQUEST_STATUS.accepted, REQUEST_STATUS.rejected].includes(status)) {
        throw new Error('Estado de invitación no válido');
    }

    const invitationRef = doc(db, 'users', user.uid, 'teamInvitations', teamId);
    const invitationSnapshot = await getDoc(invitationRef);
    if (!invitationSnapshot.exists()) throw new Error('Invitación no encontrada');

    const invitation = invitationSnapshot.data();
    if (invitation.status !== REQUEST_STATUS.pending) {
        throw new Error('Esta invitación ya fue respondida');
    }

    const now = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(invitationRef, {
        status,
        reviewedAt: now,
        reviewedBy: user.uid,
        updatedAt: now
    });

    if (status === REQUEST_STATUS.accepted) {
        const memberImage = invitation.invitedUserPhotoURL || user.avatar || user.photoURL || '';
        batch.update(doc(db, 'teams', teamId), {
            members: arrayUnion(user.uid),
            membersData: arrayUnion({
                id: user.uid,
                name: invitation.invitedUserName || user.name || user.email || 'Miembro',
                avatar: memberImage,
                photoURL: memberImage
            }),
            [`memberPermissions.${user.uid}`]: normalizeTeamPermissions(invitation.permissions),
            updatedAt: now
        });
    }

    await batch.commit();

    if (invitation.invitedBy && invitation.invitedBy !== user.uid) {
        await createNotification(
            invitation.invitedBy,
            status === REQUEST_STATUS.accepted ? 'Invitación aceptada' : 'Invitación rechazada',
            `${invitation.invitedUserName || user.name || user.email || 'El usuario'} ${status === REQUEST_STATUS.accepted ? 'aceptó' : 'rechazó'} la invitación a ${invitation.teamName || 'el equipo'}.`,
            {
                url: `/teams/${teamId}/settings`,
                type: 'team_invitation_status',
                sourceId: teamId,
                teamId,
                memberId: user.uid
            }
        );
    }

    return true;
}

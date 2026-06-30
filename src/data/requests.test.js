import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  arrayUnion: vi.fn((value) => ({ operation: 'arrayUnion', value })),
  batchCommit: vi.fn(),
  batchUpdate: vi.fn(),
  getDoc: vi.fn(),
  writeBatch: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  arrayUnion: firestoreMocks.arrayUnion,
  collection: vi.fn(),
  doc: vi.fn((_db, ...segments) => segments.join('/')),
  getDoc: firestoreMocks.getDoc,
  getDocs: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: firestoreMocks.writeBatch
}));

vi.mock('./firebase.js', () => ({ db: {} }));
vi.mock('./auth.js', () => ({
  userStore: {
    subscribe(run) {
      run({ uid: 'invitee-1', name: 'Ana', email: 'ana@example.com' });
      return () => {};
    }
  }
}));
vi.mock('./teams.js', () => ({
  teamsStore: {
    subscribe(run) {
      run([]);
      return () => {};
    }
  }
}));
vi.mock('./notifications.js', () => ({
  createNotification: vi.fn().mockResolvedValue(null)
}));

import { REQUEST_STATUS, updateTeamInvitationStatus } from './requests.js';

describe('team invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.writeBatch.mockReturnValue({
      update: firestoreMocks.batchUpdate,
      commit: firestoreMocks.batchCommit
    });
    firestoreMocks.batchCommit.mockResolvedValue();
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        teamId: 'team-1',
        teamName: 'Equipo de prueba',
        invitedUserId: 'invitee-1',
        invitedUserName: 'Ana',
        invitedBy: 'admin-1',
        permissions: { tasks: { view: true } },
        status: REQUEST_STATUS.pending
      })
    });
  });

  it('acepta sin intentar leer el equipo antes de la escritura atomica', async () => {
    await updateTeamInvitationStatus('team-1', REQUEST_STATUS.accepted);

    expect(firestoreMocks.getDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.getDoc).toHaveBeenCalledWith(
      'users/invitee-1/teamInvitations/team-1'
    );
    expect(firestoreMocks.batchUpdate).toHaveBeenCalledTimes(2);
    expect(firestoreMocks.batchUpdate).toHaveBeenNthCalledWith(
      2,
      'teams/team-1',
      expect.objectContaining({
        members: { operation: 'arrayUnion', value: 'invitee-1' },
        'memberPermissions.invitee-1': expect.objectContaining({
          tasks: expect.objectContaining({ view: true })
        })
      })
    );
    expect(firestoreMocks.batchCommit).toHaveBeenCalledOnce();
  });
});

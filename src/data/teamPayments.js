import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getWorksByTeamId } from './works.js';
import { getBankName } from '../helpers/banks.js';

const MONEY_EPSILON = 0.01;

function roundMetric(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function getWorkUnits(work) {
    if (work.type === 'full-day') return 1;
    if (work.type === 'half-day') return 0.5;
    if (work.type === 'variable' && work.timerMode !== 'overtime') {
        return getVariableHours(work) / 8;
    }
    return 0;
}

function getVariableHours(work) {
    return Math.max(0, Number(work?.variableHours ?? work?.durationHours) || 0);
}

function getWorkAmount(work, dailyRate, extraHourRate) {
    const base = getWorkUnits(work) * dailyRate;
    const overtime = (Number(work.overtimeHours) || 0) * extraHourRate;
    return base + overtime;
}

function sortWorksByDate(works = []) {
    return [...works].sort((a, b) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '');
        if (dateCompare) return dateCompare;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

function applyPaymentsToWorks(userWorks, totalPaid, dailyRate, extraHourRate) {
    let remainingPaid = Math.max(0, Number(totalPaid) || 0);
    const annotatedWorks = userWorks.map((work) => {
        const workUnits = getWorkUnits(work);
        const workAmount = getWorkAmount(work, dailyRate, extraHourRate);
        const paidAmount = Math.min(workAmount, remainingPaid);
        const pendingAmount = Math.max(workAmount - paidAmount, 0);
        const pendingRatio = workAmount > MONEY_EPSILON ? pendingAmount / workAmount : 0;
        const paymentStatus = pendingAmount <= MONEY_EPSILON
            ? 'paid'
            : paidAmount > MONEY_EPSILON
                ? 'partial'
                : 'unpaid';

        remainingPaid = Math.max(remainingPaid - workAmount, 0);

        return {
            ...work,
            workUnits: roundMetric(workUnits, 4),
            workAmount,
            paidAmount,
            pendingAmount,
            pendingWorkUnits: roundMetric(workUnits * pendingRatio, 4),
            pendingOvertimeHours: roundMetric((Number(work.overtimeHours) || 0) * pendingRatio, 4),
            paymentStatus,
            paid: paymentStatus === 'paid'
        };
    });

    const pendingWorks = annotatedWorks.filter((work) => Number(work.pendingAmount) > MONEY_EPSILON);
    const pendingWorkDays = pendingWorks.reduce((sum, work) => sum + (Number(work.pendingWorkUnits) || 0), 0);
    const pendingOvertimeHours = pendingWorks.reduce((sum, work) => sum + (Number(work.pendingOvertimeHours) || 0), 0);
    const pendingEarned = pendingWorks.reduce((sum, work) => sum + (Number(work.pendingAmount) || 0), 0);

    return {
        annotatedWorks,
        pendingWorks,
        pendingWorkDays: roundMetric(pendingWorkDays, 4),
        pendingOvertimeHours: roundMetric(pendingOvertimeHours, 4),
        pendingEarned,
        unappliedPaidAmount: remainingPaid
    };
}

function normalizeCoveredWorks(coveredWorks = []) {
    if (!Array.isArray(coveredWorks)) return [];
    return coveredWorks
        .map((work) => ({
            id: work?.id || '',
            date: work?.date || '',
            type: work?.type || '',
            amount: Math.max(0, Number(work?.paymentAppliedAmount ?? work?.pendingAmount ?? work?.amount) || 0),
            pendingAmountBeforePayment: Math.max(0, Number(work?.pendingAmountBeforePayment ?? work?.pendingAmount) || 0),
            workUnits: Math.max(0, Number(work?.pendingWorkUnits ?? work?.workUnits) || 0),
            overtimeHours: Math.max(0, Number(work?.pendingOvertimeHours ?? work?.overtimeHours) || 0)
        }))
        .filter((work) => work.id || work.date || work.amount > 0);
}

export async function getTeamPaymentsData(teamId) {
    try {
        // 1. Get works for the team
        const works = await getWorksByTeamId(teamId);
        // 2. Get registered payments for the team
        const paymentsQuery = query(collection(db, 'team_payments'), where('teamId', '==', teamId));
        const [paymentsSnapshot, privateProfilesSnapshot] = await Promise.all([
            getDocs(paymentsQuery),
            getDocs(collection(db, 'teams', teamId, 'privateMemberProfiles'))
        ]);
        const payments = [];
        paymentsSnapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));
        const privateProfiles = new Map();
        privateProfilesSnapshot.forEach(doc => {
            const data = doc.data() || {};
            privateProfiles.set(doc.id, {
                phone: typeof data.phone === 'string' ? data.phone : '',
                iban: typeof data.iban === 'string' ? data.iban : '',
                bankName: typeof data.bankName === 'string' && data.bankName.trim()
                    ? data.bankName
                    : getBankName(data.iban)
            });
        });

        // 3. Get team document to have rates and member names
        const teamDoc = await getDoc(doc(db, 'teams', teamId));
        const teamData = teamDoc.data();
        if (!teamData) throw new Error("Team not found");

        const memberSettings = teamData.memberSettings || {};
        const membersData = teamData.membersData || [];

        // 4. Calculate balances per user
        const memberBalances = membersData.map(member => {
            const userId = member.id;
            const settings = memberSettings[userId] || {};
            const privateProfile = privateProfiles.get(userId) || {};
            const dailyRate = Number(settings.dailyRate) || 0;
            const extraHourRate = Number(settings.extraHourRate) || 0;

            const userWorks = sortWorksByDate(works[userId] || []);
            const userPayments = payments
                .filter(p => p.userId === userId)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            let totalFullDays = 0;
            let totalHalfDays = 0;
            let totalVariableHours = 0;
            let totalWorkDays = 0;
            let totalOvertimeHours = 0;
            let totalEarned = 0;

            userWorks.forEach(work => {
                totalWorkDays += getWorkUnits(work);
                if (work.type === 'full-day') {
                    totalFullDays++;
                } else if (work.type === 'half-day') {
                    totalHalfDays++;
                } else if (work.type === 'variable' && work.timerMode !== 'overtime') {
                    totalVariableHours += getVariableHours(work);
                }
                if (work.overtimeHours > 0) {
                    totalOvertimeHours += Number(work.overtimeHours) || 0;
                }
                totalEarned += getWorkAmount(work, dailyRate, extraHourRate);
            });

            const totalPaid = userPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const balance = Math.max(totalEarned - totalPaid, 0);
            const overpaidAmount = Math.max(totalPaid - totalEarned, 0);
            const {
                annotatedWorks,
                pendingWorks,
                pendingWorkDays,
                pendingOvertimeHours,
                pendingEarned,
                unappliedPaidAmount
            } = applyPaymentsToWorks(userWorks, totalPaid, dailyRate, extraHourRate);

            return {
                id: userId,
                name: member.name,
                totalFullDays,
                totalHalfDays,
                totalVariableHours,
                totalWorkDays: roundMetric(totalWorkDays, 4),
                totalOvertimeHours: roundMetric(totalOvertimeHours, 4),
                totalEarned,
                totalPaid,
                balance,
                overpaidAmount,
                pendingWorkDays,
                pendingOvertimeHours,
                pendingEarned,
                pendingWorks,
                unappliedPaidAmount,
                dailyRate,
                extraHourRate,
                privateProfile,
                payments: userPayments,
                works: annotatedWorks
            };
        });

        return memberBalances;
    } catch (error) {
        console.error("Error calculating team payments:", error);
        throw error;
    }
}

export async function registerTeamPayment(teamId, userId, amount, type, registeredBy = null, method = 'cash', metadata = {}) {
    try {
        if (!teamId || !userId) throw new Error('Equipo o miembro no válido');
        if (!registeredBy?.uid) throw new Error('Usuario no autenticado');
        const normalizedAmount = Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
            throw new Error('El importe debe ser mayor que cero');
        }
        if (normalizedAmount > 1000000000) {
            throw new Error('El importe supera el límite permitido');
        }
        const normalizedMethod = ['cash', 'transfer', 'bizum'].includes(method) ? method : 'cash';
        const normalizedType = ['total', 'partial'].includes(type) ? type : 'partial';
        const coveredWorks = normalizeCoveredWorks(metadata.coveredWorks);
        const paymentDoc = {
            teamId,
            userId,
            amount: normalizedAmount,
            type: normalizedType,
            method: normalizedMethod,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        if (coveredWorks.length) {
            paymentDoc.coveredWorks = coveredWorks;
            paymentDoc.coveredWorkIds = coveredWorks.map((work) => work.id).filter(Boolean);
        }

        ['balanceBefore', 'balanceAfter', 'pendingWorkDaysBefore', 'pendingOvertimeHoursBefore'].forEach((field) => {
            if (Number.isFinite(Number(metadata[field]))) {
                paymentDoc[field] = Number(metadata[field]);
            }
        });

        paymentDoc.registeredBy = registeredBy.uid;
        paymentDoc.registeredByName = String(registeredBy.name || registeredBy.email || '')
            .trim()
            .slice(0, 120);

        const docRef = await addDoc(collection(db, 'team_payments'), paymentDoc);
        return { id: docRef.id, ...paymentDoc };
    } catch (error) {
        console.error("Error registering team payment:", error);
        throw error;
    }
}

export async function getUserTeamPayments(teamId, userId) {
    if (!teamId || !userId) return [];

    const paymentsQuery = query(
        collection(db, 'team_payments'),
        where('teamId', '==', teamId),
        where('userId', '==', userId)
    );
    const paymentsSnapshot = await getDocs(paymentsQuery);
    const payments = [];
    paymentsSnapshot.forEach(doc => payments.push({ id: doc.id, ...doc.data() }));

    return payments.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
}

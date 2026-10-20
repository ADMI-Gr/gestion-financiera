// ==================== ALMACENAMIENTO ====================
// Un solo libro mayor. Toda acción que mueva dinero escribe en `transactions`.
//
// Transacción:
//   { id, type, category, description, amount, date,
//     accountId,      income: destino · expense: origen · transfer: ORIGEN · adjustment: cuenta
//     toAccountId,    solo en transfer: DESTINO
//     source: { kind: 'manual' | 'commitment' | 'adjustment', id } }
//
// type: 'income' | 'expense' | 'transfer' | 'adjustment'
//   transfer   -> mueve dinero entre cuentas. NO es gasto ni ingreso.
//   adjustment -> corrige un saldo. Afecta la cuenta pero no cuenta como gasto ni ingreso.

const DB = {
    _key: 'finanzas_data',
    _backupKey: 'finanzas_data_v1_backup',
    _cache: null,
    migrationReport: null,

    _empty() {
        return { schemaVersion: SCHEMA_VERSION, accounts: [], transactions: [], commitments: [], budgets: [] };
    },

    // Una sola lectura de localStorage por sesión; se invalida al guardar.
    _load() {
        if (this._cache) return this._cache;
        let data;
        try {
            const raw = localStorage.getItem(this._key);
            data = raw ? JSON.parse(raw) : this._empty();
        } catch {
            data = this._empty();
        }
        if (!data.schemaVersion || data.schemaVersion < SCHEMA_VERSION) {
            // Se guarda el original antes de tocar nada, por si acaso
            try {
                const raw = localStorage.getItem(this._key);
                if (raw && !localStorage.getItem(this._backupKey)) {
                    localStorage.setItem(this._backupKey, raw);
                }
            } catch { /* si no hay espacio, seguimos igual */ }

            data = migrateToV2(data);
            this.migrationReport = {
                accounts: data.accounts.length,
                transactions: data.transactions.length,
                commitments: data.commitments.length
            };
            this._cache = data;
            this._persist(data);
            return data;
        }
        // Red de seguridad por si falta alguna colección
        for (const k of ['accounts', 'transactions', 'commitments', 'budgets']) {
            if (!Array.isArray(data[k])) data[k] = [];
        }
        this._cache = data;
        return data;
    },

    _persist(data) {
        try {
            localStorage.setItem(this._key, JSON.stringify(data));
        } catch (e) {
            console.error('No se pudo guardar', e);
            if (typeof showToast === 'function') showToast('No se pudo guardar en este navegador', 'error');
        }
    },

    _save(data) {
        this._cache = data;
        this._persist(data);
    },

    get raw() { return this._load(); },
    get accounts() { return this._load().accounts; },
    get transactions() { return this._load().transactions; },
    get commitments() { return this._load().commitments; },
    get budgets() { return this._load().budgets; },

    account(id) { return this.accounts.find(a => a.id === id) || null; },
    commitment(id) { return this.commitments.find(c => c.id === id) || null; },

    // ---------- TRANSACCIONES ----------
    addTransaction(t) {
        const data = this._load();
        const tx = {
            id: uuid(),
            type: t.type,
            category: t.category || null,
            description: t.description || '',
            amount: round2(t.amount),
            date: t.date,
            accountId: t.accountId || null,
            toAccountId: t.toAccountId || null,
            source: t.source || { kind: 'manual', id: null }
        };
        data.transactions.unshift(tx);
        this._save(data);
        return tx;
    },

    updateTransaction(id, updates) {
        const data = this._load();
        const tx = data.transactions.find(t => t.id === id);
        if (!tx) return;
        Object.assign(tx, updates);
        tx.amount = round2(tx.amount);
        this._save(data);
    },

    deleteTransaction(id) {
        const data = this._load();
        data.transactions = data.transactions.filter(t => t.id !== id);
        this._save(data);
    },

    // ---------- CUENTAS ----------
    addAccount(a) {
        const data = this._load();
        a.id = uuid();
        a.archived = false;
        a.openingBalance = round2(a.openingBalance || 0);
        data.accounts.push(a);
        this._save(data);
        return a;
    },

    updateAccount(id, updates) {
        const data = this._load();
        const acc = data.accounts.find(a => a.id === id);
        if (acc) Object.assign(acc, updates);
        this._save(data);
    },

    // Borra la cuenta y desvincula (no elimina) sus movimientos.
    deleteAccount(id) {
        const data = this._load();
        data.accounts = data.accounts.filter(a => a.id !== id);
        data.transactions.forEach(t => {
            if (t.accountId === id) t.accountId = null;
            if (t.toAccountId === id) t.toAccountId = null;
        });
        // Un compromiso de tarjeta sin tarjeta deja de tener sentido
        data.commitments = data.commitments.filter(c => !(c.mode === 'card' && c.accountId === id));
        this._save(data);
    },

    // ---------- COMPROMISOS ----------
    addCommitment(c) {
        const data = this._load();
        c.id = uuid();
        if (c.active === undefined) c.active = true;
        data.commitments.unshift(c);
        this._save(data);
        return c;
    },

    updateCommitment(id, updates) {
        const data = this._load();
        const c = data.commitments.find(x => x.id === id);
        if (c) Object.assign(c, updates);
        this._save(data);
    },

    // Borra el compromiso y desvincula sus pagos del libro mayor (los movimientos quedan).
    deleteCommitment(id) {
        const data = this._load();
        data.commitments = data.commitments.filter(c => c.id !== id);
        data.transactions.forEach(t => {
            if (t.source && t.source.kind === 'commitment' && t.source.id === id) {
                t.source = { kind: 'manual', id: null };
            }
        });
        this._save(data);
    },

    // ---------- PRESUPUESTOS ----------
    addBudget(b) {
        const data = this._load();
        b.id = uuid();
        data.budgets.push(b);
        this._save(data);
        return b;
    },

    updateBudget(id, updates) {
        const data = this._load();
        const b = data.budgets.find(x => x.id === id);
        if (b) Object.assign(b, updates);
        this._save(data);
    },

    deleteBudget(id) {
        const data = this._load();
        data.budgets = data.budgets.filter(b => b.id !== id);
        this._save(data);
    },

    // ---------- RESPALDO ----------
    exportAll() { return JSON.stringify(this._load(), null, 2); },

    importAll(json) {
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== 'object') return false;
        // Acepta respaldos viejos (v1) y los migra
        const isV1 = parsed.transactions && parsed.debts && parsed.budgets;
        const isV2 = parsed.schemaVersion >= 2 && parsed.transactions && parsed.accounts;
        if (!isV1 && !isV2) return false;
        this._save(isV2 ? parsed : migrateToV2(parsed));
        return true;
    },

    resetAll() {
        this._save(this._empty());
    }
};

// ==================== MIGRACIÓN v1 -> v2 ====================
// v1 tenía 7 colecciones sueltas. v2 tiene 4 y un solo libro mayor.
//
//   accounts + cards            -> accounts (cards pasan a kind:'credit')
//   transactions + transfers
//     + card purchases/payments
//     + debt payments           -> transactions
//   debts + recurringPayments
//     + cards                   -> commitments (modos debt / fixed / card)
//   budgets                     -> budgets
//
// Los saldos visibles NO cambian: `openingBalance` se calcula hacia atrás para que
// el saldo derivado coincida exactamente con el saldo que el usuario ya veía.
function migrateToV2(v1) {
    const v2 = {
        schemaVersion: SCHEMA_VERSION,
        accounts: [], transactions: [], commitments: [], budgets: []
    };
    if (!v1 || typeof v1 !== 'object') return v2;

    const monthYear = d => {
        const dt = parseDate(d || today());
        return { month: dt.getMonth(), year: dt.getFullYear() };
    };

    // --- 1. Cuentas normales (openingBalance se ajusta al final) ---
    (v1.accounts || []).forEach(a => {
        v2.accounts.push({
            id: a.id, name: a.name, kind: a.type || 'other_account',
            openingBalance: 0, archived: false,
            _v1Balance: round2(a.balance || 0)
        });
    });

    // --- 2. Transacciones existentes ---
    (v1.transactions || []).forEach(t => {
        v2.transactions.push({
            id: t.id || uuid(),
            type: t.type, category: t.category,
            description: t.description || '', amount: round2(t.amount),
            date: t.date, accountId: t.accountId || null, toAccountId: null,
            source: { kind: 'manual', id: null }
        });
    });

    // --- 3. Transferencias -> movimientos type:'transfer' ---
    (v1.transfers || []).forEach(tr => {
        v2.transactions.push({
            id: tr.id || uuid(), type: 'transfer', category: '_transfer',
            description: tr.description || `${tr.fromName || ''} → ${tr.toName || ''}`.trim(),
            amount: round2(tr.amount), date: tr.date,
            accountId: tr.fromAccountId || null, toAccountId: tr.toAccountId || null,
            source: { kind: 'manual', id: null }
        });
    });

    // --- 4. Tarjetas -> cuenta de crédito + compromiso modo 'card' ---
    (v1.cards || []).forEach(c => {
        const accId = c.id;
        v2.accounts.push({
            id: accId,
            name: c.alias || c.cardType || 'Tarjeta',
            kind: 'credit', openingBalance: 0, archived: false,
            creditLimit: round2(c.creditLimit || 0),
            heldBalance: round2(c.heldBalance || 0),
            overdraft: round2(c.overdraft || 0),
            cutoffDay: c.cutoffDay || null,
            interestRate: c.interestRate || 0,
            alias: c.alias || '', last4: c.last4 || '',
            cardType: c.cardType || '', notes: c.notes || ''
        });

        const commitId = uuid();

        // Compras -> gastos sobre la tarjeta (sin categoría conocida en v1)
        (c.purchases || []).forEach(p => {
            v2.transactions.push({
                id: p.id || uuid(), type: 'expense', category: 'other_expense',
                description: p.description || 'Compra', amount: round2(p.amount),
                date: p.date, accountId: accId, toAccountId: null,
                source: { kind: 'manual', id: null }
            });
        });

        // Pagos -> transferencias hacia la tarjeta, atadas al compromiso
        (c.payments || []).forEach(p => {
            v2.transactions.push({
                id: p.id || uuid(), type: 'transfer', category: '_transfer',
                description: `Pago a ${c.alias || 'tarjeta'}`, amount: round2(p.amount),
                date: p.date, accountId: p.accountId || null, toAccountId: accId,
                source: { kind: 'commitment', id: commitId }
            });
        });

        v2.commitments.push({
            id: commitId, name: c.alias || c.cardType || 'Tarjeta', mode: 'card',
            active: true, recurringCategory: 'credit_card', expenseCategory: null,
            description: '', accountId: accId,
            minPayment: round2(c.minPayment || 0),
            dueDay: dayOfDate(c.paymentDate) || c.cutoffDay || 1
        });
    });

    // --- 5. Deudas -> compromisos modo 'debt'; sus pagos entran al libro mayor ---
    (v1.debts || []).forEach(d => {
        (d.payments || []).forEach(p => {
            v2.transactions.push({
                id: p.id || uuid(), type: 'expense', category: 'other_expense',
                description: `Pago: ${d.creditor || 'deuda'}`, amount: round2(p.amount),
                date: p.date, accountId: p.accountId || null, toAccountId: null,
                source: { kind: 'commitment', id: d.id }
            });
        });

        v2.commitments.push({
            id: d.id, name: d.creditor || 'Deuda', mode: 'debt',
            active: true, recurringCategory: 'loan', expenseCategory: 'other_expense',
            description: d.notes || '',
            totalAmount: round2(d.totalAmount || 0),
            installments: d.installments || 0,
            installmentAmount: round2(d.installmentAmount || 0),
            frequency: d.frequency || 'monthly',
            startDate: d.startDate || null, dueDate: d.dueDate || null,
            interestRate: d.interestRate || 0,
            dueDay: dayOfDate(d.startDate) || dayOfDate(d.dueDate) || 1
        });
    });

    // --- 6. Pagos recurrentes -> compromisos modo 'fixed' ---
    // En v1 estos SÍ creaban transacción; hay que atarlas, no duplicarlas.
    const claimed = new Set();
    (v1.recurringPayments || []).forEach(r => {
        (r.paidMonths || []).forEach(pm => {
            const match = v2.transactions.find(t =>
                !claimed.has(t.id) &&
                t.source.kind === 'manual' &&
                t.type === 'expense' &&
                t.date === pm.date &&
                Math.abs(t.amount - round2(pm.amount)) < EPS &&
                t.description === r.name);
            if (match) {
                claimed.add(match.id);
                match.source = { kind: 'commitment', id: r.id };
            } else {
                // El movimiento se perdió: se recrea para que el historial cuadre
                v2.transactions.push({
                    id: uuid(), type: 'expense',
                    category: r.expenseCategory || 'services',
                    description: r.name, amount: round2(pm.amount), date: pm.date,
                    accountId: null, toAccountId: null,
                    source: { kind: 'commitment', id: r.id }
                });
            }
        });

        v2.commitments.push({
            id: r.id, name: r.name, mode: 'fixed',
            active: r.active !== false,
            recurringCategory: r.recurringCategory || 'other_recurring',
            expenseCategory: r.expenseCategory || 'services',
            description: r.description || '',
            amount: round2(r.amount), dueDay: r.dueDay || 1
        });
    });

    // --- 7. Presupuestos ---
    (v1.budgets || []).forEach(b => v2.budgets.push({ ...b }));

    // --- 8. Saldo inicial que preserva exactamente el saldo que el usuario ya veía ---
    v2.accounts.forEach(acc => {
        if (acc.kind === 'credit') { acc.openingBalance = 0; return; }
        const delta = v2.transactions.reduce((s, t) => s + txDelta(t, acc.id), 0);
        acc.openingBalance = round2((acc._v1Balance || 0) - delta);
        delete acc._v1Balance;
    });

    return v2;
}

// Cuánto mueve una transacción el saldo de una cuenta concreta.
function txDelta(t, accountId) {
    let d = 0;
    if (t.accountId === accountId) {
        if (t.type === 'income') d += t.amount;
        else if (t.type === 'expense') d -= t.amount;
        else if (t.type === 'transfer') d -= t.amount;
        else if (t.type === 'adjustment') d += t.amount;
    }
    if (t.type === 'transfer' && t.toAccountId === accountId) d += t.amount;
    return d;
}

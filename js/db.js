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
//
// Los datos viven en Supabase (esquema `finanzas`). Al entrar se cargan una vez en
// memoria y las vistas siguen leyendo de forma síncrona. Cada escritura cambia la
// memoria al instante y se envía a la nube en una cola ordenada; si algo falla se
// avisa y se recarga desde el servidor para no quedar desincronizados.

// Columnas de cada tabla: propiedad JS -> columna SQL
const DB_COLUMNS = {
    accounts: {
        id: 'id', name: 'name', kind: 'kind', openingBalance: 'opening_balance', archived: 'archived',
        creditLimit: 'credit_limit', heldBalance: 'held_balance', overdraft: 'overdraft',
        cutoffDay: 'cutoff_day', interestRate: 'interest_rate', alias: 'alias', last4: 'last4',
        cardType: 'card_type', notes: 'notes'
    },
    commitments: {
        id: 'id', name: 'name', mode: 'mode', active: 'active',
        recurringCategory: 'recurring_category', expenseCategory: 'expense_category',
        description: 'description', accountId: 'account_id', dueDay: 'due_day',
        amount: 'amount', minPayment: 'min_payment', totalAmount: 'total_amount',
        installments: 'installments', installmentAmount: 'installment_amount', frequency: 'frequency',
        startDate: 'start_date', dueDate: 'due_date', interestRate: 'interest_rate'
    },
    transactions: {
        id: 'id', type: 'type', category: 'category', description: 'description', amount: 'amount',
        date: 'date', accountId: 'account_id', toAccountId: 'to_account_id'
        // `source` se guarda aparte en source_kind / source_id
    },
    budgets: { id: 'id', category: 'category', month: 'month', year: 'year', limit: 'limit_amount' }
};
const DB_TABLES = ['accounts', 'commitments', 'transactions', 'budgets'];
// Estos sí se conservan como null al leer; el resto de nulls se omiten como antes
const DB_KEEP_NULL = new Set(['accountId', 'toAccountId', 'category', 'expenseCategory']);

const DB = {
    _localKey: 'finanzas_data', // datos de la versión anterior (solo navegador)
    _data: null,
    _queue: Promise.resolve(),
    _pending: 0,

    _empty() {
        return { schemaVersion: SCHEMA_VERSION, accounts: [], transactions: [], commitments: [], budgets: [] };
    },

    // ---------- CONVERSIÓN ----------
    _toRow(table, obj) {
        const row = {};
        for (const [prop, col] of Object.entries(DB_COLUMNS[table])) {
            if (!(prop in obj) || obj[prop] === undefined) continue;
            let v = obj[prop];
            if (v === '' && /date$/i.test(prop)) v = null;
            if (prop === 'description' && v == null) v = '';
            row[col] = v;
        }
        if (table === 'transactions' && 'source' in obj) {
            const s = obj.source || {};
            row.source_kind = s.kind || 'manual';
            row.source_id = s.id || null;
        }
        return row;
    },

    _fromRow(table, row) {
        const obj = {};
        for (const [prop, col] of Object.entries(DB_COLUMNS[table])) {
            const v = row[col];
            if (v === null && !DB_KEEP_NULL.has(prop)) continue;
            obj[prop] = v;
        }
        if (table === 'transactions') obj.source = { kind: row.source_kind, id: row.source_id };
        return obj;
    },

    // ---------- NUBE ----------
    _t(table) { return sb.schema(APP_SCHEMA).from(table); },

    // PostgREST devuelve máx. 1000 filas por petición
    async _fetchAll(table, order) {
        const out = [];
        for (let from = 0; ; from += 1000) {
            let q = this._t(table).select('*').range(from, from + 999);
            for (const [col, ascending] of order) q = q.order(col, { ascending });
            const { data, error } = await q;
            if (error) throw error;
            out.push(...data);
            if (data.length < 1000) return out;
        }
    },

    async load() {
        const [accounts, commitments, transactions, budgets] = await Promise.all([
            this._fetchAll('accounts', [['created_at', true]]),
            this._fetchAll('commitments', [['created_at', false]]),
            this._fetchAll('transactions', [['date', false], ['created_at', false]]),
            this._fetchAll('budgets', [['created_at', true]])
        ]);
        this._data = {
            schemaVersion: SCHEMA_VERSION,
            accounts: accounts.map(r => this._fromRow('accounts', r)),
            commitments: commitments.map(r => this._fromRow('commitments', r)),
            transactions: transactions.map(r => this._fromRow('transactions', r)),
            budgets: budgets.map(r => this._fromRow('budgets', r))
        };
    },

    // Encola una operación remota. El orden importa (la cuenta antes que sus movimientos).
    _remote(op) {
        this._pending++;
        this._setSync();
        this._queue = this._queue
            .then(async () => {
                const { error } = await op();
                if (error) throw error;
            })
            .catch(async err => {
                console.error('Error al guardar en la nube', err);
                showToast('No se pudo guardar en la nube. Se recargaron tus datos.', 'error');
                this._setSync('error');
                try { await this.load(); refreshAll(); } catch { /* sin conexión: se queda el aviso */ }
            })
            .finally(() => { this._pending--; this._setSync(); });
        return this._queue;
    },

    // Espera a que todo lo encolado termine (p. ej. antes de exportar)
    flush() { return this._queue; },

    _setSync(state) {
        const el = document.getElementById('syncStatus');
        if (!el) return;
        if (state === 'error') { el.className = 'sync-status error'; el.textContent = 'Error al guardar'; return; }
        if (el.classList.contains('error') && this._pending === 0) return;
        el.className = `sync-status ${this._pending ? 'saving' : ''}`;
        el.innerHTML = this._pending
            ? '<i class="fas fa-circle-notch fa-spin"></i> Guardando…'
            : '<i class="fas fa-cloud"></i> Guardado';
    },

    _insert(table, obj) { return this._remote(() => this._t(table).insert(this._toRow(table, obj))); },
    _update(table, id, updates) {
        const row = this._toRow(table, updates);
        delete row.id;
        if (!Object.keys(row).length) return;
        return this._remote(() => this._t(table).update(row).eq('id', id));
    },
    _delete(table, id) { return this._remote(() => this._t(table).delete().eq('id', id)); },

    // ---------- LECTURA ----------
    _load() { return this._data || this._empty(); },

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
        this._insert('transactions', tx);
        return tx;
    },

    updateTransaction(id, updates) {
        const tx = this.transactions.find(t => t.id === id);
        if (!tx) return;
        Object.assign(tx, updates);
        tx.amount = round2(tx.amount);
        this._update('transactions', id, { ...updates, amount: tx.amount });
    },

    deleteTransaction(id) {
        const data = this._load();
        data.transactions = data.transactions.filter(t => t.id !== id);
        this._delete('transactions', id);
    },

    // ---------- CUENTAS ----------
    addAccount(a) {
        const data = this._load();
        a.id = uuid();
        a.archived = false;
        a.openingBalance = round2(a.openingBalance || 0);
        data.accounts.push(a);
        this._insert('accounts', a);
        return a;
    },

    updateAccount(id, updates) {
        const acc = this.account(id);
        if (acc) Object.assign(acc, updates);
        this._update('accounts', id, updates);
    },

    // Borra la cuenta y desvincula (no elimina) sus movimientos.
    // En la nube la FK hace el "desvincular" sola (ON DELETE SET NULL).
    deleteAccount(id) {
        const data = this._load();
        data.accounts = data.accounts.filter(a => a.id !== id);
        data.transactions.forEach(t => {
            if (t.accountId === id) t.accountId = null;
            if (t.toAccountId === id) t.toAccountId = null;
        });
        // Un compromiso de tarjeta sin tarjeta deja de tener sentido
        const cardCommitments = data.commitments.filter(c => c.mode === 'card' && c.accountId === id);
        data.commitments = data.commitments.filter(c => !cardCommitments.includes(c));
        cardCommitments.forEach(c => this._delete('commitments', c.id));
        this._delete('accounts', id);
    },

    // ---------- COMPROMISOS ----------
    addCommitment(c) {
        const data = this._load();
        c.id = uuid();
        if (c.active === undefined) c.active = true;
        data.commitments.unshift(c);
        this._insert('commitments', c);
        return c;
    },

    updateCommitment(id, updates) {
        const c = this.commitment(id);
        if (c) Object.assign(c, updates);
        this._update('commitments', id, updates);
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
        this._remote(() => this._t('transactions')
            .update({ source_kind: 'manual', source_id: null })
            .eq('source_kind', 'commitment').eq('source_id', id));
        this._delete('commitments', id);
    },

    // ---------- PRESUPUESTOS ----------
    addBudget(b) {
        const data = this._load();
        b.id = uuid();
        data.budgets.push(b);
        this._insert('budgets', b);
        return b;
    },

    updateBudget(id, updates) {
        const b = this.budgets.find(x => x.id === id);
        if (b) Object.assign(b, updates);
        this._update('budgets', id, updates);
    },

    deleteBudget(id) {
        const data = this._load();
        data.budgets = data.budgets.filter(b => b.id !== id);
        this._delete('budgets', id);
    },

    // ---------- RESPALDO ----------
    exportAll() { return JSON.stringify(this._load(), null, 2); },

    // Reemplaza TODOS los datos del usuario en la nube por los del respaldo.
    // Acepta respaldos v1 y v2 (archivo exportado o datos viejos del navegador).
    async importAll(json) {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        if (!parsed || typeof parsed !== 'object') return false;
        const isV1 = parsed.transactions && parsed.debts && parsed.budgets;
        const isV2 = parsed.schemaVersion >= 2 && parsed.transactions && parsed.accounts;
        if (!isV1 && !isV2) return false;
        await this._replaceAll(this._sanitize(isV2 ? parsed : migrateToV2(parsed)));
        return true;
    },

    async resetAll() {
        await this._replaceAll(this._empty());
    },

    // Deja el respaldo listo para las restricciones de la base de datos
    _sanitize(d) {
        const out = this._empty();
        const seen = { accounts: new Set(), commitments: new Set(), transactions: new Set(), budgets: new Set() };
        const keep = (table, x) => {
            if (!x || typeof x !== 'object') return false;
            x.id = x.id ? String(x.id) : uuid();
            if (seen[table].has(x.id)) return false;
            seen[table].add(x.id);
            return true;
        };
        const day = n => (Number(n) >= 1 && Number(n) <= 31 ? Number(n) : null);

        out.accounts = (d.accounts || []).filter(a => keep('accounts', a))
            .map(a => ({
                ...a,
                kind: ACCOUNT_KINDS.some(k => k.id === a.kind) ? a.kind : 'other_account',
                cutoffDay: day(a.cutoffDay)
            }));
        const accIds = seen.accounts;
        const accRef = id => (id && accIds.has(String(id)) ? String(id) : null);

        out.commitments = (d.commitments || []).filter(c => keep('commitments', c))
            .map(c => ({
                ...c,
                mode: COMMITMENT_MODES.some(m => m.id === c.mode) ? c.mode : 'fixed',
                accountId: accRef(c.accountId),
                dueDay: day(c.dueDay) || 1,
                frequency: FREQUENCY_LABELS[c.frequency] ? c.frequency : null
            }));
        out.transactions = (d.transactions || []).filter(t => keep('transactions', t) && t.date)
            .map(t => ({
                ...t,
                amount: round2(t.amount),
                accountId: accRef(t.accountId),
                toAccountId: t.type === 'transfer' ? accRef(t.toAccountId) : null
            }));
        out.budgets = (d.budgets || []).filter(b => keep('budgets', b))
            .map(b => ({ ...b, month: Number(b.month), year: Number(b.year), limit: round2(b.limit) }));
        return out;
    },

    async _replaceAll(d) {
        await this.flush();
        // Borrar: primero lo que apunta a cuentas. RLS limita el borrado a los datos del usuario.
        for (const table of ['transactions', 'budgets', 'commitments', 'accounts']) {
            const { error } = await this._t(table).delete().neq('id', '');
            if (error) throw error;
        }
        for (const table of DB_TABLES) {
            const rows = d[table].map(x => this._toRow(table, x));
            for (let i = 0; i < rows.length; i += 500) {
                const { error } = await this._t(table).insert(rows.slice(i, i + 500));
                if (error) throw error;
            }
        }
        await this.load();
    },

    // ---------- DATOS DE LA VERSIÓN ANTERIOR ----------
    // Lo que quedó guardado en este navegador antes de pasar a la nube.
    localLegacyData() {
        try {
            const raw = localStorage.getItem(this._localKey);
            if (!raw) return null;
            const d = JSON.parse(raw);
            const n = (d.transactions || []).length + (d.accounts || []).length;
            return n > 0 ? d : null;
        } catch {
            return null;
        }
    },

    // Se renombra (no se borra) para no volver a ofrecerlo
    archiveLocalLegacyData() {
        try {
            const raw = localStorage.getItem(this._localKey);
            if (raw) localStorage.setItem(`${this._localKey}_subido_${today()}`, raw);
            localStorage.removeItem(this._localKey);
        } catch { /* nada que hacer */ }
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

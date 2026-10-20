// ==================== DERIVADOS ====================
// Todo lo que antes era un campo mutable guardado (y se desincronizaba)
// ahora se calcula desde el libro mayor.

// ---------- SALDOS ----------
// saldo = saldo inicial + Σ movimientos. Nadie escribe un `balance` a mano.
function accountBalance(accountId) {
    const acc = DB.account(accountId);
    if (!acc) return 0;
    const delta = DB.transactions.reduce((s, t) => s + txDelta(t, accountId), 0);
    return round2((acc.openingBalance || 0) + delta);
}

const creditAccounts = () => DB.accounts.filter(isCredit);
const cashAccounts   = () => DB.accounts.filter(a => !isCredit(a));

// "Balance Total": el dinero que realmente tienes. Un solo cálculo, usado
// tanto en el Dashboard como en Cuentas (antes daban números distintos).
function totalCash() {
    return round2(cashAccounts().reduce((s, a) => s + accountBalance(a.id), 0));
}

// ---------- TARJETAS DE CRÉDITO ----------
// El saldo de una tarjeta es negativo: representa lo que debes.
function cardTotals(acc) {
    const balance = accountBalance(acc.id);
    const debt = Math.max(-balance, 0);
    const limit = round2(acc.creditLimit || 0);
    const held = round2(acc.heldBalance || 0);
    const over = round2(acc.overdraft || 0);
    // El saldo retenido y el sobregiro ahora SÍ entran en el disponible
    const available = Math.max(round2(limit + over - debt - held), 0);
    const usedPct = limit > 0 ? Math.min((debt / limit) * 100, 100) : 0;
    return { balance, debt, limit, held, over, available, usedPct };
}

const cardPurchases = accId => DB.transactions
    .filter(t => t.type === 'expense' && t.accountId === accId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const cardPayments = accId => DB.transactions
    .filter(t => t.type === 'transfer' && t.toAccountId === accId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

// Los pagos se aplican a las compras más antiguas primero (FIFO).
// A igual fecha manda el orden de registro: DB.transactions guarda lo más nuevo
// primero, así que se invierte antes de ordenar (el sort es estable).
function cardPurchaseAllocations(accId) {
    let remaining = cardPayments(accId).reduce((s, p) => s + p.amount, 0);
    const alloc = {};
    [...cardPurchases(accId)].reverse()
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .forEach(p => {
            const applied = Math.min(p.amount, remaining);
            alloc[p.id] = applied;
            remaining -= applied;
        });
    return alloc;
}

// ---------- COMPROMISOS ----------
// Los pagos NO se guardan aparte: son las transacciones que apuntan al compromiso.
// Borrar la transacción deshace el pago automáticamente.
function commitmentPayments(id) {
    return DB.transactions
        .filter(t => t.source && t.source.kind === 'commitment' && t.source.id === id)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function paidInMonth(id, m, y) {
    return round2(commitmentPayments(id).reduce((s, t) => {
        const d = parseDate(t.date);
        return d.getMonth() === m && d.getFullYear() === y ? s + t.amount : s;
    }, 0));
}

// El estado completo de un compromiso en un mes dado.
// Un solo cálculo para los tres modos: fijo, deuda y tarjeta.
function commitmentStatus(c, m, y) {
    const payments = commitmentPayments(c.id);
    const paidTotal = round2(payments.reduce((s, t) => s + t.amount, 0));
    const paidMonth = paidInMonth(c.id, m, y);

    let expected = 0;   // lo que toca cubrir este mes
    let remaining = 0;  // lo que falta para saldarlo del todo
    let settled = false; // ya no hay nada más que pagar, nunca
    let account = null;

    if (c.mode === 'fixed') {
        expected = round2(c.amount || 0);
        remaining = Infinity;          // un pago fijo no se "termina"
    } else if (c.mode === 'debt') {
        remaining = Math.max(round2((c.totalAmount || 0) - paidTotal), 0);
        const perMonth = FREQUENCY_PER_MONTH[c.frequency] || 1;
        const cuota = round2(c.installmentAmount || 0);
        expected = cuota > 0 ? round2(cuota * perMonth) : remaining;
        expected = Math.min(expected, remaining);
        settled = isZero(remaining);
    } else if (c.mode === 'card') {
        account = DB.account(c.accountId);
        const t = account ? cardTotals(account) : { debt: 0 };
        remaining = t.debt;
        const min = round2(c.minPayment || 0);
        // Si no hay pago mínimo definido, lo que toca es saldar todo
        expected = Math.min(min > 0 ? min : remaining, remaining);
        settled = isZero(remaining);
    }

    // Lo que falta este mes, descontando lo ya abonado (soporta pagos parciales)
    let due = round2(Math.max(expected - paidMonth, 0));
    if (c.mode !== 'fixed') due = Math.min(due, remaining);

    const paidThisMonth = isZero(due);
    // Un compromiso aparece en pendientes solo si está activo, no se saldó,
    // y todavía falta cubrir algo este mes. La tarjeta desaparece sola al llegar a 0.
    const pending = !!c.active && !settled && !paidThisMonth;

    const progress = c.mode === 'debt' && c.totalAmount > 0
        ? Math.min((paidTotal / c.totalAmount) * 100, 100)
        : c.mode === 'card' && account
            ? cardTotals(account).usedPct
            : null;

    return {
        payments, paidTotal, paidMonth, expected, due, remaining,
        settled, paidThisMonth, pending, progress, account,
        dueDay: commitmentDueDay(c),
        countdown: buildCountdown(commitmentDueDay(c), m, y, paidThisMonth || settled)
    };
}

function commitmentDueDay(c) {
    return c.dueDay || dayOfDate(c.startDate) || dayOfDate(c.dueDate) || 1;
}

// Cuotas pagadas de una deuda (informativo)
function paidInstallments(c, paidTotal) {
    if (!c.installments || !c.installmentAmount) return 0;
    return Math.min(Math.floor(paidTotal / c.installmentAmount), c.installments);
}

// Próxima fecha de cuota de una deuda con calendario definido
function nextInstallmentDate(c, paidTotal) {
    if (!c.installments || !c.startDate) return null;
    const done = paidInstallments(c, paidTotal);
    if (done >= c.installments) return null;
    const d = parseDate(c.startDate);
    if (c.frequency === 'biweekly') d.setDate(d.getDate() + done * 14);
    else if (c.frequency === 'weekly') d.setDate(d.getDate() + done * 7);
    else d.setMonth(d.getMonth() + done);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Todos los compromisos pendientes de un mes, ordenados por urgencia
function pendingCommitments(m, y) {
    return DB.commitments
        .map(c => ({ c, st: commitmentStatus(c, m, y) }))
        .filter(x => x.st.pending)
        .sort((a, b) => a.st.dueDay - b.st.dueDay);
}

// Deuda total viva: deudas pendientes + saldo de tarjetas
function totalDebt() {
    const fromCommitments = DB.commitments
        .filter(c => c.mode === 'debt' && c.active)
        .reduce((s, c) => s + commitmentStatus(c, currentMonth(), currentYear()).remaining, 0);
    const fromCards = creditAccounts().reduce((s, a) => s + cardTotals(a).debt, 0);
    return round2(fromCommitments + fromCards);
}

// ---------- MOVIMIENTOS DEL MES ----------
// Las transferencias y los ajustes NO son ingreso ni gasto: quedan fuera.
const isSpend  = t => t.type === 'expense';
const isEarn   = t => t.type === 'income';

function monthTransactions(m, y) {
    return DB.transactions.filter(t => {
        const d = parseDate(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });
}

function monthTotals(m, y) {
    const txs = monthTransactions(m, y);
    const income = round2(txs.filter(isEarn).reduce((s, t) => s + t.amount, 0));
    const expenses = round2(txs.filter(isSpend).reduce((s, t) => s + t.amount, 0));
    return { txs, income, expenses, balance: round2(income - expenses) };
}

function monthExpensesByCategory(m, y) {
    const map = {};
    monthTransactions(m, y).filter(isSpend).forEach(t => {
        map[t.category] = round2((map[t.category] || 0) + t.amount);
    });
    return map;
}

const accountName = id => {
    const a = DB.account(id);
    return a ? a.name : 'Sin asignar';
};

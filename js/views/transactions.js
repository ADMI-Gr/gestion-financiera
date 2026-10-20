// ==================== MOVIMIENTOS ====================
// El libro mayor completo: ingresos, gastos, transferencias y ajustes.

const TX_TYPES = [
    { id: 'income',   name: 'Ingreso' },
    { id: 'expense',  name: 'Gasto' },
    { id: 'transfer', name: 'Transferencia' }
];

function renderTransactions() {
    const allCats = [...CATEGORIES.income, ...CATEGORIES.expense];
    const f = renderTransactions._filters || (renderTransactions._filters = {
        type: 'all', category: 'all',
        month: `${currentYear()}-${String(currentMonth() + 1).padStart(2, '0')}`,
        account: 'all'
    });

    document.getElementById('view-transactions').innerHTML = `
        <div class="filter-bar">
            <select class="form-control" id="filterType">
                <option value="all" ${f.type === 'all' ? 'selected' : ''}>Todos los tipos</option>
                <option value="income" ${f.type === 'income' ? 'selected' : ''}>Ingresos</option>
                <option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Gastos</option>
                <option value="transfer" ${f.type === 'transfer' ? 'selected' : ''}>Transferencias</option>
                <option value="adjustment" ${f.type === 'adjustment' ? 'selected' : ''}>Ajustes</option>
            </select>
            <select class="form-control" id="filterCategory">
                <option value="all">Todas las categorías</option>
                ${allCats.map(c => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select>
            <select class="form-control" id="filterAccount">
                <option value="all">Todas las cuentas</option>
                ${DB.accounts.map(a => `<option value="${a.id}" ${f.account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
            </select>
            <input type="month" class="form-control" id="filterMonth" value="${f.month}">
            <button class="btn btn-secondary" onclick="clearTxFilters()" title="Quitar filtros"><i class="fas fa-filter-circle-xmark"></i></button>
            <button class="btn btn-primary" onclick="showTransactionForm()">
                <i class="fas fa-plus"></i> Nuevo Movimiento
            </button>
        </div>
        <div id="txSummary"></div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Categoría</th>
                            <th>Cuenta</th>
                            <th>Tipo</th>
                            <th>Origen</th>
                            <th style="text-align:right;">Monto</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="transactionsBody"></tbody>
                </table>
            </div>
        </div>
    `;

    updateTransactionsList();

    ['filterType', 'filterCategory', 'filterAccount', 'filterMonth'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const fl = renderTransactions._filters;
            fl.type = document.getElementById('filterType').value;
            fl.category = document.getElementById('filterCategory').value;
            fl.account = document.getElementById('filterAccount').value;
            fl.month = document.getElementById('filterMonth').value;
            updateTransactionsList();
        });
    });
}

function clearTxFilters() {
    renderTransactions._filters = { type: 'all', category: 'all', month: '', account: 'all' };
    renderTransactions();
}

function filteredTransactions() {
    const f = renderTransactions._filters;
    let txs = DB.transactions;
    if (f.type !== 'all') txs = txs.filter(t => t.type === f.type);
    if (f.category !== 'all') txs = txs.filter(t => t.category === f.category);
    if (f.account !== 'all') txs = txs.filter(t => t.accountId === f.account || t.toAccountId === f.account);
    if (f.month) {
        const [y, m] = f.month.split('-').map(Number);
        txs = txs.filter(t => {
            const d = parseDate(t.date);
            return d.getMonth() === m - 1 && d.getFullYear() === y;
        });
    }
    return [...txs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function sourceLabel(t) {
    if (!t.source || t.source.kind === 'manual') return '<span class="src-tag src-manual">Manual</span>';
    if (t.source.kind === 'adjustment') return '<span class="src-tag src-adjust">Ajuste</span>';
    const c = DB.commitment(t.source.id);
    return c
        ? `<span class="src-tag src-commitment" title="Pago de un compromiso"><i class="fas fa-link"></i> ${esc(c.name)}</span>`
        : '<span class="src-tag src-manual">Manual</span>';
}

function updateTransactionsList() {
    const txs = filteredTransactions();
    const body = document.getElementById('transactionsBody');
    const income = round2(txs.filter(isEarn).reduce((s, t) => s + t.amount, 0));
    const expense = round2(txs.filter(isSpend).reduce((s, t) => s + t.amount, 0));

    document.getElementById('txSummary').innerHTML = txs.length === 0 ? '' : `
        <div class="tx-summary">
            <span><i class="fas fa-list"></i> ${txs.length} movimiento${txs.length !== 1 ? 's' : ''}</span>
            <span class="amount-income">Ingresos ${fmt(income)}</span>
            <span class="amount-expense">Gastos ${fmt(expense)}</span>
            <span style="font-weight:700; color: ${income - expense >= 0 ? 'var(--success)' : 'var(--danger)'}">
                Neto ${fmt(income - expense)}
            </span>
        </div>
    `;

    if (txs.length === 0) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-search"></i><h4>Sin resultados</h4><p>No hay movimientos con estos filtros</p></div></td></tr>`;
        return;
    }

    body.innerHTML = txs.map(t => {
        const accountCell = t.type === 'transfer'
            ? `${esc(accountName(t.accountId))} <i class="fas fa-arrow-right" style="color:var(--text-light); font-size:0.7rem;"></i> ${esc(accountName(t.toAccountId))}`
            : t.accountId ? esc(accountName(t.accountId)) : '<span style="color:var(--text-light)">—</span>';
        return `
            <tr>
                <td>${fmtDate(t.date)}</td>
                <td><strong>${esc(t.description)}</strong></td>
                <td><i class="fas ${getCategoryIcon(t.category)}"></i> ${esc(getCategoryName(t.category))}</td>
                <td>${accountCell}</td>
                <td>${txBadge(t.type)}</td>
                <td>${sourceLabel(t)}</td>
                <td style="text-align:right;">${txAmountHTML(t)}</td>
                <td>
                    <button class="btn-icon" onclick="showTransactionForm('${t.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon danger" onclick="deleteTransactionPrompt('${t.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function showTransactionForm(editId = null) {
    const t = editId ? DB.transactions.find(x => x.id === editId) : null;
    const isEdit = !!t;
    const type0 = t?.type || 'expense';

    openModal(isEdit ? 'Editar Movimiento' : 'Nuevo Movimiento', `
        <form id="transactionForm">
            ${isEdit && t.source && t.source.kind === 'commitment' ? `
                <p class="form-hint" style="margin-bottom: 14px;">
                    <i class="fas fa-link"></i> Este movimiento es el pago de
                    <strong>${esc(DB.commitment(t.source.id)?.name || 'un compromiso')}</strong>.
                    Si lo editas o lo borras, el compromiso se recalcula solo.
                </p>
            ` : ''}
            <div class="form-group">
                <label>Tipo</label>
                <select class="form-control" id="txType" ${type0 === 'adjustment' ? 'disabled' : ''} required>
                    ${type0 === 'adjustment'
                        ? '<option value="adjustment" selected>Ajuste de saldo</option>'
                        : TX_TYPES.map(x => `<option value="${x.id}" ${type0 === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                </select>
            </div>
            <div id="txDynamic"></div>
            <div class="form-group">
                <label>Descripción</label>
                <input type="text" class="form-control" id="txDesc" value="${esc(t?.description || '')}" placeholder="Ej: Pago de salario" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto ($)</label>
                    <input type="number" class="form-control" id="txAmount" value="${t ? Math.abs(t.amount) : ''}" placeholder="0.00" step="0.01" min="0.01" required>
                </div>
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" class="form-control" id="txDate" value="${t?.date || today()}" required>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Guardar'}</button>
            </div>
        </form>
    `);

    const dyn = document.getElementById('txDynamic');

    function renderDynamic(type) {
        if (type === 'transfer') {
            dyn.innerHTML = `
                <div class="form-row">
                    <div class="form-group">
                        <label>Desde</label>
                        ${accountSelectHTML('txAccount', t?.accountId || '', { kinds: 'all', required: true })}
                    </div>
                    <div class="form-group">
                        <label>Hacia</label>
                        ${accountSelectHTML('txToAccount', t?.toAccountId || '', { kinds: 'all', required: true })}
                    </div>
                </div>
                <p class="form-hint" style="margin-bottom: 14px;">
                    <i class="fas fa-info-circle"></i> Una transferencia no cuenta como gasto ni ingreso.
                </p>
            `;
            return;
        }
        if (type === 'adjustment') {
            dyn.innerHTML = `
                <div class="form-group">
                    <label>Cuenta</label>
                    ${accountSelectHTML('txAccount', t?.accountId || '', { kinds: 'all' })}
                </div>
            `;
            return;
        }
        const cats = type === 'income' ? CATEGORIES.income : CATEGORIES.expense;
        const selected = t && t.type === type ? t.category : null;
        dyn.innerHTML = `
            <div class="form-group">
                <label>Categoría</label>
                <select class="form-control" id="txCategory" required>
                    ${cats.map(c => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>
            ${DB.accounts.length > 0 ? `
                <div class="form-group">
                    <label>Cuenta</label>
                    ${accountSelectHTML('txAccount', t?.accountId || '', { kinds: 'all', placeholder: 'Sin asignar' })}
                </div>
            ` : ''}
        `;
    }

    renderDynamic(type0);
    document.getElementById('txType').addEventListener('change', function () { renderDynamic(this.value); });

    document.getElementById('transactionForm').addEventListener('submit', e => {
        e.preventDefault();
        const type = document.getElementById('txType').value;
        const accEl = document.getElementById('txAccount');
        const toEl = document.getElementById('txToAccount');
        const catEl = document.getElementById('txCategory');

        if (type === 'transfer') {
            if (!accEl || !toEl) { showToast('Necesitas al menos 2 cuentas para transferir', 'error'); return; }
            if (accEl.value === toEl.value) { showToast('Selecciona cuentas diferentes', 'error'); return; }
        }

        const data = {
            type,
            category: type === 'transfer' ? '_transfer' : type === 'adjustment' ? '_adjustment' : catEl.value,
            description: document.getElementById('txDesc').value.trim(),
            amount: round2(parseFloat(document.getElementById('txAmount').value)),
            date: document.getElementById('txDate').value,
            accountId: accEl ? accEl.value || null : null,
            toAccountId: type === 'transfer' && toEl ? toEl.value : null
        };

        if (isEdit) {
            DB.updateTransaction(editId, { ...data, source: t.source });
            showToast('Movimiento actualizado', 'success');
        } else {
            DB.addTransaction({ ...data, source: { kind: 'manual', id: null } });
            showToast('Movimiento registrado', 'success');
        }
        closeModal();
        refreshAll();
    });
}

function deleteTransactionPrompt(id) {
    const t = DB.transactions.find(x => x.id === id);
    if (!t) return;
    const linked = t.source && t.source.kind === 'commitment' ? DB.commitment(t.source.id) : null;
    const msg = linked
        ? `Este movimiento es el pago de "${linked.name}". Al borrarlo, ese pago se deshace y el compromiso vuelve a quedar pendiente. ¿Continuar?`
        : '¿Estás seguro de eliminar este movimiento?';
    showConfirm(msg, () => {
        DB.deleteTransaction(id);
        showToast('Movimiento eliminado', 'error');
        refreshAll();
    });
}

// Deshacer un pago = borrar su transacción. El compromiso se recalcula solo.
function undoPayment(txId) {
    const t = DB.transactions.find(x => x.id === txId);
    if (!t) return;
    showConfirm(
        `¿Deshacer el pago de ${fmt(t.amount)} del ${fmtDate(t.date)}? Volverá a aparecer como pendiente.`,
        () => {
            DB.deleteTransaction(txId);
            showToast('Pago deshecho', 'info');
            refreshAll();
        },
        'Deshacer');
}

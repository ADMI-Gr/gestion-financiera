// ==================== CUENTAS ====================
// Las tarjetas de crédito son cuentas también, pero viven en su propia vista.
function renderAccounts() {
    const accounts = cashAccounts();
    const total = totalCash();
    const transfers = DB.transactions.filter(t => t.type === 'transfer').slice(0, 10);

    document.getElementById('view-accounts').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-coins"></i></div>
                <div class="stat-info">
                    <h4>Balance Total</h4>
                    <div class="stat-value" style="color: ${total >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(total)}</div>
                    <div class="stat-sub">${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''} · mismo número que el Dashboard</div>
                </div>
            </div>
        </div>

        <div class="filter-bar">
            <h3 style="margin-right: auto;">Mis Cuentas</h3>
            ${DB.accounts.length >= 2 ? `<button class="btn btn-warning" onclick="showTransferForm()"><i class="fas fa-exchange-alt"></i> Transferir</button>` : ''}
            <button class="btn btn-primary" onclick="showAccountForm()"><i class="fas fa-plus"></i> Nueva Cuenta</button>
        </div>

        ${accounts.length === 0
            ? emptyStateHTML('fa-coins', 'Sin cuentas registradas',
                'Crea cuentas para saber cuánto dinero tienes en cada lugar (cartera, banco, billetera digital...)',
                `<button class="btn btn-primary" onclick="showAccountForm()"><i class="fas fa-plus"></i> Crear Cuenta</button>`)
            : `<div class="accounts-grid">
                ${accounts.map(a => {
                    const k = getAccountKind(a.kind);
                    const bal = accountBalance(a.id);
                    return `
                        <div class="account-card" style="border-top-color: ${k.color};">
                            <div class="account-card-actions">
                                <button class="btn-icon" onclick="showAccountForm('${a.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                                <button class="btn-icon danger" onclick="deleteAccountPrompt('${a.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                            </div>
                            <div class="account-card-icon" style="background: ${k.color}15; color: ${k.color};">
                                <i class="fas ${k.icon}"></i>
                            </div>
                            <div class="account-card-name">${esc(a.name)}</div>
                            <div class="account-card-balance" style="color: ${bal >= 0 ? 'var(--text)' : 'var(--danger)'}">${fmt(bal)}</div>
                            <div class="account-card-type">${k.name}</div>
                        </div>
                    `;
                }).join('')}
            </div>`}

        ${transfers.length > 0 ? `
            <div class="card" style="margin-top: 24px;">
                <div class="card-header"><h3>Transferencias Recientes</h3></div>
                <div class="card-body">
                    ${transfers.map(tr => `
                        <div class="transfer-item">
                            <div class="transfer-detail">
                                <strong>${esc(accountName(tr.accountId))}</strong>
                                <span class="arrow"><i class="fas fa-arrow-right"></i></span>
                                <strong>${esc(accountName(tr.toAccountId))}</strong>
                                ${tr.description ? `<span style="color: var(--text-light); margin-left: 8px;">— ${esc(tr.description)}</span>` : ''}
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 700; color: var(--primary);">${fmt(tr.amount)}</div>
                                <div style="font-size: 0.75rem; color: var(--text-light);">${fmtDate(tr.date)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

function showAccountForm(editId = null) {
    const a = editId ? DB.account(editId) : null;
    const isEdit = !!a;
    const currentBal = isEdit ? accountBalance(editId) : 0;
    const kinds = ACCOUNT_KINDS.filter(k => k.id !== 'credit');

    openModal(isEdit ? 'Editar Cuenta' : 'Nueva Cuenta', `
        <form id="accountForm">
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" class="form-control" id="accName" value="${esc(a?.name || '')}" placeholder="Ej: Mi cartera, Banco..." required>
            </div>
            <div class="form-group">
                <label>Tipo</label>
                <select class="form-control" id="accKind">
                    ${kinds.map(k => `<option value="${k.id}" ${a?.kind === k.id ? 'selected' : ''}>${k.name}</option>`).join('')}
                </select>
            </div>
            ${isEdit ? `
                <div class="form-group">
                    <label>Saldo Actual ($)</label>
                    <input type="number" class="form-control" id="accBalance" value="${currentBal}" step="0.01" required>
                    <p class="form-hint">
                        <i class="fas fa-info-circle"></i>
                        El saldo se calcula desde tus movimientos. Si lo cambias, se registra un
                        <strong>ajuste de saldo</strong> visible en Transacciones — no se sobrescribe en silencio.
                    </p>
                </div>
            ` : `
                <div class="form-group">
                    <label>Saldo Inicial ($)</label>
                    <input type="number" class="form-control" id="accBalance" value="" step="0.01" placeholder="0.00" required>
                </div>
            `}
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Crear Cuenta'}</button>
            </div>
        </form>
    `);

    document.getElementById('accountForm').addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('accName').value.trim();
        const kind = document.getElementById('accKind').value;
        const typed = round2(parseFloat(document.getElementById('accBalance').value) || 0);

        if (isEdit) {
            DB.updateAccount(editId, { name, kind });
            const diff = round2(typed - currentBal);
            if (!isZero(diff)) {
                DB.addTransaction({
                    type: 'adjustment', category: '_adjustment',
                    description: `Ajuste de saldo: ${name}`,
                    amount: diff, date: today(), accountId: editId,
                    source: { kind: 'adjustment', id: null }
                });
                showToast(`Cuenta actualizada · ajuste de ${fmt(diff)} registrado`, 'success');
            } else {
                showToast('Cuenta actualizada', 'success');
            }
        } else {
            DB.addAccount({ name, kind, openingBalance: typed });
            showToast('Cuenta creada', 'success');
        }
        closeModal();
        refreshAll();
    });
}

function showTransferForm(presetToId = '') {
    if (DB.accounts.length < 2) { showToast('Necesitas al menos 2 cuentas para transferir', 'error'); return; }

    openModal('Transferir entre Cuentas', `
        <form id="transferForm">
            <p class="form-hint" style="margin-bottom: 16px;">
                <i class="fas fa-info-circle"></i>
                Una transferencia mueve dinero entre tus cuentas. <strong>No cuenta como gasto</strong>
                en el Dashboard, Presupuestos ni Reportes.
            </p>
            <div class="form-row">
                <div class="form-group">
                    <label>Desde</label>
                    ${accountSelectHTML('trFrom', '', { kinds: 'cash', required: true })}
                </div>
                <div class="form-group">
                    <label>Hacia</label>
                    ${accountSelectHTML('trTo', presetToId, { kinds: 'all', required: true })}
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto ($)</label>
                    <input type="number" class="form-control" id="trAmount" step="0.01" min="0.01" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" class="form-control" id="trDate" value="${today()}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Descripción (opcional)</label>
                <input type="text" class="form-control" id="trDesc" placeholder="Ej: Retiro de cajero, depósito...">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-warning"><i class="fas fa-exchange-alt"></i> Transferir</button>
            </div>
        </form>
    `);

    document.getElementById('transferForm').addEventListener('submit', e => {
        e.preventDefault();
        const fromId = document.getElementById('trFrom').value;
        const toId = document.getElementById('trTo').value;
        if (fromId === toId) { showToast('Selecciona cuentas diferentes', 'error'); return; }
        const amount = parseFloat(document.getElementById('trAmount').value);

        DB.addTransaction({
            type: 'transfer', category: '_transfer',
            description: document.getElementById('trDesc').value.trim() || 'Transferencia',
            amount, date: document.getElementById('trDate').value,
            accountId: fromId, toAccountId: toId,
            source: { kind: 'manual', id: null }
        });
        showToast(`Transferencia de ${fmt(amount)} realizada`, 'success');
        closeModal();
        refreshAll();
    });
}

function deleteAccountPrompt(id) {
    const acc = DB.account(id);
    if (!acc) return;
    const linked = DB.transactions.filter(t => t.accountId === id || t.toAccountId === id).length;
    const msg = linked > 0
        ? `¿Eliminar "${acc.name}"? Tiene ${linked} movimiento${linked !== 1 ? 's' : ''} vinculado${linked !== 1 ? 's' : ''}; quedarán sin cuenta asignada, no se borrarán.`
        : `¿Eliminar la cuenta "${acc.name}"?`;
    showConfirm(msg, () => {
        DB.deleteAccount(id);
        showToast('Cuenta eliminada', 'error');
        refreshAll();
    });
}

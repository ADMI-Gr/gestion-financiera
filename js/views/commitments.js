// ==================== COMPROMISOS ====================
// Antes eran tres pantallas: Pagos Mensuales, Deudas y Tarjetas.
// Los tres son lo mismo: algo que debo y que pago periódicamente.

function renderCommitments() {
    const m = viewMonth.month, y = viewMonth.year;
    const filter = renderCommitments._filter || (renderCommitments._filter = 'all');

    const all = DB.commitments.map(c => ({ c, st: commitmentStatus(c, m, y) }));
    const active = all.filter(x => x.c.active);

    let dueTotal = 0, paidTotal = 0, pendingTotal = 0, paidCount = 0, pendingCount = 0;
    active.forEach(({ c, st }) => {
        if (st.settled) return;
        dueTotal += st.expected;
        if (st.pending) { pendingCount++; pendingTotal += st.due; }
        else { paidCount++; paidTotal += st.paidMonth; }
    });

    const shown = all.filter(({ c }) => filter === 'all' || c.mode === filter);
    const visible = shown.filter(x => x.c.active);
    const inactive = shown.filter(x => !x.c.active);

    const counts = {
        all: DB.commitments.length,
        fixed: DB.commitments.filter(c => c.mode === 'fixed').length,
        debt: DB.commitments.filter(c => c.mode === 'debt').length,
        card: DB.commitments.filter(c => c.mode === 'card').length
    };

    document.getElementById('view-commitments').innerHTML = `
        <div class="view-toolbar">
            ${monthNavHTML()}
            <button class="btn btn-primary btn-sm" onclick="showCommitmentForm()">
                <i class="fas fa-plus"></i> Nuevo Compromiso
            </button>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon purple"><i class="fas fa-calendar-check"></i></div>
                <div class="stat-info">
                    <h4>Compromiso del Mes</h4>
                    <div class="stat-value">${fmt(dueTotal)}</div>
                    <div class="stat-sub">${active.filter(x => !x.st.settled).length} compromisos vivos</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info">
                    <h4>Pagado</h4>
                    <div class="stat-value">${fmt(paidTotal)}</div>
                    <div class="stat-sub">${paidCount} cubierto${paidCount !== 1 ? 's' : ''} en ${MONTHS[m]}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon ${pendingCount > 0 ? 'yellow' : 'green'}">
                    <i class="fas fa-${pendingCount > 0 ? 'clock' : 'check'}"></i>
                </div>
                <div class="stat-info">
                    <h4>Pendiente</h4>
                    <div class="stat-value">${fmt(pendingTotal)}</div>
                    <div class="stat-sub">${pendingCount} por pagar</div>
                </div>
            </div>
        </div>

        <div class="chip-bar">
            ${[['all', 'Todos', 'fa-layer-group'],
               ['fixed', 'Fijos', 'fa-calendar-check'],
               ['debt', 'Deudas', 'fa-file-invoice-dollar'],
               ['card', 'Tarjetas', 'fa-credit-card']]
              .map(([id, label, icon]) => `
                <button class="chip ${filter === id ? 'active' : ''}" onclick="setCommitmentFilter('${id}')">
                    <i class="fas ${icon}"></i> ${label} <span class="chip-count">${counts[id]}</span>
                </button>`).join('')}
        </div>

        ${visible.length === 0
            ? emptyStateHTML('fa-calendar-plus', 'Sin compromisos aquí',
                'Registra tus servicios, deudas, cuotas y tarjetas para llevar el control mes a mes.',
                `<button class="btn btn-primary" onclick="showCommitmentForm()"><i class="fas fa-plus"></i> Agregar Compromiso</button>`)
            : `<div class="recurring-grid">${visible.map(({ c, st }) => renderCommitmentCard(c, st)).join('')}</div>`}

        ${inactive.length > 0 ? `
            <h3 class="section-title">Inactivos</h3>
            <div class="recurring-grid">${inactive.map(({ c, st }) => renderCommitmentCard(c, st)).join('')}</div>
        ` : ''}
    `;
}

function setCommitmentFilter(f) {
    renderCommitments._filter = f;
    renderCommitments();
}

function renderCommitmentCard(c, st) {
    const cat = getRecurringCat(c.recurringCategory);
    const mode = getCommitmentMode(c.mode);
    const statusClass = st.settled ? 'status-paid'
        : st.paidThisMonth ? 'status-paid'
        : st.countdown.css === 'countdown-overdue' ? 'status-overdue' : 'status-pending';

    // Lo que muestra el monto grande depende del modo
    const headline = c.mode === 'fixed' ? c.amount
        : c.mode === 'debt' ? st.remaining
        : st.remaining;
    const headlineLabel = c.mode === 'fixed' ? 'al mes' : 'restante';

    const acc = c.mode === 'card' ? st.account : null;
    const proj = (c.mode === 'card' && acc && acc.interestRate > 0 && c.minPayment > 0 && st.remaining > 0)
        ? projectPayoff(st.remaining, acc.interestRate, c.minPayment) : null;

    return `
        <div class="recurring-card ${statusClass}">
            <div class="recurring-card-top">
                <div class="recurring-card-icon" style="background: ${cat.color}15; color: ${cat.color};">
                    <i class="fas ${cat.icon}"></i>
                </div>
                <div class="recurring-card-info">
                    <h4>${esc(c.name)} <span class="mode-tag mode-${c.mode}">${mode.name}</span></h4>
                    <div class="sub">
                        ${esc(cat.name)} — vence día ${st.dueDay}
                        ${c.mode === 'debt' && c.installments
                            ? ` · cuota ${paidInstallments(c, st.paidTotal)} de ${c.installments}`
                            : ''}
                    </div>
                </div>
                <div class="recurring-card-amount">
                    ${fmt(headline)}
                    <span class="amount-label">${headlineLabel}</span>
                </div>
            </div>

            ${c.description ? `<p class="recurring-card-desc">${esc(c.description)}</p>` : ''}

            ${c.active && !st.settled ? `
                <div class="countdown-badge ${st.countdown.css}">
                    <i class="fas ${st.countdown.icon}"></i> ${st.countdown.text}
                    ${st.due > 0 ? ` · toca ${fmt(st.due)}` : ''}
                </div>` : ''}

            ${st.settled ? `
                <div class="countdown-badge countdown-ok">
                    <i class="fas fa-flag-checkered"></i>
                    ${c.mode === 'card' ? 'Saldada — sale de los pagos del mes' : 'Deuda saldada por completo'}
                </div>` : ''}

            ${st.progress !== null ? `
                <div class="debt-progress">
                    <div class="debt-progress-info">
                        <span>${c.mode === 'debt'
                            ? `${st.progress.toFixed(0)}% pagado — ${fmt(st.paidTotal)} de ${fmt(c.totalAmount)}`
                            : `${st.progress.toFixed(0)}% del límite usado`}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${st.settled ? 'green' : st.progress > 75 ? (c.mode === 'debt' ? 'green' : 'red') : st.progress > 40 ? 'blue' : (c.mode === 'debt' ? 'red' : 'green')}"
                             style="width: ${st.progress}%"></div>
                    </div>
                </div>` : ''}

            ${c.mode === 'debt' && c.installments && nextInstallmentDate(c, st.paidTotal) ? `
                <div class="debt-detail"><span>Próxima cuota</span><span>${fmtDate(nextInstallmentDate(c, st.paidTotal))}</span></div>
            ` : ''}

            ${proj ? `
                <div class="projection-note ${proj.never ? 'danger' : ''}">
                    <i class="fas fa-hourglass-half"></i>
                    ${proj.never
                        ? `Con el mínimo de ${fmt(c.minPayment)} <strong>nunca la saldarías</strong>.`
                        : `Solo con el mínimo: <strong>${fmtMonths(proj.months)}</strong> y ${fmt(proj.interest)} de intereses.`}
                </div>` : ''}

            <div class="recurring-card-footer">
                <div>
                    ${st.settled ? `
                        <div class="recurring-status paid"><i class="fas fa-check-circle"></i> Saldado</div>
                    ` : st.paidThisMonth ? `
                        <div class="recurring-status paid"><i class="fas fa-check-circle"></i> Cubierto en ${MONTHS[viewMonth.month]} — ${fmt(st.paidMonth)}</div>
                    ` : st.countdown.css === 'countdown-overdue' ? `
                        <div class="recurring-status overdue"><i class="fas fa-exclamation-circle"></i> Vencido (día ${st.dueDay})</div>
                    ` : `
                        <div class="recurring-status pending"><i class="fas fa-clock"></i> Pendiente — falta ${fmt(st.due)}</div>
                    `}
                    ${st.payments.length > 0
                        ? `<div class="recurring-substat">${st.payments.length} pago${st.payments.length !== 1 ? 's' : ''} — total ${fmt(st.paidTotal)}</div>`
                        : ''}
                </div>
                <div style="display: flex; gap: 6px;">
                    ${!st.settled && c.active
                        ? `<button class="btn btn-success btn-sm" onclick="showPayCommitmentForm('${c.id}')"><i class="fas fa-dollar-sign"></i> Pagar</button>`
                        : ''}
                    <button class="btn-icon" onclick="showCommitmentForm('${c.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon danger" onclick="deleteCommitmentPrompt('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>

            ${st.payments.length > 0 ? `
                <details style="margin-top: 10px;">
                    <summary class="details-summary">Historial de Pagos (${st.payments.length})</summary>
                    <div class="payment-list" style="margin-top: 8px;">
                        ${st.payments.slice(0, 12).map(p => `
                            <div class="payment-item">
                                <span>${fmtDate(p.date)}${p.accountId ? ` · ${esc(accountName(p.accountId))}` : ''}</span>
                                <span style="display:flex; align-items:center; gap:8px;">
                                    <strong style="color: var(--success)">${fmt(p.amount)}</strong>
                                    <button class="btn-icon danger sm" onclick="undoPayment('${p.id}')" title="Deshacer"><i class="fas fa-rotate-left"></i></button>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </details>` : ''}
        </div>
    `;
}

// ---------- FORMULARIO ----------
function showCommitmentForm(editId = null) {
    const c = editId ? DB.commitment(editId) : null;
    const isEdit = !!c;
    const mode0 = c?.mode || 'fixed';

    openModal(isEdit ? 'Editar Compromiso' : 'Nuevo Compromiso', `
        <form id="commitmentForm">
            <div class="form-group">
                <label>¿Qué tipo de compromiso es?</label>
                <select class="form-control" id="comMode" ${isEdit ? 'disabled' : ''}>
                    ${COMMITMENT_MODES.map(mo => `<option value="${mo.id}" ${mode0 === mo.id ? 'selected' : ''}>${mo.name}</option>`).join('')}
                </select>
                <p class="form-hint" id="comModeHint"></p>
            </div>
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" class="form-control" id="comName" value="${esc(c?.name || '')}" placeholder="Ej: Recibo de luz, Préstamo banco..." required>
            </div>
            <div class="form-group">
                <label>Ícono / Tipo</label>
                <select class="form-control" id="comCategory">
                    ${RECURRING_CATEGORIES.map(rc => `<option value="${rc.id}" ${c?.recurringCategory === rc.id ? 'selected' : ''}>${rc.name}</option>`).join('')}
                </select>
            </div>
            <div id="comDynamic"></div>
            <div class="form-group">
                <label>Descripción (opcional)</label>
                <input type="text" class="form-control" id="comDesc" value="${esc(c?.description || '')}" placeholder="Notas adicionales...">
            </div>
            ${isEdit ? `
                <div class="form-group">
                    <label>Estado</label>
                    <select class="form-control" id="comActive">
                        <option value="true" ${c.active ? 'selected' : ''}>Activo</option>
                        <option value="false" ${!c.active ? 'selected' : ''}>Inactivo</option>
                    </select>
                </div>` : ''}
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Guardar'}</button>
            </div>
        </form>
    `);

    const dyn = document.getElementById('comDynamic');
    const hint = document.getElementById('comModeHint');

    function renderDynamic(mode) {
        hint.innerHTML = `<i class="fas fa-info-circle"></i> ${getCommitmentMode(mode).hint}`;

        if (mode === 'fixed') {
            dyn.innerHTML = `
                <div class="form-row">
                    <div class="form-group">
                        <label>Monto Mensual ($)</label>
                        <input type="number" class="form-control" id="comAmount" value="${c?.amount ?? ''}" step="0.01" min="0.01" placeholder="0.00" required>
                    </div>
                    <div class="form-group">
                        <label>Día de Vencimiento</label>
                        <input type="number" class="form-control" id="comDueDay" value="${c?.dueDay ?? ''}" min="1" max="31" placeholder="1-31" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Categoría de Gasto (al registrar el pago)</label>
                    <select class="form-control" id="comExpenseCat">
                        ${CATEGORIES.expense.map(x => `<option value="${x.id}" ${c?.expenseCategory === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (mode === 'debt') {
            dyn.innerHTML = `
                <div class="form-row">
                    <div class="form-group">
                        <label>Monto Total ($)</label>
                        <input type="number" class="form-control" id="comTotal" value="${c?.totalAmount ?? ''}" step="0.01" min="0.01" placeholder="0.00" required>
                    </div>
                    <div class="form-group">
                        <label>Tasa de Interés (% anual)</label>
                        <input type="number" class="form-control" id="comInterest" value="${c?.interestRate ?? ''}" step="0.01" min="0" placeholder="Opcional">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Número de Cuotas</label>
                        <input type="number" class="form-control" id="comInstallments" value="${c?.installments || ''}" min="1" placeholder="Ej: 12">
                    </div>
                    <div class="form-group">
                        <label>Frecuencia</label>
                        <select class="form-control" id="comFrequency">
                            ${Object.entries(FREQUENCY_LABELS).map(([id, label]) =>
                                `<option value="${id}" ${(c?.frequency || 'monthly') === id ? 'selected' : ''}>${label}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Monto por Cuota ($)</label>
                        <input type="number" class="form-control" id="comInstallmentAmount" value="${c?.installmentAmount || ''}" step="0.01" min="0" placeholder="Auto-calculado">
                    </div>
                    <div class="form-group">
                        <label>Fecha de Inicio</label>
                        <input type="date" class="form-control" id="comStartDate" value="${c?.startDate || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Vencimiento Final</label>
                        <input type="date" class="form-control" id="comDueDate" value="${c?.dueDate || ''}">
                    </div>
                    <div class="form-group">
                        <label>Categoría de Gasto</label>
                        <select class="form-control" id="comExpenseCat">
                            ${CATEGORIES.expense.map(x => `<option value="${x.id}" ${(c?.expenseCategory || 'other_expense') === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
            const total = document.getElementById('comTotal');
            const n = document.getElementById('comInstallments');
            const cuota = document.getElementById('comInstallmentAmount');
            const autoCalc = () => {
                const tv = parseFloat(total.value) || 0, nv = parseInt(n.value) || 0;
                if (tv > 0 && nv > 0) cuota.value = (tv / nv).toFixed(2);
            };
            total.addEventListener('input', autoCalc);
            n.addEventListener('input', autoCalc);
        } else {
            const cards = creditAccounts();
            dyn.innerHTML = cards.length === 0 ? `
                <p class="form-hint danger-hint">
                    <i class="fas fa-triangle-exclamation"></i>
                    No tienes tarjetas registradas. Créala primero en <strong>Tarjetas</strong>;
                    su compromiso de pago se genera automáticamente.
                </p>
            ` : `
                <div class="form-group">
                    <label>Tarjeta</label>
                    <select class="form-control" id="comAccount" required>
                        ${cards.map(a => `<option value="${a.id}" ${c?.accountId === a.id ? 'selected' : ''}>${esc(a.name)} — debes ${fmt(cardTotals(a).debt)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Pago Mínimo ($)</label>
                        <input type="number" class="form-control" id="comMinPayment" value="${c?.minPayment ?? ''}" step="0.01" min="0" placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label>Día de Pago</label>
                        <input type="number" class="form-control" id="comDueDay" value="${c?.dueDay ?? ''}" min="1" max="31" placeholder="1-31" required>
                    </div>
                </div>
                <p class="form-hint">
                    <i class="fas fa-info-circle"></i>
                    Si dejas el mínimo en 0, cada mes te pedirá saldar el total.
                    El compromiso desaparece solo cuando la tarjeta llega a $0.
                </p>
            `;
        }
    }

    renderDynamic(mode0);
    document.getElementById('comMode').addEventListener('change', function () { renderDynamic(this.value); });

    document.getElementById('commitmentForm').addEventListener('submit', e => {
        e.preventDefault();
        const mode = isEdit ? c.mode : document.getElementById('comMode').value;
        const val = id => document.getElementById(id);

        const data = {
            name: val('comName').value.trim(),
            mode,
            recurringCategory: val('comCategory').value,
            description: val('comDesc').value.trim()
        };

        if (mode === 'fixed') {
            data.amount = round2(parseFloat(val('comAmount').value));
            data.dueDay = parseInt(val('comDueDay').value);
            data.expenseCategory = val('comExpenseCat').value;
        } else if (mode === 'debt') {
            data.totalAmount = round2(parseFloat(val('comTotal').value));
            data.interestRate = parseFloat(val('comInterest').value) || 0;
            data.installments = parseInt(val('comInstallments').value) || 0;
            data.installmentAmount = round2(parseFloat(val('comInstallmentAmount').value) || 0);
            data.frequency = val('comFrequency').value;
            data.startDate = val('comStartDate').value || null;
            data.dueDate = val('comDueDate').value || null;
            data.expenseCategory = val('comExpenseCat').value;
            data.dueDay = dayOfDate(data.startDate) || dayOfDate(data.dueDate) || 1;
        } else {
            if (!val('comAccount')) { showToast('Crea primero la tarjeta en la vista Tarjetas', 'error'); return; }
            data.accountId = val('comAccount').value;
            data.minPayment = round2(parseFloat(val('comMinPayment').value) || 0);
            data.dueDay = parseInt(val('comDueDay').value);
            data.expenseCategory = null;
        }

        if (isEdit) {
            data.active = val('comActive').value === 'true';
            DB.updateCommitment(editId, data);
            showToast('Compromiso actualizado', 'success');
        } else {
            DB.addCommitment(data);
            showToast('Compromiso registrado', 'success');
        }
        closeModal();
        refreshAll();
    });
}

// ---------- PAGAR ----------
// Un solo formulario para los tres modos. La diferencia contable:
//   fijo/deuda -> GASTO (sale de tu bolsillo y es consumo)
//   tarjeta    -> TRANSFERENCIA (el gasto ya se contó al comprar)
function showPayCommitmentForm(id) {
    const c = DB.commitment(id);
    if (!c) return;
    const m = viewMonth.month, y = viewMonth.year;
    const st = commitmentStatus(c, m, y);
    const cat = getRecurringCat(c.recurringCategory);
    const isCard = c.mode === 'card';
    const suggested = st.due > 0 ? st.due : (isCard ? st.remaining : st.expected);
    const max = isCard || c.mode === 'debt' ? st.remaining : null;

    openModal('Registrar Pago', `
        <form id="payCommitmentForm">
            <div class="pay-head">
                <div class="pay-head-icon" style="background: ${cat.color}15; color: ${cat.color};">
                    <i class="fas ${cat.icon}"></i>
                </div>
                <div>
                    <strong>${esc(c.name)}</strong>
                    <div class="pay-head-sub">
                        ${getCommitmentMode(c.mode).name} — vence día ${st.dueDay}
                        ${c.mode !== 'fixed' ? ` · restante ${fmt(st.remaining)}` : ''}
                    </div>
                </div>
            </div>

            <p class="form-hint" style="margin-bottom: 16px;">
                <i class="fas fa-${isCard ? 'exchange-alt' : 'receipt'}"></i>
                ${isCard
                    ? 'Pagar la tarjeta es una <strong>transferencia</strong>, no un gasto nuevo: el gasto ya se contó al hacer cada compra.'
                    : `Se registrará como <strong>gasto</strong> en la categoría ${esc(getCategoryName(c.expenseCategory))}.`}
            </p>

            <div class="form-row">
                <div class="form-group">
                    <label>Monto ($)</label>
                    <input type="number" class="form-control" id="payAmount" value="${suggested > 0 ? suggested.toFixed(2) : ''}"
                           step="0.01" min="0.01" ${max ? `max="${max}"` : ''} required>
                </div>
                <div class="form-group">
                    <label>Fecha de Pago</label>
                    <input type="date" class="form-control" id="payDate" value="${today()}" required>
                </div>
            </div>

            <div class="quick-amounts">
                ${st.due > 0 ? `<button type="button" class="btn btn-primary btn-sm" onclick="setPayAmount(${st.due.toFixed(2)})">Lo que toca (${fmt(st.due)})</button>` : ''}
                ${isCard && c.minPayment > 0 ? `<button type="button" class="btn btn-secondary btn-sm" onclick="setPayAmount(${Math.min(c.minPayment, st.remaining).toFixed(2)})">Mínimo</button>` : ''}
                ${c.mode !== 'fixed' && st.remaining > 0 ? `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="setPayAmount(${(st.remaining * 0.5).toFixed(2)})">50%</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="setPayAmount(${st.remaining.toFixed(2)})">Saldar todo (${fmt(st.remaining)})</button>
                ` : ''}
            </div>

            <div class="form-group">
                <label>Pagar desde${isCard ? '' : ' (opcional)'}</label>
                ${accountSelectHTML('payAccount', '', { kinds: 'cash', required: isCard })}
                ${DB.accounts.filter(a => !isCredit(a)).length === 0
                    ? '<p class="form-hint">No tienes cuentas de dinero registradas.</p>' : ''}
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-success"><i class="fas fa-check"></i> Confirmar Pago</button>
            </div>
        </form>
    `);

    document.getElementById('payCommitmentForm').addEventListener('submit', e => {
        e.preventDefault();
        const amount = round2(parseFloat(document.getElementById('payAmount').value));
        const date = document.getElementById('payDate').value;
        const accEl = document.getElementById('payAccount');
        const accountId = accEl ? accEl.value || null : null;

        if (isCard && !accountId) { showToast('Elige desde qué cuenta pagas la tarjeta', 'error'); return; }

        DB.addTransaction(isCard
            ? {
                type: 'transfer', category: '_transfer',
                description: `Pago a ${c.name}`, amount, date,
                accountId, toAccountId: c.accountId,
                source: { kind: 'commitment', id: c.id }
            }
            : {
                type: 'expense', category: c.expenseCategory || 'other_expense',
                description: c.name, amount, date, accountId,
                source: { kind: 'commitment', id: c.id }
            });

        const after = commitmentStatus(DB.commitment(c.id), m, y);
        showToast(
            after.settled ? `${c.name} saldado por completo 🎉` : `${c.name} — ${fmt(amount)} registrado`,
            'success');
        closeModal();
        refreshAll();
    });
}

function setPayAmount(v) {
    document.getElementById('payAmount').value = v;
}

function deleteCommitmentPrompt(id) {
    const c = DB.commitment(id);
    if (!c) return;
    const n = commitmentPayments(id).length;
    showConfirm(
        n > 0
            ? `¿Eliminar "${c.name}"? Sus ${n} pago${n !== 1 ? 's' : ''} quedarán en el historial de movimientos como manuales.`
            : `¿Eliminar el compromiso "${c.name}"?`,
        () => {
            DB.deleteCommitment(id);
            showToast('Compromiso eliminado', 'error');
            refreshAll();
        });
}

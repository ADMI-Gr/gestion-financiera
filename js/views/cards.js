// ==================== TARJETAS DE CRÉDITO ====================
// Una tarjeta es una cuenta (kind:'credit') + un compromiso (mode:'card').
// Comprar con ella = gasto normal categorizado. Pagarla = transferencia.

function cardBrandIcon(acc) {
    const t = `${acc.cardType || ''} ${acc.alias || ''} ${acc.name || ''}`.toLowerCase();
    if (t.includes('visa')) return 'fab fa-cc-visa';
    if (t.includes('master')) return 'fab fa-cc-mastercard';
    if (t.includes('amex') || t.includes('american')) return 'fab fa-cc-amex';
    return 'fas fa-credit-card';
}

const cardCommitment = accId => DB.commitments.find(c => c.mode === 'card' && c.accountId === accId) || null;

function renderCards() {
    const cards = creditAccounts();
    const totals = cards.map(cardTotals);
    const totalLimit = round2(totals.reduce((s, t) => s + t.limit, 0));
    const totalAvailable = round2(totals.reduce((s, t) => s + t.available, 0));
    const totalDue = round2(totals.reduce((s, t) => s + t.debt, 0));

    document.getElementById('view-cards').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-credit-card"></i></div>
                <div class="stat-info">
                    <h4>Límite Total</h4>
                    <div class="stat-value">${fmt(totalLimit)}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h4>Saldo Disponible</h4>
                    <div class="stat-value">${fmt(totalAvailable)}</div>
                    <div class="stat-sub">Ya descuenta retenido y sobregiro</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="stat-info">
                    <h4>Deuda Actual</h4>
                    <div class="stat-value">${fmt(totalDue)}</div>
                </div>
            </div>
        </div>

        <div class="filter-bar">
            <h3 style="margin-right: auto;">Mis Tarjetas (${cards.length})</h3>
            <button class="btn btn-primary" onclick="showCardForm()"><i class="fas fa-plus"></i> Nueva Tarjeta</button>
        </div>

        ${cards.length === 0
            ? emptyStateHTML('fa-credit-card', 'Sin tarjetas registradas',
                'Agrega tu tarjeta para que sus compras entren a tus gastos y su pago aparezca entre los pendientes del mes.',
                `<button class="btn btn-primary" onclick="showCardForm()"><i class="fas fa-plus"></i> Agregar Tarjeta</button>`)
            : `<div class="cards-grid">${cards.map(renderCreditCard).join('')}</div>`}
    `;
}

function renderCreditCard(acc) {
    const t = cardTotals(acc);
    const usageColor = t.usedPct > 75 ? 'red' : t.usedPct > 40 ? 'yellow' : 'green';
    const alloc = cardPurchaseAllocations(acc.id);
    const purchases = cardPurchases(acc.id);
    const payments = cardPayments(acc.id);
    const com = cardCommitment(acc.id);
    const st = com ? commitmentStatus(com, viewMonth.month, viewMonth.year) : null;
    const purchasedTotal = round2(purchases.reduce((s, p) => s + p.amount, 0));
    const paidTotal = round2(payments.reduce((s, p) => s + p.amount, 0));

    // Con interés y pago mínimo definidos, cuánto costaría pagar solo el mínimo
    const proj = (acc.interestRate > 0 && com && com.minPayment > 0 && t.debt > 0)
        ? projectPayoff(t.debt, acc.interestRate, com.minPayment)
        : null;

    return `
        <div class="credit-card-wrap">
            <div class="credit-card-visual">
                <div class="credit-card-top">
                    <span class="credit-card-alias">${esc(acc.alias || acc.name)}</span>
                    <i class="${cardBrandIcon(acc)}"></i>
                </div>
                <div class="credit-card-number">**** **** **** ${esc(acc.last4 || '····')}</div>
                <div class="credit-card-bottom">
                    <div><span>Disponible</span><strong>${fmt(t.available)}</strong></div>
                    <div><span>Deuda</span><strong>${fmt(t.debt)}</strong></div>
                    <div><span>Límite</span><strong>${fmt(t.limit)}</strong></div>
                </div>
            </div>
            <div class="credit-card-details">
                <div class="credit-card-details-header">
                    <h4>${esc(acc.cardType || 'Tarjeta')}</h4>
                    <div class="actions">
                        <button class="btn-icon success" onclick="showCardPurchaseForm('${acc.id}')" title="Registrar Compra"><i class="fas fa-cart-plus"></i></button>
                        ${t.debt > 0 && com ? `<button class="btn-icon success" onclick="showPayCommitmentForm('${com.id}')" title="Registrar Pago"><i class="fas fa-dollar-sign"></i></button>` : ''}
                        <button class="btn-icon" onclick="showCardForm('${acc.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon danger" onclick="deleteCardPrompt('${acc.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>

                ${st ? `
                    <div class="countdown-badge ${st.settled || st.paidThisMonth ? 'countdown-ok' : st.countdown.css}" style="margin-bottom: 10px;">
                        <i class="fas ${st.settled || st.paidThisMonth ? 'fa-check-circle' : st.countdown.icon}"></i>
                        ${st.settled
                            ? 'Saldada — fuera de los pagos del mes'
                            : st.paidThisMonth
                                ? `Cubierta en ${MONTHS[viewMonth.month]} · ${st.countdown.text}`
                                : `${st.countdown.text} · toca ${fmt(st.due)}`}
                    </div>
                ` : ''}

                <div class="debt-detail"><span>Saldo Retenido</span><span>${fmt(t.held)}</span></div>
                <div class="debt-detail"><span>Sobregiro</span><span>${fmt(t.over)}</span></div>
                ${com ? `<div class="debt-detail"><span>Pago Mínimo</span><span>${fmt(com.minPayment || 0)}</span></div>` : ''}
                ${com ? `<div class="debt-detail"><span>Día de Pago</span><span style="color: var(--primary); font-weight: 700;">${com.dueDay} de cada mes</span></div>` : ''}
                ${acc.cutoffDay ? `<div class="debt-detail"><span>Día de Corte</span><span>${acc.cutoffDay} de cada mes</span></div>` : ''}
                ${acc.interestRate ? `<div class="debt-detail"><span>Tasa de Interés</span><span>${acc.interestRate}% anual</span></div>` : ''}

                ${proj ? `
                    <div class="projection-note ${proj.never ? 'danger' : ''}">
                        <i class="fas fa-hourglass-half"></i>
                        ${proj.never
                            ? `Pagando solo el mínimo de ${fmt(com.minPayment)} <strong>nunca saldarías</strong> esta tarjeta: los intereses crecen más rápido.`
                            : `Pagando solo el mínimo tardarías <strong>${fmtMonths(proj.months)}</strong> y pagarías <strong>${fmt(proj.interest)}</strong> en intereses.`}
                    </div>
                ` : ''}

                <div class="debt-progress">
                    <div class="debt-progress-info">
                        <span>${t.usedPct.toFixed(0)}% del límite usado (${fmt(t.debt)})</span>
                        <span class="badge ${t.debt > 0 ? 'badge-pending' : 'badge-paid'}">${t.debt > 0 ? 'Con saldo' : 'Al día'}</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill ${usageColor}" style="width: ${t.usedPct}%"></div></div>
                </div>

                <div class="card-purchases">
                    <div class="card-purchases-header">
                        <span>Compras (${purchases.length})</span>
                        ${purchasedTotal > 0 ? `<span>Pagado ${fmt(Math.min(paidTotal, purchasedTotal))} de ${fmt(purchasedTotal)}</span>` : ''}
                    </div>
                    ${purchases.length === 0
                        ? `<p class="card-purchases-empty">Sin compras registradas. Usa <i class="fas fa-cart-plus"></i> para agregar la primera; entrará a tus gastos del mes con su categoría.</p>`
                        : purchases.slice(0, 8).map(p => renderCardPurchaseItem(p, alloc[p.id] || 0)).join('')}
                    ${purchases.length > 8 ? `<p class="card-purchases-empty">+ ${purchases.length - 8} compras más — véelas en Transacciones.</p>` : ''}
                </div>

                ${payments.length > 0 ? `
                    <details style="margin-top: 12px;">
                        <summary class="details-summary">Historial de Pagos (${payments.length})</summary>
                        <div class="payment-list" style="margin-top: 8px;">
                            ${payments.map(p => `
                                <div class="payment-item">
                                    <span>${fmtDate(p.date)}${p.accountId ? ` · ${esc(accountName(p.accountId))}` : ''}</span>
                                    <span style="display:flex; align-items:center; gap:8px;">
                                        <strong style="color: var(--success)">${fmt(p.amount)}</strong>
                                        <button class="btn-icon danger sm" onclick="undoPayment('${p.id}')" title="Deshacer este pago"><i class="fas fa-rotate-left"></i></button>
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                ` : ''}
                ${acc.notes ? `<p class="card-notes"><i class="fas fa-sticky-note"></i> ${esc(acc.notes)}</p>` : ''}
            </div>
        </div>
    `;
}

function renderCardPurchaseItem(p, paid) {
    const pct = p.amount > 0 ? Math.min((paid / p.amount) * 100, 100) : 100;
    const done = pct >= 100;
    const color = done ? 'green' : pct > 0 ? 'blue' : 'red';
    return `
        <div class="purchase-item">
            <div class="purchase-item-top">
                <span class="purchase-item-name">${esc(p.description)}</span>
                <span class="purchase-item-amount">${fmt(paid)} / ${fmt(p.amount)}</span>
                <button class="btn-icon danger sm" onclick="deleteTransactionPrompt('${p.id}')" title="Eliminar compra"><i class="fas fa-times"></i></button>
            </div>
            <div class="purchase-item-meta">
                <span><i class="fas ${getCategoryIcon(p.category)}"></i> ${esc(getCategoryName(p.category))}</span>
                <span>${fmtDateShort(p.date)}</span>
                <span class="badge ${done ? 'badge-paid' : 'badge-pending'}">${done ? 'Pagado' : pct > 0 ? `${pct.toFixed(0)}% pagado` : 'Pendiente'}</span>
            </div>
            <div class="progress-bar sm"><div class="progress-fill ${color}" style="width: ${pct}%"></div></div>
        </div>
    `;
}

function showCardForm(editId = null) {
    const acc = editId ? DB.account(editId) : null;
    const isEdit = !!acc;
    const com = isEdit ? cardCommitment(editId) : null;

    openModal(isEdit ? 'Editar Tarjeta' : 'Nueva Tarjeta', `
        <form id="cardForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Alias de la Tarjeta</label>
                    <input type="text" class="form-control" id="cardAlias" value="${esc(acc?.alias || acc?.name || '')}" placeholder="Ej: VISA TARJETA JOVEN" required>
                </div>
                <div class="form-group">
                    <label>Tipo</label>
                    <input type="text" class="form-control" id="cardType" value="${esc(acc?.cardType || '')}" placeholder="Ej: VISA, Mastercard...">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Últimos 4 Dígitos</label>
                    <input type="text" class="form-control" id="cardLast4" value="${esc(acc?.last4 || '')}" maxlength="4" pattern="\\d{4}" placeholder="Ej: 2889">
                </div>
                <div class="form-group">
                    <label>Límite Otorgado ($)</label>
                    <input type="number" class="form-control" id="cardLimit" value="${acc?.creditLimit ?? ''}" step="0.01" min="0" placeholder="0.00" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Saldo Retenido ($)</label>
                    <input type="number" class="form-control" id="cardHeld" value="${acc?.heldBalance ?? ''}" step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Sobregiro ($)</label>
                    <input type="number" class="form-control" id="cardOverdraft" value="${acc?.overdraft ?? ''}" step="0.01" min="0" placeholder="0.00">
                </div>
            </div>
            <p class="form-hint" style="margin-bottom: 14px;">
                <i class="fas fa-info-circle"></i>
                Disponible = límite + sobregiro − deuda − retenido. Estos dos campos ahora sí afectan el cálculo.
            </p>
            <div class="form-row">
                <div class="form-group">
                    <label>Pago Mínimo ($)</label>
                    <input type="number" class="form-control" id="cardMinPay" value="${com?.minPayment ?? ''}" step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Día de Pago</label>
                    <input type="number" class="form-control" id="cardPayDay" value="${com?.dueDay ?? ''}" min="1" max="31" placeholder="1-31" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Día de Corte</label>
                    <input type="number" class="form-control" id="cardCutoff" value="${acc?.cutoffDay || ''}" min="1" max="31" placeholder="Ej: 9">
                </div>
                <div class="form-group">
                    <label>Tasa de Interés (% anual)</label>
                    <input type="number" class="form-control" id="cardInterest" value="${acc?.interestRate ?? ''}" step="0.01" min="0" placeholder="Ej: 39.90">
                </div>
            </div>
            ${!isEdit ? `
                <div class="form-group">
                    <label>Saldo que ya debes hoy ($)</label>
                    <input type="number" class="form-control" id="cardOpeningDebt" value="" step="0.01" min="0" placeholder="0.00">
                    <p class="form-hint">Si la tarjeta ya trae deuda, ponla aquí. Se registra como saldo inicial.</p>
                </div>
            ` : ''}
            <div class="form-group">
                <label>Notas</label>
                <textarea class="form-control" id="cardNotes" rows="2" placeholder="Notas adicionales...">${esc(acc?.notes || '')}</textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Guardar'}</button>
            </div>
        </form>
    `);

    document.getElementById('cardForm').addEventListener('submit', e => {
        e.preventDefault();
        const alias = document.getElementById('cardAlias').value.trim();
        const accData = {
            name: alias, alias,
            cardType: document.getElementById('cardType').value.trim(),
            last4: document.getElementById('cardLast4').value.trim(),
            creditLimit: round2(parseFloat(document.getElementById('cardLimit').value) || 0),
            heldBalance: round2(parseFloat(document.getElementById('cardHeld').value) || 0),
            overdraft: round2(parseFloat(document.getElementById('cardOverdraft').value) || 0),
            cutoffDay: parseInt(document.getElementById('cardCutoff').value) || null,
            interestRate: parseFloat(document.getElementById('cardInterest').value) || 0,
            notes: document.getElementById('cardNotes').value.trim()
        };
        const minPayment = round2(parseFloat(document.getElementById('cardMinPay').value) || 0);
        const dueDay = parseInt(document.getElementById('cardPayDay').value) || 1;

        if (isEdit) {
            DB.updateAccount(editId, accData);
            if (com) DB.updateCommitment(com.id, { name: alias, minPayment, dueDay });
            else DB.addCommitment({ name: alias, mode: 'card', active: true, recurringCategory: 'credit_card',
                                    accountId: editId, minPayment, dueDay });
            showToast('Tarjeta actualizada', 'success');
        } else {
            const openingDebt = round2(parseFloat(document.getElementById('cardOpeningDebt').value) || 0);
            const created = DB.addAccount({ ...accData, kind: 'credit', openingBalance: -openingDebt });
            DB.addCommitment({
                name: alias, mode: 'card', active: true, recurringCategory: 'credit_card',
                expenseCategory: null, description: '', accountId: created.id, minPayment, dueDay
            });
            showToast('Tarjeta registrada', 'success');
        }
        closeModal();
        refreshAll();
    });
}

// Una compra con tarjeta es un GASTO normal, con su categoría, sobre la cuenta de crédito.
function showCardPurchaseForm(accId) {
    const acc = DB.account(accId);
    if (!acc) return;
    const t = cardTotals(acc);

    openModal('Registrar Compra con Tarjeta', `
        <form id="cardPurchaseForm">
            <p class="form-hint" style="margin-bottom: 16px;">
                <strong>${esc(acc.name)}</strong> — Disponible: <strong style="color: var(--success)">${fmt(t.available)}</strong><br>
                <i class="fas fa-info-circle"></i> La compra entra a los <strong>gastos del mes</strong> y a tus presupuestos con la categoría que elijas.
            </p>
            <div class="form-group">
                <label>¿Qué compraste?</label>
                <input type="text" class="form-control" id="purchaseDesc" placeholder="Ej: Teclado, super, gasolina..." required>
            </div>
            <div class="form-group">
                <label>Categoría</label>
                <select class="form-control" id="purchaseCat" required>
                    ${CATEGORIES.expense.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto ($)</label>
                    <input type="number" class="form-control" id="purchaseAmount" step="0.01" min="0.01" placeholder="0.00" required>
                </div>
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" class="form-control" id="purchaseDate" value="${today()}" required>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-cart-plus"></i> Registrar Compra</button>
            </div>
        </form>
    `);

    document.getElementById('cardPurchaseForm').addEventListener('submit', e => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('purchaseAmount').value);
        DB.addTransaction({
            type: 'expense',
            category: document.getElementById('purchaseCat').value,
            description: document.getElementById('purchaseDesc').value.trim(),
            amount, date: document.getElementById('purchaseDate').value,
            accountId: accId, source: { kind: 'manual', id: null }
        });
        showToast(amount > t.available ? 'Compra registrada — ¡supera tu disponible!' : 'Compra registrada', amount > t.available ? 'error' : 'success');
        closeModal();
        refreshAll();
    });
}

function deleteCardPrompt(id) {
    const acc = DB.account(id);
    if (!acc) return;
    const linked = DB.transactions.filter(t => t.accountId === id || t.toAccountId === id).length;
    showConfirm(
        `¿Eliminar la tarjeta "${acc.name}"? Sus ${linked} movimiento${linked !== 1 ? 's' : ''} quedarán en el historial sin cuenta asignada.`,
        () => {
            DB.deleteAccount(id);
            showToast('Tarjeta eliminada', 'error');
            refreshAll();
        });
}

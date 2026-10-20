// ==================== PRESUPUESTOS ====================
// Usa el mismo mes activo que el Dashboard y Compromisos.
// Los gastos incluyen las compras con tarjeta; las transferencias no cuentan.

function renderBudgets() {
    const m = viewMonth.month, y = viewMonth.year;
    const budgets = DB.budgets.filter(b => b.month === m && b.year === y);
    const catExpenses = monthExpensesByCategory(m, y);

    const totalBudget = round2(budgets.reduce((s, b) => s + b.limit, 0));
    const totalSpent = round2(budgets.reduce((s, b) => s + (catExpenses[b.category] || 0), 0));
    const usedPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Gasto del mes que no está cubierto por ningún presupuesto
    const covered = new Set(budgets.map(b => b.category));
    const uncovered = Object.entries(catExpenses)
        .filter(([cat]) => !covered.has(cat))
        .sort((a, b) => b[1] - a[1]);
    const uncoveredTotal = round2(uncovered.reduce((s, [, v]) => s + v, 0));

    document.getElementById('view-budgets').innerHTML = `
        <div class="view-toolbar">
            ${monthNavHTML()}
            <button class="btn btn-primary btn-sm" onclick="showBudgetForm()">
                <i class="fas fa-plus"></i> Nuevo Presupuesto
            </button>
        </div>

        ${budgets.length === 0
            ? emptyStateHTML('fa-bullseye', `Sin presupuestos en ${MONTHS[m]} ${y}`,
                'Define límites por categoría para controlar tus gastos del mes.',
                `<div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                    <button class="btn btn-primary" onclick="showBudgetForm()"><i class="fas fa-plus"></i> Crear Presupuesto</button>
                    ${copyableBudgetSource(m, y) ? `<button class="btn btn-secondary" onclick="copyPreviousBudgets()"><i class="fas fa-copy"></i> Copiar del mes anterior</button>` : ''}
                </div>`)
            : `
            <div class="stats-grid" style="margin-bottom: 24px;">
                <div class="stat-card">
                    <div class="stat-icon purple"><i class="fas fa-bullseye"></i></div>
                    <div class="stat-info">
                        <h4>Presupuesto Total</h4>
                        <div class="stat-value">${fmt(totalBudget)}</div>
                        <div class="stat-sub">${budgets.length} categoría${budgets.length !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon ${totalSpent > totalBudget ? 'red' : 'green'}">
                        <i class="fas fa-${totalSpent > totalBudget ? 'exclamation-triangle' : 'check-circle'}"></i>
                    </div>
                    <div class="stat-info">
                        <h4>Total Gastado</h4>
                        <div class="stat-value">${fmt(totalSpent)}</div>
                        <div class="stat-sub">${usedPct.toFixed(0)}% utilizado</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon blue"><i class="fas fa-piggy-bank"></i></div>
                    <div class="stat-info">
                        <h4>Disponible</h4>
                        <div class="stat-value" style="color: ${totalBudget - totalSpent >= 0 ? 'var(--success)' : 'var(--danger)'}">
                            ${fmt(totalBudget - totalSpent)}
                        </div>
                    </div>
                </div>
            </div>

            <div class="budget-grid">
                ${budgets.map(b => {
                    const spent = catExpenses[b.category] || 0;
                    const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                    const over = spent > b.limit;
                    const near = pct >= 80 && !over;
                    const color = over ? 'red' : near ? 'yellow' : 'green';
                    return `
                        <div class="budget-card">
                            <div class="budget-card-header">
                                <h4><i class="fas ${getCategoryIcon(b.category)}"></i> ${esc(getCategoryName(b.category))}</h4>
                                <div class="actions">
                                    <button class="btn-icon" onclick="showBudgetForm('${b.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                                    <button class="btn-icon danger" onclick="deleteBudgetPrompt('${b.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                            <div class="budget-amounts">
                                <span>Gastado: ${fmt(spent)}</span>
                                <span>Límite: ${fmt(b.limit)}</span>
                            </div>
                            <div class="progress-bar"><div class="progress-fill ${color}" style="width: ${pct}%"></div></div>
                            ${over ? `<div class="budget-alert danger"><i class="fas fa-exclamation-circle"></i> Excedido por ${fmt(spent - b.limit)}</div>` : ''}
                            ${near ? `<div class="budget-alert warning"><i class="fas fa-exclamation-triangle"></i> Cerca del límite (${pct.toFixed(0)}%)</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `}

        ${uncovered.length > 0 ? `
            <div class="card" style="margin-top: 24px;">
                <div class="card-header">
                    <h3><i class="fas fa-circle-question" style="margin-right:8px; color: var(--text-secondary);"></i>
                        Gasto sin presupuesto — ${fmt(uncoveredTotal)}</h3>
                </div>
                <div class="card-body">
                    <p class="form-hint" style="margin-bottom: 12px;">
                        Categorías en las que gastaste este mes y para las que no definiste límite.
                    </p>
                    <div class="uncovered-list">
                        ${uncovered.map(([cat, amount]) => `
                            <div class="uncovered-item">
                                <span><i class="fas ${getCategoryIcon(cat)}"></i> ${esc(getCategoryName(cat))}</span>
                                <span style="display:flex; align-items:center; gap:10px;">
                                    <strong class="amount-expense">${fmt(amount)}</strong>
                                    <button class="btn btn-secondary btn-sm" onclick="showBudgetForm(null, '${cat}')">
                                        <i class="fas fa-plus"></i> Presupuestar
                                    </button>
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        ` : ''}
    `;
}

function copyableBudgetSource(m, y) {
    const prev = shiftMonth(m, y, -1);
    return DB.budgets.some(b => b.month === prev.month && b.year === prev.year);
}

function copyPreviousBudgets() {
    const m = viewMonth.month, y = viewMonth.year;
    const prev = shiftMonth(m, y, -1);
    const src = DB.budgets.filter(b => b.month === prev.month && b.year === prev.year);
    if (src.length === 0) { showToast('No hay presupuestos el mes anterior', 'error'); return; }
    src.forEach(b => {
        const exists = DB.budgets.some(x => x.category === b.category && x.month === m && x.year === y);
        if (!exists) DB.addBudget({ category: b.category, limit: b.limit, month: m, year: y });
    });
    showToast(`${src.length} presupuesto${src.length !== 1 ? 's' : ''} copiado${src.length !== 1 ? 's' : ''}`, 'success');
    refreshAll();
}

function showBudgetForm(editId = null, presetCategory = null) {
    const b = editId ? DB.budgets.find(x => x.id === editId) : null;
    const isEdit = !!b;
    const m = b ? b.month : viewMonth.month;
    const y = b ? b.year : viewMonth.year;
    const selectedCat = b?.category || presetCategory;

    openModal(isEdit ? 'Editar Presupuesto' : 'Nuevo Presupuesto', `
        <form id="budgetForm">
            <div class="form-group">
                <label>Categoría</label>
                <select class="form-control" id="budgetCat" required ${isEdit ? 'disabled' : ''}>
                    ${CATEGORIES.expense.map(c => `<option value="${c.id}" ${selectedCat === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Límite Mensual ($)</label>
                <input type="number" class="form-control" id="budgetLimit" value="${b?.limit || ''}" step="0.01" min="0.01" placeholder="0.00" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Mes</label>
                    <select class="form-control" id="budgetFormMonth">
                        ${MONTHS.map((name, i) => `<option value="${i}" ${m === i ? 'selected' : ''}>${name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Año</label>
                    <input type="number" class="form-control" id="budgetFormYear" value="${y}" min="2020" max="2040">
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Guardar'}</button>
            </div>
        </form>
    `);

    document.getElementById('budgetForm').addEventListener('submit', e => {
        e.preventDefault();
        const data = {
            category: isEdit ? b.category : document.getElementById('budgetCat').value,
            limit: round2(parseFloat(document.getElementById('budgetLimit').value)),
            month: parseInt(document.getElementById('budgetFormMonth').value),
            year: parseInt(document.getElementById('budgetFormYear').value)
        };

        if (!isEdit && DB.budgets.some(x => x.category === data.category && x.month === data.month && x.year === data.year)) {
            showToast('Ya existe un presupuesto para esta categoría en ese mes', 'error');
            return;
        }

        if (isEdit) { DB.updateBudget(editId, data); showToast('Presupuesto actualizado', 'success'); }
        else { DB.addBudget(data); showToast('Presupuesto creado', 'success'); }

        // Si lo creó para otro mes, muévete a ese mes para que lo vea
        viewMonth.month = data.month;
        viewMonth.year = data.year;
        closeModal();
        refreshAll();
    });
}

function deleteBudgetPrompt(id) {
    showConfirm('¿Eliminar este presupuesto?', () => {
        DB.deleteBudget(id);
        showToast('Presupuesto eliminado', 'error');
        refreshAll();
    });
}

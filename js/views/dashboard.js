// ==================== DASHBOARD ====================
function renderDashboard() {
    const m = viewMonth.month, y = viewMonth.year;
    const { income, expenses } = monthTotals(m, y);
    const cash = totalCash();            // mismo cálculo que la vista Cuentas
    const debt = totalDebt();
    const pending = pendingCommitments(m, y);
    const recent = DB.transactions.slice(0, 7);

    document.getElementById('view-dashboard').innerHTML = `
        <div class="view-toolbar">
            ${monthNavHTML()}
            <button class="btn btn-primary btn-sm" onclick="showTransactionForm()">
                <i class="fas fa-plus"></i> Nuevo Movimiento
            </button>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-wallet"></i></div>
                <div class="stat-info">
                    <h4>Balance Total</h4>
                    <div class="stat-value" style="color: ${cash >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(cash)}</div>
                    <div class="stat-sub">Suma de tus cuentas</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-arrow-down"></i></div>
                <div class="stat-info">
                    <h4>Ingresos del Mes</h4>
                    <div class="stat-value">${fmt(income)}</div>
                    <div class="stat-sub">${MONTHS[m]} ${y}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red"><i class="fas fa-arrow-up"></i></div>
                <div class="stat-info">
                    <h4>Gastos del Mes</h4>
                    <div class="stat-value">${fmt(expenses)}</div>
                    <div class="stat-sub">Incluye compras con tarjeta</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon yellow"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="stat-info">
                    <h4>Deuda Total</h4>
                    <div class="stat-value">${fmt(debt)}</div>
                    <div class="stat-sub">Deudas + saldo de tarjetas</div>
                </div>
            </div>
        </div>

        ${renderPendingPaymentsCard(pending, m, y)}

        ${DB.accounts.length > 0 ? `
        <div class="card" style="margin-bottom: 28px;">
            <div class="card-header">
                <h3><i class="fas fa-coins" style="margin-right: 8px; color: var(--primary);"></i>Mis Cuentas</h3>
                <button class="btn btn-primary btn-sm" onclick="navigate('accounts')">Ver Todas</button>
            </div>
            <div class="card-body">
                <div class="account-chips">
                    ${DB.accounts.map(a => {
                        const k = getAccountKind(a.kind);
                        const bal = accountBalance(a.id);
                        return `<div class="account-chip">
                            <i class="fas ${k.icon}" style="color: ${k.color};"></i>
                            <div>
                                <div class="account-chip-name">${esc(a.name)}</div>
                                <div class="account-chip-balance" style="color: ${bal >= 0 ? 'var(--text)' : 'var(--danger)'};">
                                    ${fmt(bal)}
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>` : ''}

        <div class="grid-2">
            <div class="card">
                <div class="card-header"><h3>Ingresos vs Gastos (6 meses)</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="dashChart1"></canvas></div></div>
            </div>
            <div class="card">
                <div class="card-header"><h3>Gastos por Categoría</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="dashChart2"></canvas></div></div>
            </div>
        </div>

        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h3>Movimientos Recientes</h3>
                <button class="btn btn-primary btn-sm" onclick="navigate('transactions')">Ver Todos</button>
            </div>
            <div class="card-body">
                ${recent.length === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-receipt"></i>
                        <h4>Sin movimientos</h4>
                        <p>Agrega tu primer movimiento para comenzar</p>
                    </div>
                ` : recent.map(renderRecentItem).join('')}
            </div>
        </div>
    `;

    renderDashboardCharts(m, y);
}

function renderRecentItem(t) {
    const isTransfer = t.type === 'transfer';
    const iconCls = t.type === 'income' ? 'income' : isTransfer ? 'transfer' : t.type === 'adjustment' ? 'adjust' : 'expense';
    const sub = isTransfer
        ? `${esc(accountName(t.accountId))} → ${esc(accountName(t.toAccountId))}`
        : esc(getCategoryName(t.category));
    return `
        <div class="transaction-item">
            <div class="transaction-left">
                <div class="transaction-icon ${iconCls}">
                    <i class="fas ${getCategoryIcon(t.category)}"></i>
                </div>
                <div>
                    <div class="transaction-desc">${esc(t.description)}</div>
                    <div class="transaction-cat">${sub}</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div class="transaction-amount">${txAmountHTML(t)}</div>
                <div class="transaction-date">${fmtDateShort(t.date)}</div>
            </div>
        </div>
    `;
}

// ---------- PAGOS PENDIENTES ----------
// Aquí conviven por fin los tres modos: pagos fijos, deudas y TARJETAS.
function renderPendingPaymentsCard(pending, m, y) {
    if (pending.length === 0) {
        return `
            <div class="card" style="margin-bottom: 28px;">
                <div class="card-header">
                    <h3><i class="fas fa-check-circle" style="color: var(--success); margin-right: 8px;"></i>Pagos del Mes</h3>
                    <button class="btn btn-secondary btn-sm" onclick="navigate('commitments')">Ver Compromisos</button>
                </div>
                <div class="card-body">
                    <div class="empty-state" style="padding: 24px 12px;">
                        <i class="fas fa-mug-hot"></i>
                        <h4>Todo al día en ${MONTHS[m]}</h4>
                        <p>No tienes pagos pendientes este mes.</p>
                    </div>
                </div>
            </div>
        `;
    }

    const total = round2(pending.reduce((s, x) => s + x.st.due, 0));

    return `
        <div class="card" style="margin-bottom: 28px;">
            <div class="card-header">
                <h3><i class="fas fa-bell" style="color: var(--warning); margin-right: 8px;"></i>
                    Pagos Pendientes (${pending.length}) — ${fmt(total)}</h3>
                <button class="btn btn-secondary btn-sm" onclick="navigate('commitments')">Ver Compromisos</button>
            </div>
            <div class="card-body">
                <div class="pending-payments-list">
                    ${pending.map(({ c, st }) => {
                        const cat = getRecurringCat(c.recurringCategory);
                        const overdue = st.countdown.css === 'countdown-overdue';
                        const extra = c.mode === 'card'
                            ? `Saldo ${fmt(st.remaining)}${c.minPayment > 0 ? ` · mínimo ${fmt(c.minPayment)}` : ''}`
                            : c.mode === 'debt'
                                ? `Restante ${fmt(st.remaining)}`
                                : '';
                        return `
                            <div class="pending-payment-item ${overdue ? 'overdue' : ''}">
                                <div class="pending-payment-left">
                                    <i class="fas ${cat.icon}" style="color: ${cat.color}"></i>
                                    <div>
                                        <div class="pending-payment-name">
                                            ${esc(c.name)}
                                            <span class="mode-tag mode-${c.mode}">${getCommitmentMode(c.mode).name}</span>
                                        </div>
                                        <div class="pending-payment-due">
                                            ${st.countdown.text} — <strong>${fmt(st.due)}</strong>
                                            ${extra ? ` · ${extra}` : ''}
                                        </div>
                                    </div>
                                </div>
                                <button class="btn btn-success btn-sm" onclick="showPayCommitmentForm('${c.id}')">
                                    <i class="fas fa-check"></i> Pagar
                                </button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderDashboardCharts(m, y) {
    const labels = [], incomeData = [], expenseData = [];
    for (let i = 5; i >= 0; i--) {
        const { month, year } = shiftMonth(m, y, -i);
        labels.push(MONTHS[month].substring(0, 3));
        const t = monthTotals(month, year);
        incomeData.push(t.income);
        expenseData.push(t.expenses);
    }

    createChart('dashChart1', {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Ingresos', data: incomeData, backgroundColor: '#10B981', borderRadius: 6 },
                { label: 'Gastos', data: expenseData, backgroundColor: '#EF4444', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() } } }
        }
    });

    const catExpenses = monthExpensesByCategory(m, y);
    const catLabels = Object.keys(catExpenses).map(getCategoryName);
    const catData = Object.values(catExpenses);

    if (catLabels.length > 0) {
        createChart('dashChart2', {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{ data: catData, backgroundColor: CHART_COLORS.slice(0, catLabels.length), borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { padding: 12, usePointStyle: true } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
                }
            }
        });
    }
}

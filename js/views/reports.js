// ==================== REPORTES ====================
// Ya no solo transacciones: también deudas, tarjetas y cumplimiento de presupuestos.

function renderReports() {
    const y = renderReports._year || (renderReports._year = currentYear());

    document.getElementById('view-reports').innerHTML = `
        <div class="report-filters">
            <label style="font-weight: 600; font-size: 0.9rem;">Año:</label>
            <input type="number" class="form-control" id="reportYear" value="${y}" min="2020" max="2040" style="width: 100px;">
            <button class="btn btn-primary btn-sm" onclick="updateReports()"><i class="fas fa-sync"></i> Actualizar</button>
            <button class="btn btn-secondary btn-sm" onclick="exportCSV()"><i class="fas fa-file-csv"></i> Exportar CSV</button>
        </div>

        <div id="reportSummary"></div>

        <div class="report-grid">
            <div class="card">
                <div class="card-header"><h3>Ingresos vs Gastos Mensual</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="reportChart1"></canvas></div></div>
            </div>
            <div class="card">
                <div class="card-header"><h3>Balance Acumulado</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="reportChart2"></canvas></div></div>
            </div>
            <div class="card">
                <div class="card-header"><h3>Distribución de Gastos (Anual)</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="reportChart3"></canvas></div></div>
            </div>
            <div class="card">
                <div class="card-header"><h3>Distribución de Ingresos (Anual)</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="reportChart4"></canvas></div></div>
            </div>
        </div>

        <div class="card" style="margin-top: 20px;">
            <div class="card-header"><h3>Resumen Mensual</h3></div>
            <div class="card-body">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Balance</th><th>Ahorro %</th>
                            </tr>
                        </thead>
                        <tbody id="reportTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="reportDebts"></div>
        <div id="reportBudgets"></div>
    `;

    document.getElementById('reportYear').addEventListener('change', function () {
        renderReports._year = parseInt(this.value) || currentYear();
        updateReports();
    });

    updateReports();
}

function updateReports() {
    const y = parseInt(document.getElementById('reportYear').value) || currentYear();
    renderReports._year = y;

    const labels = MONTHS.map(mo => mo.substring(0, 3));
    const incomeData = [], expenseData = [], balanceData = [];
    let cumulative = 0, yearIncome = 0, yearExpense = 0;
    const rows = [];

    for (let m = 0; m < 12; m++) {
        const t = monthTotals(m, y);
        cumulative += t.balance;
        yearIncome += t.income;
        yearExpense += t.expenses;
        incomeData.push(t.income);
        expenseData.push(t.expenses);
        balanceData.push(round2(cumulative));

        if (t.income > 0 || t.expenses > 0) {
            const rate = t.income > 0 ? ((t.balance / t.income) * 100).toFixed(1) : '0.0';
            rows.push(`
                <tr>
                    <td><strong>${MONTHS[m]}</strong></td>
                    <td class="amount-income">${fmt(t.income)}</td>
                    <td class="amount-expense">${fmt(t.expenses)}</td>
                    <td style="color: ${t.balance >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${fmt(t.balance)}</td>
                    <td>${rate}%</td>
                </tr>
            `);
        }
    }

    const net = round2(yearIncome - yearExpense);
    const savingsRate = yearIncome > 0 ? (net / yearIncome) * 100 : 0;

    document.getElementById('reportSummary').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-arrow-down"></i></div>
                <div class="stat-info">
                    <h4>Ingresos ${y}</h4><div class="stat-value">${fmt(yearIncome)}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red"><i class="fas fa-arrow-up"></i></div>
                <div class="stat-info">
                    <h4>Gastos ${y}</h4><div class="stat-value">${fmt(yearExpense)}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon ${net >= 0 ? 'blue' : 'red'}"><i class="fas fa-scale-balanced"></i></div>
                <div class="stat-info">
                    <h4>Balance del Año</h4>
                    <div class="stat-value" style="color: ${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(net)}</div>
                    <div class="stat-sub">Tasa de ahorro ${savingsRate.toFixed(1)}%</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('reportTableBody').innerHTML = rows.length > 0 ? rows.join('') :
        '<tr><td colspan="5"><div class="empty-state"><i class="fas fa-chart-bar"></i><h4>Sin datos</h4><p>No hay movimientos para este año</p></div></td></tr>';

    createChart('reportChart1', {
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

    createChart('reportChart2', {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Balance Acumulado', data: balanceData,
                borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.1)',
                fill: true, tension: 0.3, pointRadius: 4, pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { ticks: { callback: v => '$' + v.toLocaleString() } } }
        }
    });

    // Solo ingresos y gastos: transferencias y ajustes quedan fuera
    const yearTxs = DB.transactions.filter(t => parseDate(t.date).getFullYear() === y);
    const expByCat = {}, incByCat = {};
    yearTxs.forEach(t => {
        if (isSpend(t)) expByCat[t.category] = round2((expByCat[t.category] || 0) + t.amount);
        else if (isEarn(t)) incByCat[t.category] = round2((incByCat[t.category] || 0) + t.amount);
    });

    const expLabels = Object.keys(expByCat).map(getCategoryName);
    if (expLabels.length > 0) {
        createChart('reportChart3', {
            type: 'doughnut',
            data: { labels: expLabels, datasets: [{ data: Object.values(expByCat), backgroundColor: CHART_COLORS.slice(0, expLabels.length), borderWidth: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { padding: 10, usePointStyle: true } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
                }
            }
        });
    }

    const incLabels = Object.keys(incByCat).map(getCategoryName);
    if (incLabels.length > 0) {
        createChart('reportChart4', {
            type: 'doughnut',
            data: { labels: incLabels, datasets: [{ data: Object.values(incByCat), backgroundColor: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'], borderWidth: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { padding: 10, usePointStyle: true } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
                }
            }
        });
    }

    renderDebtReport();
    renderBudgetReport(y);
}

// ---------- ESTADO DE DEUDAS Y TARJETAS ----------
function renderDebtReport() {
    const m = currentMonth(), y = currentYear();
    const rows = DB.commitments
        .filter(c => c.mode !== 'fixed')
        .map(c => ({ c, st: commitmentStatus(c, m, y) }))
        .sort((a, b) => b.st.remaining - a.st.remaining);

    const container = document.getElementById('reportDebts');
    if (rows.length === 0) { container.innerHTML = ''; return; }

    const total = round2(rows.reduce((s, x) => s + x.st.remaining, 0));
    const monthlyLoad = round2(rows.reduce((s, x) => s + (x.st.settled ? 0 : x.st.expected), 0));

    container.innerHTML = `
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h3><i class="fas fa-file-invoice-dollar" style="margin-right:8px; color: var(--danger);"></i>
                    Estado de Deudas y Tarjetas</h3>
                <span class="header-note">Deuda viva ${fmt(total)} · carga mensual ${fmt(monthlyLoad)}</span>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Compromiso</th><th>Tipo</th><th>Pagado</th><th>Restante</th>
                                <th>Cuota / Mínimo</th><th>Avance</th><th>Solo con el mínimo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(({ c, st }) => {
                                const acc = st.account;
                                const rate = c.mode === 'card' ? (acc?.interestRate || 0) : (c.interestRate || 0);
                                const monthly = c.mode === 'card' ? (c.minPayment || 0) : (c.installmentAmount || 0);
                                const proj = (!st.settled && rate > 0 && monthly > 0)
                                    ? projectPayoff(st.remaining, rate, monthly) : null;
                                const pct = st.progress !== null && c.mode === 'debt' ? st.progress : null;
                                return `
                                    <tr class="${st.settled ? 'row-settled' : ''}">
                                        <td><strong>${esc(c.name)}</strong></td>
                                        <td><span class="mode-tag mode-${c.mode}">${getCommitmentMode(c.mode).name}</span></td>
                                        <td class="amount-income">${fmt(st.paidTotal)}</td>
                                        <td class="${st.settled ? '' : 'amount-expense'}">${st.settled ? '<span class="badge badge-paid">Saldado</span>' : fmt(st.remaining)}</td>
                                        <td>${monthly > 0 ? fmt(monthly) : '—'}</td>
                                        <td>${pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
                                        <td>${!proj ? '—'
                                            : proj.never
                                                ? '<span class="amount-expense">Nunca se salda</span>'
                                                : `${fmtMonths(proj.months)} · <span class="amount-expense">${fmt(proj.interest)}</span> de interés`}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ---------- CUMPLIMIENTO DE PRESUPUESTOS ----------
function renderBudgetReport(y) {
    const budgets = DB.budgets.filter(b => b.year === y);
    const container = document.getElementById('reportBudgets');
    if (budgets.length === 0) { container.innerHTML = ''; return; }

    const byMonth = {};
    budgets.forEach(b => {
        if (!byMonth[b.month]) byMonth[b.month] = { limit: 0, spent: 0, over: 0, count: 0 };
        const spent = monthExpensesByCategory(b.month, y)[b.category] || 0;
        byMonth[b.month].limit += b.limit;
        byMonth[b.month].spent += spent;
        byMonth[b.month].count++;
        if (spent > b.limit) byMonth[b.month].over++;
    });

    const months = Object.keys(byMonth).map(Number).sort((a, b) => a - b);

    container.innerHTML = `
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h3><i class="fas fa-bullseye" style="margin-right:8px; color: var(--purple);"></i>
                    Cumplimiento de Presupuestos ${y}</h3>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>Mes</th><th>Presupuestado</th><th>Gastado</th><th>Diferencia</th><th>Categorías excedidas</th></tr>
                        </thead>
                        <tbody>
                            ${months.map(m => {
                                const d = byMonth[m];
                                const diff = round2(d.limit - d.spent);
                                return `
                                    <tr>
                                        <td><strong>${MONTHS[m]}</strong></td>
                                        <td>${fmt(d.limit)}</td>
                                        <td class="amount-expense">${fmt(d.spent)}</td>
                                        <td style="color: ${diff >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${fmt(diff)}</td>
                                        <td>${d.over === 0
                                            ? '<span class="badge badge-paid">Ninguna</span>'
                                            : `<span class="badge badge-overdue">${d.over} de ${d.count}</span>`}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function exportCSV() {
    const txs = DB.transactions;
    if (txs.length === 0) { showToast('No hay datos para exportar', 'error'); return; }

    const TYPE_LABEL = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', adjustment: 'Ajuste' };
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;

    let csv = 'Fecha,Tipo,Categoria,Descripcion,Cuenta,Cuenta Destino,Origen,Monto\n';
    [...txs].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(t => {
        const origen = !t.source || t.source.kind === 'manual' ? 'Manual'
            : t.source.kind === 'adjustment' ? 'Ajuste'
            : (DB.commitment(t.source.id)?.name || 'Compromiso');
        const signed = t.type === 'expense' ? -t.amount : t.amount;
        csv += [
            t.date, TYPE_LABEL[t.type] || t.type, q(getCategoryName(t.category)), q(t.description),
            q(t.accountId ? accountName(t.accountId) : ''), q(t.toAccountId ? accountName(t.toAccountId) : ''),
            q(origen), signed
        ].join(',') + '\n';
    });

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `movimientos_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('CSV exportado correctamente', 'success');
}

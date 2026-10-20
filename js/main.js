// ==================== ARRANQUE ====================

// ---------- RESPALDO ----------
document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([DB.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finanzas_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Respaldo exportado', 'success');
});

document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        showConfirm(
            'Importar reemplaza todos los datos actuales de la app. ¿Continuar?',
            () => {
                try {
                    if (DB.importAll(event.target.result)) {
                        showToast('Datos importados correctamente', 'success');
                        navigate(currentView);
                    } else {
                        showToast('Archivo inválido', 'error');
                    }
                } catch {
                    showToast('Error al leer el archivo', 'error');
                }
            },
            'Importar');
    };
    reader.readAsText(file);
    e.target.value = '';
});

// ---------- FECHA ----------
document.getElementById('currentDate').textContent = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// ---------- PRIMERA VEZ ----------
// La app arranca vacía. Ya no trae datos de nadie horneados en el código fuente.
function isFirstRun() {
    const d = DB.raw;
    return d.accounts.length === 0 && d.transactions.length === 0 &&
           d.commitments.length === 0 && d.budgets.length === 0;
}

function showWelcome() {
    openModal('Bienvenido a FinanzasApp', `
        <p style="color: var(--text-secondary); margin-bottom: 18px; line-height: 1.6;">
            Para empezar, crea la cuenta donde tienes tu dinero (tu cartera, tu banco...).
            Después puedes agregar tarjetas, compromisos de pago y presupuestos.
        </p>
        <p class="form-hint" style="margin-bottom: 18px;">
            <i class="fas fa-shield-halved"></i>
            Todo se guarda solo en este navegador. Usa <strong>Exportar</strong> para hacer respaldos.
        </p>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Ahora no</button>
            <button type="button" class="btn btn-primary" onclick="closeModal(); navigate('accounts'); showAccountForm();">
                <i class="fas fa-plus"></i> Crear mi primera cuenta
            </button>
        </div>
    `);
}

// ---------- INICIO ----------
navigate('dashboard');

if (isFirstRun()) showWelcome();
else if (DB.migrationReport) {
    const r = DB.migrationReport;
    showToast(`Datos migrados: ${r.accounts} cuentas, ${r.transactions} movimientos, ${r.commitments} compromisos`, 'success');
}

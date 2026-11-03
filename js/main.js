// ==================== ARRANQUE ====================

// ---------- RESPALDO ----------
document.getElementById('exportBtn').addEventListener('click', async () => {
    await DB.flush();
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
            'Importar reemplaza todos los datos de tu cuenta en la nube. ¿Continuar?',
            () => importData(event.target.result),
            'Importar');
    };
    reader.readAsText(file);
    e.target.value = '';
});

async function importData(json, onDone) {
    showToast('Subiendo datos…', 'info');
    try {
        if (await DB.importAll(json)) {
            const d = DB.raw;
            showToast(`Datos importados: ${d.accounts.length} cuentas, ${d.transactions.length} movimientos`, 'success');
            if (onDone) onDone();
            navigate(currentView);
        } else {
            showToast('Archivo inválido', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('No se pudieron subir los datos. Intenta de nuevo.', 'error');
        try { await DB.load(); navigate(currentView); } catch { /* sin conexión */ }
    }
}

document.getElementById('signOutBtn').addEventListener('click', async () => {
    await DB.flush();
    Auth.signOut();
});

// ---------- FECHA ----------
document.getElementById('currentDate').textContent = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// ---------- PRIMERA VEZ ----------
function isFirstRun() {
    const d = DB.raw;
    return d.accounts.length === 0 && d.transactions.length === 0 &&
           d.commitments.length === 0 && d.budgets.length === 0;
}

function showWelcome() {
    openModal('Bienvenido a Gestión Financiera', `
        <p style="color: var(--text-secondary); margin-bottom: 18px; line-height: 1.6;">
            Para empezar, crea la cuenta donde tienes tu dinero (tu cartera, tu banco...).
            Después puedes agregar tarjetas, compromisos de pago y presupuestos.
        </p>
        <p class="form-hint" style="margin-bottom: 18px;">
            <i class="fas fa-cloud"></i>
            Todo se guarda en tu cuenta ADMI: lo verás igual desde cualquier dispositivo.
        </p>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Ahora no</button>
            <button type="button" class="btn btn-primary" onclick="closeModal(); navigate('accounts'); showAccountForm();">
                <i class="fas fa-plus"></i> Crear mi primera cuenta
            </button>
        </div>
    `);
}

// La versión anterior guardaba todo en el navegador. Si la nube está vacía y aquí
// quedaron datos, se ofrece subirlos.
function offerLegacyUpload(legacy) {
    const nAcc = (legacy.accounts || []).length + (legacy.cards || []).length;
    const nTx = (legacy.transactions || []).length;
    openModal('Datos encontrados en este navegador', `
        <p style="color: var(--text-secondary); margin-bottom: 18px; line-height: 1.6;">
            Este navegador tiene datos de la versión anterior de la app
            (<strong>${nAcc}</strong> cuentas, <strong>${nTx}</strong> movimientos).
            ¿Quieres subirlos a tu cuenta para tenerlos en la nube?
        </p>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal(); showWelcome();">Empezar de cero</button>
            <button type="button" class="btn btn-primary" id="legacyUploadBtn">
                <i class="fas fa-cloud-upload-alt"></i> Subir mis datos
            </button>
        </div>
    `);
    document.getElementById('legacyUploadBtn').addEventListener('click', e => {
        e.currentTarget.disabled = true;
        importData(legacy, () => { DB.archiveLocalLegacyData(); closeModal(); });
    });
}

// ---------- INICIO ----------
async function boot() {
    await Auth.requireUser();
    document.getElementById('pageTitle').textContent = 'Cargando…';
    try {
        await DB.load();
    } catch (err) {
        console.error(err);
        showToast('No se pudieron cargar tus datos. Revisa tu conexión y recarga.', 'error');
        return;
    }
    DB._setSync();
    navigate('dashboard');

    if (isFirstRun()) {
        const legacy = DB.localLegacyData();
        if (legacy) offerLegacyUpload(legacy);
        else showWelcome();
    }
}

boot();

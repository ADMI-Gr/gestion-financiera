# Gestión Financiera · ADMI

App web para llevar el control de gastos: cuentas, tarjetas, movimientos, compromisos (pagos mensuales y deudas), presupuestos y reportes.

Forma parte de las apps de **ADMI**: se entra con una cuenta ADMI, la misma para todas las apps.

- Frontend estático (HTML, CSS y JavaScript) publicado con GitHub Pages.
- Datos en Supabase, proyecto compartido **ADMI Apps**, esquema `finanzas`. Cada usuario ve solo sus datos (RLS).
- Para usar la app hace falta tener acceso a `finanzas` en `public.app_access`; lo otorga el administrador.
- Respaldo con los botones **Exportar** / **Importar** (archivo `.json`). Importar reemplaza los datos de la cuenta.

## Uso

Publicada en: https://admi-gr.github.io/gestion-financiera/

Para desarrollarla localmente, sirve la carpeta con cualquier servidor estático en `http://localhost:3000` (la URL que Supabase tiene autorizada para el login).

## Estructura

- `js/config.js`: URL y clave pública de Supabase, y slug/esquema de la app.
- `js/auth.js`: inicio de sesión, registro y control de acceso.
- `js/db.js`: carga los datos en memoria y guarda cada cambio en la nube.
- `js/domain.js`, `js/derive.js`, `js/views/`: reglas del negocio y pantallas.

# Reevaluación — Gestión Financiera

Análisis de arquitectura y propuesta de rediseño.
Fecha: 2026-07-26 · Base analizada: `app.js` (2518 líneas), `index.html`, `styles.css`

> **Estado: IMPLEMENTADO** (2026-07-27). Las fases 0 a 4 están aplicadas y verificadas
> en el navegador con los datos reales. El `app.js` original quedó archivado como
> `app.v1.js.bak`; el código vive ahora en `js/`. Ver [§6 Qué se implementó](#6-qué-se-implementó).

---

## 1. Diagnóstico: el problema raíz

**No existe un libro mayor único.** La app guarda 7 colecciones paralelas
(`transactions`, `accounts`, `cards`, `debts`, `budgets`, `recurringPayments`, `transfers`)
y cada módulo decidió por su cuenta si "mover dinero" deja rastro o no.

El resultado es que **cada pantalla calcula la verdad de una fuente distinta**, y por eso
la app se siente desordenada: no es un problema de diseño visual ni de features faltantes,
es que los módulos no comparten un concepto común de "movimiento de dinero".

Esta tabla es el diagnóstico completo en una imagen:

| Acción del usuario | ¿Crea transacción? | ¿Ajusta saldo de cuenta? | ¿Aparece en Gastos del Mes, Presupuestos y Reportes? |
|---|---|---|---|
| Transacción manual | Sí | Sí | **Sí** |
| Pagar un pago mensual | Sí | Sí | **Sí** |
| Pagar una deuda | **No** | Sí | **No** |
| Comprar con tarjeta | **No** | **No** | **No** |
| Pagar la tarjeta | **No** | Sí | **No** |
| Transferir entre cuentas | **No** | Sí | **No** |

Solo **una** de las seis acciones que mueven dinero (el pago mensual recurrente) está
correctamente integrada. Las otras cinco son islas.

Referencias: `DB.addCardPurchase` (app.js:241), `DB.addCardPayment` (app.js:258),
`DB.addDebtPayment` (app.js:104), `DB.transfer` (app.js:268) — ninguna escribe en
`transactions`. Solo `DB.markRecurringPaid` (app.js:164) lo hace.

---

## 2. Síntomas verificados en la app

No son hipótesis; los comprobé ejecutando la app con tus datos actuales.

### 2.1 Dos "Balance Total" que nunca van a coincidir

- Dashboard → **-$16.00** (suma de transacciones, `app.js:554`)
- Cuentas → **$404.00** (suma de saldos de cuentas, `app.js:731`)
- **Diferencia: $420.00**

Mismo nombre, mismo icono de billetera, dos números irreconciliables. Nunca van a cuadrar
porque las cuentas arrancan con saldo inicial y porque deudas/tarjetas/transferencias
mueven saldos sin dejar transacción.

### 2.2 El botón "Pagar" del Dashboard no refresca el Dashboard

`quickPayRecurring` (app.js:2016) abre el formulario de pago, y al confirmar,
`showPayRecurringForm` llama a `renderRecurring()` (app.js:2275) — que pinta la vista
*Pagos Mensuales*, no el Dashboard. Verificado: pagar desde el Dashboard deja la lista
de pendientes intacta (7 antes, 7 después). Parece que el botón no funcionó.

Es un caso particular de un problema general: **cada acción re-renderiza solo su propia
vista**, aunque haya modificado datos de otras. No hay un refresco global.

### 2.3 La tarjeta pide 6 datos que después ignora

El formulario de tarjeta (`app.js:1567`) captura `heldBalance`, `overdraft`, `minPayment`,
`cashPayment`, `availableBalance` y `balanceDue`. Pero `getCardTotals` (app.js:1393)
recalcula todo desde `purchases` y `payments`:

```js
available = creditLimit - (comprado - pagado)
```

`heldBalance` y `overdraft` **no entran en el cálculo del disponible** (deberían: el saldo
retenido reduce lo que puedes gastar). `availableBalance` y `balanceDue` no se leen nunca.
`interestRate` se muestra pero no se aplica a nada. Solo `minPayment` tiene un uso menor:
prellenar el monto sugerido de pago (app.js:1717).

### 2.4 Tres módulos modelan el mismo concepto

En tus datos reales coexisten:
- Deuda **"Tarjeta"** de $20 (colección `debts`)
- Tarjeta **"VISA TARJETA JOVEN"** (colección `cards`)
- Pago mensual **"Prestamo"** de $80 (colección `recurringPayments`)

Los tres son lo mismo: *algo que debo y que pago periódicamente*. Pero cada uno tiene su
propia pantalla, su propio formulario, su propio cálculo de "próximo pago"
(`getNextPaymentDate` en app.js:396 para deudas, `getPaymentCountdown` en app.js:407 para
recurrentes) y su propio estado. Ni las deudas con cuotas ni las tarjetas aparecen en
"Pagos Pendientes del Mes" (app.js:1976), que solo lee `recurringPayments`.

Detalle revelador: `RECURRING_CATEGORIES` ya incluye una categoría `credit_card`
(app.js:354). La intención de conectar la tarjeta a los pagos mensuales existía; nunca se
implementó.

### 2.5 Problemas menores pero reales

| # | Problema | Ubicación |
|---|---|---|
| a | Editar una cuenta **sobrescribe** el saldo a mano, sin dejar registro de ajuste | app.js:842 |
| b | Borrar una cuenta deja transacciones huérfanas y no revierte su impacto | app.js:211 |
| c | Un pago recurrente no guarda el `id` de la transacción que creó → borrar la transacción deja el mes marcado como pagado | app.js:173 |
| d | No se puede "desmarcar" un pago mensual hecho por error | — |
| e | Dashboard y Pagos Mensuales están fijos al mes actual; no hay navegación de meses (Presupuestos y Reportes sí la tienen) | app.js:550, 2022 |
| f | Reportes solo conoce transacciones: no reporta deudas, tarjetas ni presupuestos | app.js:2343 |
| g | Chart.js, FontAwesome y Google Fonts vienen de CDN → la app no funciona sin internet | index.html:8-10 |
| h | `DB._load()` parsea el JSON completo en **cada** acceso a propiedad; `renderDashboard` lo hace decenas de veces | app.js:8 |
| i | Los textos del usuario se interpolan crudos en `innerHTML`; un `<` en una nota rompe el layout | transversal |
| j | Tus datos personales están hardcodeados como `INITIAL_DATA` en el código fuente | app.js:2 |

---

## 3. Tu ejemplo: la tarjeta en los gastos mensuales

Dijiste: *"la tarjeta no se muestra en los gastos mensuales, debería mostrarse y
desaparecer cuando termina de pagarse todo"*. Tienes razón, y detrás hay una decisión
contable que hay que tomar **antes** de programar nada, porque si se hace mal se cuenta el
gasto dos veces.

### La decisión: ¿cuándo es gasto una compra con tarjeta?

**Opción A — la compra es el gasto** *(recomendada)*
- Compras $200 en el super con la tarjeta → gasto de $200, categoría Alimentación, hoy.
- Pagas $200 a la tarjeta → **no es gasto**, es una transferencia (cuenta → tarjeta).
- ✅ El gasto cae en el mes y la categoría correctos. Los presupuestos funcionan.
- ⚠️ "Gastos del Mes" sube al comprar, aunque todavía no hayas desembolsado el dinero.

**Opción B — el pago a la tarjeta es el gasto**
- ✅ Refleja la plata que efectivamente salió de tu bolsillo.
- ❌ Pierdes la categoría: un pago de $200 a la tarjeta cubre comida, ropa y gasolina a la
  vez, y no hay forma de repartirlo.
- ❌ El gasto cae en el mes equivocado. Los presupuestos dejan de servir.

**Recomiendo la Opción A.** Es lo que hacen las apps serias del rubro, y es la única que
mantiene los presupuestos y los reportes por categoría con sentido.

### Y entonces, ¿cómo "se muestra y desaparece" la tarjeta?

La tarjeta no aparece en *Gastos del Mes* como una línea propia — aparecen sus **compras**,
ya categorizadas. Lo que aparece en **Pagos Pendientes del Mes** es la **obligación de pago**
de la tarjeta:

```
┌──────────────────────────────────────────────────────────┐
│ 💳 VISA TARJETA JOVEN          Vence en 9 días           │
│    Saldo $180.00 · Pago mínimo $25.00                    │
│                                          [ Pagar ]       │
└──────────────────────────────────────────────────────────┘
```

- **Aparece** en cuanto el saldo de la tarjeta es mayor que $0.
- El monto es **variable** (saldo actual o pago mínimo), a diferencia de Netflix que es fijo.
- La fecha sale de `paymentDate` / `cutoffDay`, que ya están capturados.
- **Desaparece sola** cuando `saldo == 0`. Sin marcarla como pagada a mano, sin borrarla:
  es una condición derivada del saldo, no un estado guardado.

Exactamente el comportamiento que describiste. Y el mismo mecanismo sirve para las deudas
con cuotas: aparecen cada mes y desaparecen al pagar la última cuota.

---

## 4. La reevaluación: modelo propuesto

Tres cambios estructurales. Nada de features nuevas: se trata de que lo que ya existe
comparta una sola verdad.

### 4.1 Un solo libro mayor

**Toda** acción que mueva dinero escribe en `transactions`. Ningún módulo mueve saldos por
su cuenta. Se agrega a cada transacción el origen que la generó:

```js
{
  id, type, category, description, amount, date, accountId,
  source: { kind: 'card' | 'debt' | 'recurring' | 'transfer' | 'manual', id: '...' }
}
```

Y se agrega un tercer tipo de movimiento además de `income` / `expense`:

- **`transfer`** — mueve dinero entre cuentas (o hacia una tarjeta). **No cuenta como gasto**
  en Dashboard, Presupuestos ni Reportes.

Con eso:
- Borrar una tarjeta, deuda o pago recurrente puede limpiar o desvincular sus transacciones.
- Se puede "deshacer" un pago: se borra la transacción y el origen se recalcula.
- Los reportes cubren *todo* el dinero, no solo lo que se escribió a mano.

### 4.2 La tarjeta es una cuenta de crédito

Hoy `accounts` y `cards` son dos mundos. Deberían ser uno: una tarjeta de crédito es una
cuenta con saldo negativo y un límite.

```js
{ id, name, kind: 'credit', creditLimit, heldBalance, cutoffDay, paymentDay, interestRate }
```

Esto hace que "pagar la tarjeta" sea, sin código especial, **una transferencia de la
cuenta X a la cuenta tarjeta**. Y que una compra con tarjeta sea un gasto normal con
`accountId` = la tarjeta. El saldo de la tarjeta deja de ser un campo aparte y pasa a ser
lo que ya es: la suma de sus movimientos.

Y de paso se corrige el cálculo del disponible, que hoy ignora dos campos que sí pediste:

```js
disponible = creditLimit + overdraft - deuda - heldBalance
```

### 4.3 "Compromisos": deudas + tarjetas + pagos mensuales, una sola vista

Los tres son lo mismo con parámetros distintos. Un solo módulo, tres modos:

| Modo | Monto | Termina cuando | Ejemplo tuyo |
|---|---|---|---|
| **Fijo** | fijo | nunca | Renta $80, Internet $35, PS5 Plus $16 |
| **Cuotas** | fijo | se paga la cuota N | Préstamo $80 × 12 |
| **Revolvente** | variable (saldo o mínimo) | el saldo llega a $0 | VISA TARJETA JOVEN |

Los tres alimentan **la misma** lista de "Pagos Pendientes del Mes", con el mismo contador
de días (`getPaymentCountdown` ya sirve para los tres) y el mismo botón Pagar. Las tres
pantallas actuales (Deudas, Tarjetas, Pagos Mensuales) se pueden mantener como *filtros*
de la misma vista, o fusionarse. La tarjeta conserva su pantalla propia por lo visual
(el diseño de tarjeta está bien logrado), pero **el compromiso de pago vive en un solo lugar**.

### 4.4 Saldos derivados y un solo refresco

- **Saldos derivados**: `saldo = saldoInicial + Σ movimientos`. Deja de existir el campo
  `balance` mutable que hoy cualquier módulo puede desincronizar. Editar una cuenta ya no
  sobrescribe el saldo: crea un movimiento de **ajuste** visible en el historial.
- **Un solo Balance Total**, calculado igual en Dashboard y en Cuentas. Se acabó el
  -$16 vs $404.
- **`refreshAll()`**: cualquier acción que modifique datos re-renderiza la vista activa,
  sea cual sea. Se acaba el botón "Pagar" que no hace nada visible.

---

## 5. Plan por fases

Ordenado por relación beneficio/riesgo. Cada fase deja la app funcionando.

### Fase 0 — Parches inmediatos (bajo riesgo, ~1 sesión)
1. `refreshAll()` global → arregla el botón Pagar del Dashboard y todos sus hermanos.
2. Unificar el cálculo de "Balance Total" entre Dashboard y Cuentas.
3. Incluir `heldBalance` y `overdraft` en el disponible de la tarjeta.
4. Descargar Chart.js y FontAwesome localmente → la app funciona sin internet.
5. Sacar `INITIAL_DATA` del código fuente (arrancar vacío + importar respaldo).

### Fase 1 — El libro mayor único (el cambio de fondo)
6. Agregar `source` y el tipo `transfer` a las transacciones.
7. Migración de datos existentes (una sola vez, al cargar).
8. Que compras de tarjeta, pagos de tarjeta, pagos de deuda y transferencias escriban en
   `transactions`.
9. Que Dashboard, Presupuestos y Reportes excluyan `transfer` de los gastos.

**Resultado: tu ejemplo queda resuelto.** Las compras con tarjeta entran a Gastos del Mes,
a los presupuestos y a los reportes, con su categoría.

### Fase 2 — Compromisos unificados
10. Módulo único de compromisos con los tres modos.
11. Tarjetas y deudas con cuotas entran a "Pagos Pendientes del Mes".
12. La tarjeta desaparece de pendientes cuando su saldo llega a $0.

### Fase 3 — Consistencia y robustez
13. Saldos derivados + movimiento de ajuste al editar cuentas.
14. Deshacer un pago recurrente; borrado en cascada coherente.
15. Navegación de meses en Dashboard y Pagos Mensuales.
16. Escapado de HTML en los textos del usuario.
17. Cachear `DB._load()` en memoria (una lectura, no cincuenta).

### Fase 4 — Opcional
18. Reportes que incluyan deudas, tarjetas y cumplimiento de presupuestos.
19. Partir `app.js` (2518 líneas) en módulos ES: `db.js`, `views/`, `components/`.
20. Aplicar `interestRate` para proyectar el costo real de la deuda.

---

## 6. Qué se implementó

### Estructura de archivos

```
index.html          carga todo en orden; sin CDN
styles.css          + ~250 líneas de componentes nuevos
vendor/             Chart.js, FontAwesome e Inter locales (727 KB)
js/
  domain.js         constantes y funciones puras (sin DOM, sin storage)
  db.js             almacenamiento, esquema v2 y migración v1→v2
  derive.js         todo lo que antes era campo mutable: saldos, deuda, estado
  ui.js             modal, toast, gráficas, navegación, refreshAll, mes activo
  views/            dashboard · accounts · cards · transactions
                    commitments · budgets · reports
  main.js           respaldo, primera ejecución, arranque
app.v1.js.bak       el archivo original de 2518 líneas, por si acaso
```

### Modelo de datos v2

Cuatro colecciones en vez de siete: `accounts`, `transactions`, `commitments`, `budgets`.

- **Un solo libro mayor.** Cuatro tipos de movimiento: `income`, `expense`,
  `transfer` y `adjustment`. Los dos últimos afectan saldos pero **no** cuentan
  como ingreso ni gasto en Dashboard, Presupuestos ni Reportes.
- **`source: { kind, id }`** en cada movimiento: `manual`, `commitment` o `adjustment`.
- **La tarjeta es una cuenta** de tipo `credit`, con saldo negativo = deuda.
  Comprar con ella es un gasto categorizado; pagarla es una transferencia.
- **Los pagos de un compromiso no se guardan aparte**: son las transacciones que
  apuntan a él. Borrar la transacción deshace el pago; no hay nada que desincronizar.
- **Saldos derivados**: `saldo = saldo inicial + Σ movimientos`. Nadie escribe un
  `balance` a mano. Editar el saldo de una cuenta genera un movimiento de **ajuste** visible.

### Migración

Automática al abrir la app. Antes de tocar nada guarda el original en
`localStorage['finanzas_data_v1_backup']`. El `openingBalance` de cada cuenta se
calcula hacia atrás para que **el saldo mostrado no cambie ni un centavo**.

Verificado con los datos reales: Cartera $0 · Tarjeta $134 · Negocio $20 ·
Bitcoins $250 — idénticos a antes. Los 7 pagos mensuales, la deuda y la tarjeta
pasaron a ser 9 compromisos (7 fijos, 1 deuda, 1 tarjeta).

### Verificación del caso que motivó todo

| Paso | Gastos del mes | Deuda tarjeta | Disponible | ¿En pendientes? |
|---|---|---|---|---|
| Inicio | $0 | $0 | $650 | No |
| Compra $200 con la tarjeta | **$200** | $200 | $450 | **Sí** |
| Pago mínimo $25 | $200 | $175 | $475 | No (cubierta este mes) |
| Salda los $175 restantes | $200 | **$0** | $650 | **No — desaparece sola** |

El gasto se cuenta **una sola vez**, al comprar. El pago no lo vuelve a contar.

### Otras comprobaciones

- Balance Total: **$404 en Dashboard y en Cuentas** (antes −$16 vs $404).
- Botón "Pagar" del Dashboard: la lista pasa de 8 a 7 pendientes al confirmar.
- Cero peticiones a internet: la app carga completa desde `localhost`.
- Las 7 vistas y los 16 formularios se abren sin errores de consola.
- Sin `NaN`, `Infinity` ni `undefined` en el HTML de ninguna vista.

### Decisiones que conviene conocer

- **Nomenclatura**: "Transacciones" → **Movimientos**; "Deudas" + "Pagos Mensuales"
  → **Compromisos** (con filtros Fijos / Deudas / Tarjetas). La navegación pasó de 8 a 7 entradas.
- **Campos retirados** de la tarjeta por ser derivables o no usarse:
  `availableBalance`, `balanceDue` y `cashPayment`. `heldBalance` y `overdraft` se
  conservaron y **ahora sí** afectan el disponible.
- **La app arranca vacía.** Los datos de ejemplo ya no están horneados en el código;
  la primera vez aparece una bienvenida que guía a crear la primera cuenta.
- **Pagos parciales**: pagar $25 de una cuota de $80 deja $55 pendientes ese mes,
  en vez de marcar el mes como pagado (que era el comportamiento anterior).

---

## 7. Resumen en una frase

La app no está mal construida — cada módulo por separado funciona. El problema es que
**seis acciones distintas mueven dinero y solo una deja rastro en el libro contable**.
Todo lo demás (la tarjeta invisible en los gastos, los dos balances distintos, el botón
que no refresca, las tres pantallas que modelan lo mismo) son consecuencias de eso.
Arreglar el libro mayor arregla la mayoría de los síntomas de una sola vez.

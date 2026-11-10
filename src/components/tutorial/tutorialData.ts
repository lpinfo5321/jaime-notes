/**
 * Contenido de los tutoriales (Centro de tutoriales).
 *
 * Cada paso puede:
 *  - solo explicar (sin `do`): se avanza con "Siguiente".
 *  - `do: "click"`: espera a que el usuario toque la parte iluminada.
 *  - `do: "type"` / `"choose"`: espera a que el usuario escriba / elija algo en ese campo.
 *  - `do: "wait"`: espera a que aparezca (`until`) o desaparezca (`untilGone`) algo.
 * `frame: true` = la parte está dentro del editor del reporte (iframe).
 */

export type Target = {
  css: string;
  /** Solo elementos cuyo texto contiene esto (sin importar mayúsculas). */
  text?: string;
  /** Dentro del reporte (iframe). */
  frame?: boolean;
  /** Buscar `css` dentro de este contenedor (por ejemplo, la tarjeta de PRACTICA). */
  within?: { css: string; text?: string };
};

export type Step = {
  icon?: string;
  title: string;
  body: string;
  /** Qué hacer (texto corto en verde). */
  hint?: string;
  target?: Target | Target[];
  do?: "click" | "type" | "choose" | "wait";
  /** Avanza cuando esto aparece (después del clic, o solo esperando). */
  until?: Target | Target[];
  /** Avanza cuando esto desaparece. */
  untilGone?: Target | Target[];
  /** Si la parte no está en pantalla, se salta el paso. */
  optional?: boolean;
  /** Para "type": mínimo de letras. */
  minLen?: number;
};

export type Tutorial = {
  id: string;
  category: string;
  icon: string;
  title: string;
  desc: string;
  minutes: number;
  /** Crea datos de práctica que se borran solos al terminar (nunca llegan al Excel ni a OneDrive). */
  practice?: boolean;
  steps: Step[];
};

export const CATEGORIES = [
  { id: "start", title: "Para empezar", desc: "Conoce la app y muévete por ella" },
  { id: "reports", title: "Reportes de cheques", desc: "Crear, llenar, cobrar y completar" },
  { id: "follow", title: "Seguimiento", desc: "Notas y contactos de cada compañía" },
  { id: "files", title: "PDF, Registro y archivos", desc: "OneDrive, el Excel y los documentos" },
  { id: "more", title: "Más", desc: "Papelera, selección y celular" },
];

/* ───────── piezas que se repiten ───────── */

const FIELD = (f: string): Target => ({ css: `tr:has([data-field="${f}"])`, frame: true });
const REPORT_MODAL: Target = { css: '[data-tour="report-modal"]' };
const NEW_BTN: Target[] = [{ css: ".kn-fab" }, { css: '[data-hd="plus"]' }];
const PRACTICE_CARD: Target = { css: ".kg .kc", text: "PRACTICA" };

const PRACTICE_INTRO: Step = {
  icon: "🧪",
  title: "Esto es una práctica",
  body: "Vas a crear un reporte de prueba llamado PRACTICA. Al terminar el tutorial se borra solo y nunca llega al Excel ni a OneDrive. ¡Equivócate sin miedo!",
};

const CREATE_PRACTICE: Step[] = [
  {
    icon: "➕",
    title: "Toca el botón +",
    body: "Con este botón empiezas un reporte nuevo cada vez que llega un cheque devuelto.",
    hint: "Toca el botón + iluminado",
    target: NEW_BTN,
    do: "click",
    until: { css: '[data-tour="new-company-input"]' },
  },
  {
    icon: "🏢",
    title: "Nombre de la compañía",
    body: "Aquí va la compañía que hizo el cheque. Mientras escribes, la app te avisa si esa compañía ya existe para que no se duplique.",
    hint: "Escribe: PRACTICA",
    target: { css: '[data-tour="new-company-input"]' },
    do: "type",
    minLen: 3,
  },
  {
    icon: "✅",
    title: "Crea el reporte",
    body: "Si la compañía ya existe, el botón dice “Agregar reporte a esta compañía” y el cheque se guarda dentro de ella, junto a los demás.",
    hint: "Toca el botón para crear",
    target: { css: '[data-tour="new-company-create"]' },
    do: "click",
    until: FIELD("dateCashed"),
  },
];

const CLOSE_REPORT: Step[] = [
  {
    icon: "💾",
    title: "Se guarda solo",
    body: "No hay botón de guardar: todo lo que escribes se guarda solo, aunque se vaya el internet (se sube cuando regresa).",
    target: { css: '[data-tour="report-close"]' },
  },
  {
    icon: "✖️",
    title: "Cierra el reporte",
    body: "Cuando termines, cierra el reporte con este botón.",
    hint: "Toca Cerrar",
    target: { css: '[data-tour="report-close"]' },
    do: "click",
  },
  {
    icon: "💾",
    title: "Guarda los cambios",
    body: "Si la app te pregunta, elige “Guardar y cerrar”.",
    hint: "Toca Guardar y cerrar",
    target: { css: "button", text: "Guardar y cerrar" },
    do: "click",
    optional: true,
    untilGone: REPORT_MODAL,
  },
  {
    title: "Cerrando…",
    body: "Un momento.",
    do: "wait",
    untilGone: REPORT_MODAL,
  },
];

/* ───────── tutoriales ───────── */

export const TUTORIALS: Tutorial[] = [
  {
    id: "tour",
    category: "start",
    icon: "🧭",
    title: "Recorrido de la app",
    desc: "Qué es cada parte de la pantalla principal y cómo moverte.",
    minutes: 2,
    steps: [
      {
        icon: "👋",
        title: "Bienvenido a Return Checks",
        body: "Aquí se lleva el control de los cheques devueltos (NSF) de La Primavera: quién debe, cuánto y qué se ha hecho para cobrar.",
      },
      {
        target: { css: ".kroot .kh" },
        optional: true,
        icon: "📊",
        title: "El resumen",
        body: "Cuánto se debe en total (cheque + comisión), cuántos cheques faltan por cobrar y cuántas compañías hay. La cinta de abajo pasa por cada compañía con su total.",
      },
      {
        target: { css: ".kg .kc .kf" },
        optional: true,
        icon: "🗂️",
        title: "Cada tarjeta es una compañía",
        body: "Detrás de la tarjeta están sus cheques (las hojitas), y abajo el total que debe con comisiones y cuántos cheques tiene pendientes.",
      },
      {
        target: [{ css: ".kg .kc .kn" }, { css: ".kg .kc .sn" }],
        optional: true,
        icon: "📝",
        title: "La libreta de notas",
        body: "Aquí se ve la última nota de seguimiento: llamadas, promesas de pago, abonos. El número rojo dice cuántas notas tiene.",
      },
      {
        target: [{ css: ".kn-bar" }],
        optional: true,
        icon: "📁",
        title: "Las pestañas",
        body: "Pendientes: lo que falta cobrar. Completados: lo ya cobrado. Papelera: lo borrado (se puede restaurar). Contactos: teléfonos de las compañías.",
      },
      {
        target: { css: ".kn-bar button", text: "Completados" },
        optional: true,
        icon: "👆",
        title: "Prueba: abre Completados",
        body: "Toca la pestaña para ver los cheques que ya se cobraron.",
        hint: "Toca Completados",
        do: "click",
      },
      {
        target: { css: ".kn-bar button", text: "Pendientes" },
        optional: true,
        icon: "👆",
        title: "Regresa a Pendientes",
        body: "Así cambias de pestaña cuando quieras. El numerito de cada una dice cuántos hay.",
        hint: "Toca Pendientes",
        do: "click",
      },
      {
        target: NEW_BTN,
        icon: "➕",
        title: "Nuevo reporte",
        body: "El botón + sirve para registrar un cheque devuelto nuevo. Lo practicas en el tutorial “Crear un reporte”.",
      },
      {
        target: { css: '[data-hd="search"]' },
        optional: true,
        icon: "🔎",
        title: "Buscar",
        body: "Busca por compañía, cliente o teléfono. Tiene su propio tutorial.",
      },
      {
        target: { css: '[data-hd="nav"]' },
        optional: true,
        icon: "🧭",
        title: "Las secciones",
        body: "Inicio te regresa aquí desde cualquier lugar. Contactos, Docs y Registro (el Excel de todos los cheques) tienen sus propios tutoriales.",
      },
      {
        target: { css: '[data-hd="help"]' },
        optional: true,
        icon: "🎓",
        title: "Los tutoriales",
        body: "Con este botón regresas al Centro de tutoriales cuando quieras.",
      },
      {
        target: { css: '[data-hd="menu"]' },
        optional: true,
        icon: "⚙️",
        title: "El menú",
        body: "Modo oscuro, herramientas y cerrar sesión.",
      },
      {
        icon: "🎉",
        title: "¡Listo!",
        body: "Ya conoces la pantalla principal. Sigue con “Crear un reporte” para aprender a registrar un cheque.",
      },
    ],
  },

  {
    id: "search",
    category: "start",
    icon: "🔎",
    title: "Buscar y filtrar",
    desc: "Encontrar una compañía, un cliente o los cheques de un estado de pago.",
    minutes: 1,
    steps: [
      {
        target: { css: '[data-hd="search"] input' },
        icon: "🔎",
        title: "Escribe para buscar",
        body: "Puedes escribir parte del nombre de la compañía, el nombre del cliente o un teléfono. La lista se filtra mientras escribes.",
        hint: "Escribe algo, por ejemplo una letra de una compañía",
        do: "type",
        minLen: 1,
      },
      {
        target: { css: ".kroot" },
        optional: true,
        icon: "👀",
        title: "Los resultados",
        body: "Solo quedan las compañías que coinciden.",
      },
      {
        target: { css: '[data-hd="search"] button', text: "PAY" },
        icon: "👤",
        title: "Buscar por PAY",
        body: "PAY busca por quien hizo o cobró el cheque (Maker / Payee).",
        hint: "Toca PAY",
        do: "click",
      },
      {
        target: { css: '[data-hd="search"] button', text: "Status" },
        icon: "🚦",
        title: "Filtrar por estado",
        body: "Status muestra solo los cheques con cierto estado de pago.",
        hint: "Toca Status",
        do: "click",
      },
      {
        target: { css: '[data-hd="search"] select' },
        icon: "📋",
        title: "Elige un estado",
        body: "Pending = sin pagar. Paid Cash / Paid Check = pagado en efectivo o cheque. Redeposited = se volvió a depositar.",
        hint: "Elige un estado de la lista",
        do: "choose",
      },
      {
        target: { css: '[data-hd="search"] button', text: "Compañía" },
        icon: "↩️",
        title: "Regresa a Compañía",
        body: "Así vuelves a la búsqueda normal.",
        hint: "Toca Compañía",
        do: "click",
      },
      {
        target: { css: '[data-hd="search"] input' },
        icon: "🧹",
        title: "Para ver todo otra vez",
        body: "Borra lo que escribiste en la búsqueda y aparecen todas las compañías.",
      },
    ],
  },

  {
    id: "create",
    category: "reports",
    icon: "📝",
    title: "Crear un reporte",
    desc: "Registra un cheque devuelto llenando el reporte campo por campo.",
    minutes: 4,
    practice: true,
    steps: [
      PRACTICE_INTRO,
      ...CREATE_PRACTICE,
      {
        target: { css: ".companyBlock", frame: true },
        icon: "📄",
        title: "Este es el reporte",
        body: "Arriba está la compañía y la fecha de la última modificación. Vamos a llenarlo de arriba hacia abajo.",
      },
      {
        target: FIELD("dateCashed"),
        icon: "📅",
        title: "Date cashed",
        body: "La fecha en que el cliente cambió el cheque en la tienda. Formato MM/DD/YY (ej. 11/08/26), o toca el ícono del calendario y elige el día. Cualquiera de las dos sirve.",
        hint: "Escribe o elige una fecha",
        do: "type",
      },
      {
        target: FIELD("dateDeposit"),
        icon: "🏦",
        title: "Date of deposit",
        body: "La fecha en que se depositó el cheque en el banco.",
        hint: "Escribe una fecha",
        do: "type",
      },
      {
        target: FIELD("dateReturned"),
        icon: "↩️",
        title: "Date returned",
        body: "La fecha en que el banco lo devolvió (viene en la carta o aviso del banco).",
        hint: "Escribe una fecha",
        do: "type",
      },
      {
        target: FIELD("payee"),
        icon: "🙋",
        title: "Payee",
        body: "El nombre de la persona que cambió el cheque en la tienda (a quien se le pagó).",
        hint: "Escribe un nombre",
        do: "type",
      },
      {
        target: FIELD("checkNumber"),
        icon: "#️⃣",
        title: "Check number",
        body: "El número del cheque. Con este número se encuentra en el Registro (Excel).",
        hint: "Escribe un número, ej. 1234",
        do: "type",
      },
      {
        target: FIELD("makerPayor"),
        icon: "🏢",
        title: "Maker / Payor",
        body: "La compañía que hizo el cheque. Se llena sola con el nombre de la compañía.",
      },
      {
        target: FIELD("rejectReason"),
        icon: "🚫",
        title: "Reject reason",
        body: "Por qué lo devolvió el banco: NSF (sin fondos), Stop Payment, Account Closed… Si falta un motivo, en la lista está “Editar lista” para agregarlo.",
        hint: "Elige un motivo",
        do: "choose",
      },
      {
        target: FIELD("customerContact"),
        icon: "📞",
        title: "Customer contact",
        body: "El teléfono del cliente (el payee).",
        hint: "Escribe un teléfono",
        do: "type",
      },
      {
        target: FIELD("companyContact"),
        icon: "👥",
        title: "Company contact",
        body: "La persona de contacto de la compañía. Con el botón 👥 eliges uno de tus contactos guardados; si el nombre coincide, la app te lo sugiere sola.",
      },
      {
        target: FIELD("checkAmount"),
        icon: "💵",
        title: "Check amount",
        body: "El monto del cheque. Escribe solo el número, ej. 120.50.",
        hint: "Escribe un monto",
        do: "type",
      },
      {
        target: FIELD("returnedFee"),
        icon: "🧮",
        title: "Returned check fee (se calcula sola)",
        body: "Es el cargo por cheque devuelto. No lo escribes: la app lo calcula en cuanto pones el Check Amount, según el monto del cheque:\n• Hasta $50 → $25\n• De $50.01 a $300 → $30\n• De $300.01 a $800 → $40\n• Más de $800 → 5% del cheque (ej. $1,000 → $50)\nSi cambias el monto, la comisión y el Total due se actualizan solos.",
      },
      {
        target: FIELD("totalDue"),
        icon: "💰",
        title: "Total due",
        body: "Cheque + comisión: lo que el cliente tiene que pagar. Es el total rojo que ves en la tarjeta de la compañía.",
      },
      {
        target: { css: ".moneyRow > table:last-child", frame: true },
        icon: "💳",
        title: "Los pagos",
        body: "Aquí se anota cuándo y cómo pagó el cliente la comisión y el cheque. Lo practicas en “Registrar un pago y completar”.",
      },
      {
        target: { css: "#btnAddImages", frame: true },
        icon: "📸",
        title: "Fotos y documentos",
        body: "Con este botón agregas fotos del cheque, la ID del cliente, la carta del banco o PDFs. Aparecen al final del reporte y salen en el PDF. El de al lado sirve para ordenarlas.",
      },
      {
        target: { css: '[data-tour="report-export"]' },
        icon: "✅",
        title: "Terminar reporte",
        body: "Este es el botón verde que termina todo. En un reporte nuevo dice “Terminar reporte”: guarda el PDF en OneDrive, guarda el reporte y lo cierra, todo de una vez (si falta la compañía o el número de cheque, te avisa). Si el reporte ya existía dice “Exportar”. El botón “Cerrar” solo cierra: guarda lo escrito, pero NO manda el PDF a OneDrive. En esta práctica no lo toques: cierra con “Cerrar”.",
      },
      ...CLOSE_REPORT,
      {
        icon: "🎉",
        title: "¡Reporte creado!",
        body: "Así se registra un cheque devuelto. Como era práctica, el reporte PRACTICA se borra ahora solo.",
      },
    ],
  },

  {
    id: "open",
    category: "reports",
    icon: "📂",
    title: "Abrir y editar un reporte",
    desc: "Entrar a una compañía, ver sus cheques y cambiar un reporte.",
    minutes: 2,
    steps: [
      {
        target: { css: ".kg .kc .kf" },
        icon: "👆",
        title: "Abre una compañía",
        body: "Toca cualquier tarjeta para ver todos los cheques de esa compañía.",
        hint: "Toca una tarjeta",
        do: "click",
        until: { css: ".co-detail" },
      },
      {
        target: { css: ".co-folder" },
        icon: "🗂️",
        title: "El expediente",
        body: "El nombre de la compañía (tócalo para cambiarlo en todos sus reportes) y el total que debe con comisiones.",
      },
      {
        target: { css: ".co-note" },
        optional: true,
        icon: "👥",
        title: "Contactos y nuevo reporte",
        body: "Los contactos de esta compañía, y el botón para agregarle otro cheque.",
      },
      {
        target: { css: ".report-grid > *" },
        optional: true,
        icon: "🧾",
        title: "Cada cheque",
        body: "Cada tarjeta es un cheque: total, si está Pending o Paid, y su número. Los tres puntitos tienen más acciones (mover, duplicar, borrar).",
      },
      {
        target: [{ css: ".report-grid .report-shot-foot button" }, { css: ".report-grid button", text: "Abrir reporte" }],
        icon: "✏️",
        title: "Abre el reporte",
        body: "“Editar” abre el reporte para cambiar lo que necesites.",
        hint: "Toca Editar",
        do: "click",
        until: { css: "tr:has([data-field='checkNumber'])", frame: true },
      },
      {
        target: { css: ".paper", frame: true },
        icon: "📝",
        title: "Cambia lo que necesites",
        body: "Toca cualquier campo y escribe. Se guarda solo. Si te equivocas al cerrar, puedes elegir “Descartar cambios” y queda como estaba.",
      },
      {
        target: { css: '[data-tour="report-close"]' },
        icon: "✖️",
        title: "Cierra el reporte",
        body: "Si no cambiaste nada, se cierra directo.",
        hint: "Toca Cerrar",
        do: "click",
      },
      {
        target: { css: "button", text: "Descartar cambios" },
        optional: true,
        icon: "↩️",
        title: "¿Cambiaste algo sin querer?",
        body: "“Descartar cambios” lo deja como estaba. “Guardar y cerrar” guarda lo que cambiaste.",
        hint: "Elige una opción",
        do: "click",
        untilGone: REPORT_MODAL,
      },
      {
        target: { css: ".co-back" },
        icon: "🏠",
        title: "Regresa al dashboard",
        body: "Con este botón vuelves a la pantalla principal.",
        hint: "Toca Dashboard",
        do: "click",
        until: { css: ".kroot" },
      },
      {
        icon: "🎉",
        title: "¡Listo!",
        body: "Ya sabes entrar a una compañía y editar sus reportes.",
      },
    ],
  },

  {
    id: "payment",
    category: "reports",
    icon: "💵",
    title: "Registrar un pago y completar",
    desc: "Anotar cuando el cliente paga la comisión y el cheque, y cerrar el caso.",
    minutes: 3,
    practice: true,
    steps: [
      PRACTICE_INTRO,
      ...CREATE_PRACTICE,
      {
        target: FIELD("checkNumber"),
        icon: "#️⃣",
        title: "Número de cheque",
        body: "Primero unos datos básicos.",
        hint: "Escribe un número, ej. 1234",
        do: "type",
      },
      {
        target: FIELD("checkAmount"),
        icon: "💵",
        title: "Monto",
        body: "La comisión y el total se calculan solos.",
        hint: "Escribe un monto, ej. 200",
        do: "type",
      },
      {
        target: FIELD("dateFeePaid"),
        icon: "📅",
        title: "Date fee paid",
        body: "La fecha en que el cliente pagó la comisión (el fee).",
        hint: "Escribe una fecha",
        do: "type",
      },
      {
        target: { css: '.moneyRow > table:last-child tr:has([data-field="feePaymentMethod"])', frame: true },
        icon: "💳",
        title: "¿Cómo pagó la comisión?",
        body: "Paid Cash = efectivo (aparece “Cash Amount” para el monto). Paid Check = con cheque (anota el número). Pending = todavía no paga.",
        hint: "Elige una forma de pago",
        do: "choose",
      },
      {
        target: FIELD("dateCheckPaid"),
        icon: "📅",
        title: "Date check paid",
        body: "La fecha en que el cliente pagó el cheque.",
        hint: "Escribe una fecha",
        do: "type",
      },
      {
        target: { css: '.moneyRow > table:last-child tr:has([data-field="checkPaymentMethod"])', frame: true },
        icon: "💳",
        title: "¿Cómo pagó el cheque?",
        body: "Igual que la comisión. Redeposited = se volvió a depositar y el banco sí lo pagó.",
        hint: "Elige una forma de pago",
        do: "choose",
      },
      {
        target: FIELD("dateCompleted"),
        icon: "🏁",
        title: "Date completed",
        body: "La fecha en que quedó todo pagado.",
        hint: "Escribe una fecha",
        do: "type",
      },
      {
        target: { css: '.bottomRow td:has([data-field="agentCompleted"])', frame: true },
        icon: "🧑‍💼",
        title: "Agent",
        body: "Tu nombre: el agente que cerró el caso. Sale en el Registro.",
        hint: "Escribe tu nombre",
        do: "type",
      },
      ...CLOSE_REPORT,
      {
        target: { css: "button", text: "Sí, mover" },
        optional: true,
        icon: "✅",
        title: "Muévelo a Completados",
        body: "Como ya está pagado, la app pregunta si lo mueves a Completados.",
        hint: "Toca “Sí, mover”",
        do: "click",
      },
      {
        target: { css: ".kn-bar button", text: "Completados" },
        optional: true,
        icon: "📁",
        title: "Míralo en Completados",
        body: "Aquí quedan los casos cobrados. También puedes mover un reporte con los tres puntitos de su tarjeta.",
        hint: "Toca Completados",
        do: "click",
      },
      {
        target: { css: ".kn-bar button", text: "Pendientes" },
        optional: true,
        icon: "↩️",
        title: "Regresa a Pendientes",
        body: "",
        hint: "Toca Pendientes",
        do: "click",
      },
      {
        icon: "🎉",
        title: "¡Caso cerrado!",
        body: "Así se registra un pago y se completa un cheque. El reporte de práctica se borra ahora solo.",
      },
    ],
  },

  {
    id: "notes",
    category: "follow",
    icon: "🗒️",
    title: "Notas de seguimiento",
    desc: "Apuntar cada llamada, promesa de pago o abono de una compañía.",
    minutes: 3,
    practice: true,
    steps: [
      PRACTICE_INTRO,
      ...CREATE_PRACTICE,
      {
        target: FIELD("checkAmount"),
        icon: "💵",
        title: "Pon un monto",
        body: "Con esto el reporte de práctica aparece en la pantalla principal.",
        hint: "Escribe un monto, ej. 80",
        do: "type",
      },
      ...CLOSE_REPORT,
      {
        target: [
          { css: '[data-tour="notes"]', within: PRACTICE_CARD },
          { css: ".kn", within: PRACTICE_CARD },
          { css: ".sn", within: PRACTICE_CARD },
        ],
        icon: "📝",
        title: "Abre la libreta de PRACTICA",
        body: "Cada compañía tiene su libreta de notas. Tócala para ver y agregar notas.",
        hint: "Toca la libreta",
        do: "click",
        until: [{ css: ".nb-textarea" }, { css: ".nb-add" }, { css: ".nb-page" }, { css: ".sn.on" }],
      },
      {
        target: [{ css: ".nb-add" }, { css: "button", text: "+ Nueva" }, { css: ".sn.on button", text: "nota" }],
        optional: true,
        icon: "➕",
        title: "Nueva nota",
        body: "Toca para escribir una nota nueva.",
        hint: "Toca Nueva nota",
        do: "click",
        until: { css: ".nb-textarea" },
      },
      {
        target: { css: ".nb-fields" },
        optional: true,
        icon: "📅",
        title: "Fecha y agente",
        body: "La fecha de hoy y tu nombre ya vienen puestos. Cámbialos si la nota es de otro día o de otra persona.",
      },
      {
        target: { css: ".nb-textarea" },
        icon: "✍️",
        title: "Escribe la nota",
        body: "Por ejemplo: “Llamé, dijo que paga el viernes”, o “Dejó un abono de $100”.",
        hint: "Escribe una nota",
        do: "type",
        minLen: 3,
      },
      {
        target: { css: ".nb-save" },
        icon: "💾",
        title: "Guárdala",
        body: "La nota queda con su fecha y agente, y se ve en la tarjeta de la compañía.",
        hint: "Toca “+ Agregar nota”",
        do: "click",
      },
      {
        target: { css: '[data-tour="notes-close"]' },
        optional: true,
        icon: "✖️",
        title: "Cierra la libreta",
        body: "Las notas quedan guardadas en orden, la más nueva primero. Toca una nota para editarla.",
        hint: "Toca la X",
        do: "click",
      },
      {
        icon: "🎉",
        title: "¡Listo!",
        body: "Apunta una nota cada vez que hables con la compañía: así cualquiera sabe en qué va el caso. La práctica se borra ahora sola.",
      },
    ],
  },

  {
    id: "contacts",
    category: "follow",
    icon: "📇",
    title: "Contactos",
    desc: "Guardar los teléfonos de cada compañía y usarlos en los reportes.",
    minutes: 2,
    steps: [
      {
        target: { css: '[data-hd="nav"] button', text: "Contactos" },
        icon: "👆",
        title: "Abre Contactos",
        body: "Aquí están todos los contactos de las compañías.",
        hint: "Toca Contactos",
        do: "click",
        until: { css: 'input[placeholder="Buscar contacto…"]' },
      },
      {
        target: { css: 'input[placeholder="Buscar contacto…"]' },
        icon: "🔎",
        title: "Buscar un contacto",
        body: "Por nombre, compañía o teléfono.",
      },
      {
        target: { css: '[data-tour="contact-new"]' },
        icon: "➕",
        title: "Nuevo contacto",
        body: "Toca para ver el formulario.",
        hint: "Toca Nuevo",
        do: "click",
        until: { css: 'input[placeholder="Nombre completo"]' },
      },
      {
        target: { css: '[data-tour="contact-form"]' },
        icon: "📝",
        title: "Los datos",
        body: "Nombre, compañía (escríbela igual que en los reportes para que se junten), uno o varios teléfonos, correo y notas.",
      },
      {
        target: { css: '[data-tour="contact-form"] button', text: "Cancelar" },
        icon: "✖️",
        title: "Cierra sin guardar",
        body: "Esta vez no guardamos nada. Cuando sea de verdad, tocas “Agregar”.",
        hint: "Toca Cancelar",
        do: "click",
        untilGone: { css: 'input[placeholder="Nombre completo"]' },
      },
      {
        icon: "💡",
        title: "En el reporte",
        body: "En el campo Company contact del reporte, el botón 👥 te deja elegir uno de estos contactos. Dentro de cada compañía también ves sus contactos y puedes agregar uno.",
      },
      {
        target: { css: '[data-hd="nav"] button', text: "Inicio" },
        icon: "🏠",
        title: "Regresa al inicio",
        body: "",
        hint: "Toca Inicio",
        do: "click",
        until: { css: ".kroot" },
      },
      { icon: "🎉", title: "¡Listo!", body: "Ya sabes manejar los contactos." },
    ],
  },

  {
    id: "export",
    category: "files",
    icon: "📄",
    title: "Guardar el PDF en OneDrive",
    desc: "Dónde están los botones para sacar el PDF y qué hacer si falla.",
    minutes: 2,
    steps: [
      {
        target: { css: ".kg .kc .kf" },
        icon: "👆",
        title: "Abre una compañía",
        body: "Vamos a abrir un reporte para ver sus botones. No se va a cambiar nada.",
        hint: "Toca una tarjeta",
        do: "click",
        until: { css: ".co-detail" },
      },
      {
        target: [{ css: ".report-grid .report-shot-foot button" }, { css: ".report-grid button", text: "Abrir reporte" }],
        icon: "✏️",
        title: "Abre el reporte",
        body: "",
        hint: "Toca Editar",
        do: "click",
        until: { css: '[data-tour="report-export"]' },
      },
      {
        target: { css: '[data-tour="report-export"]' },
        icon: "📤",
        title: "Exportar",
        body: "Guarda el PDF del reporte directo en la carpeta de OneDrive: RETURNED CHECKS › NSF CHECKS PDF FILES › el año. Si ya existe, te avisa y te pregunta si quieres reemplazarlo. En un reporte nuevo este botón dice “Terminar reporte”: exporta, guarda y cierra de una vez.",
      },
      {
        target: { css: '[data-tour="report-newtab"]' },
        optional: true,
        icon: "↗️",
        title: "Abrir en otra pestaña",
        body: "Abre el reporte en una pestaña aparte, más grande.",
      },
      {
        target: { css: "#btnPdf", frame: true },
        optional: true,
        icon: "🗂️",
        title: "Exportar PDF manual",
        body: "Por si falla el botón Exportar: aquí eliges tú la carpeta y el nombre del archivo.",
      },
      {
        icon: "📱",
        title: "Desde el celular",
        body: "También funciona: el PDF se sube a la nube y la computadora de la tienda lo guarda en OneDrive cuando está prendida.",
      },
      {
        icon: "⚠️",
        title: "Si dice “NO se guardó el PDF”",
        body: "Casi siempre es que la computadora de la tienda está apagada o se cambió de nombre la carpeta de la app. Prende la computadora y vuelve a exportar; si sigue, avisa a quien da soporte.",
      },
      {
        target: { css: '[data-tour="report-close"]' },
        icon: "✖️",
        title: "Cierra el reporte",
        body: "",
        hint: "Toca Cerrar",
        do: "click",
      },
      {
        target: { css: "button", text: "Descartar cambios" },
        optional: true,
        icon: "↩️",
        title: "¿Te pregunta algo?",
        body: "Si no querías cambiar nada, toca “Descartar cambios”.",
        hint: "Elige una opción",
        do: "click",
        untilGone: REPORT_MODAL,
      },
      {
        target: { css: ".co-back" },
        icon: "🏠",
        title: "Regresa al dashboard",
        body: "",
        hint: "Toca Dashboard",
        do: "click",
        until: { css: ".kroot" },
      },
      { icon: "🎉", title: "¡Listo!", body: "Ya sabes guardar el PDF de un reporte." },
    ],
  },

  {
    id: "registro",
    category: "files",
    icon: "📊",
    title: "El Registro (Excel)",
    desc: "La lista de todos los cheques, igual que el Excel RETURNED CHECK LOG.",
    minutes: 2,
    steps: [
      {
        target: { css: '[data-hd="nav"] button', text: "Registro" },
        icon: "👆",
        title: "Abre el Registro",
        body: "",
        hint: "Toca Registro",
        do: "click",
        until: { css: '[data-tour="log-search"]' },
      },
      {
        icon: "📊",
        title: "¿Qué es el Registro?",
        body: "Es el Excel RETURNED CHECK LOG que está en OneDrive (RETURNED CHECKS › NSF CK LOGS). Cada reporte nuevo se agrega solo como una fila y se actualiza cuando cambia: pagos, agente y estado. Si lo pasas a Completados dice COMPLETED; si lo regresas a Pendientes, se quita.",
      },
      {
        target: { css: '[data-tour="log-status"]' },
        optional: true,
        icon: "🔄",
        title: "¿Está al día?",
        body: "Aquí dice cuándo se sincronizó. Si el Excel está abierto en la computadora, los cambios esperan a que lo cierres.",
      },
      {
        target: { css: '[data-tour="log-search"]' },
        icon: "🔎",
        title: "Buscar en el Registro",
        body: "Por compañía, número de cheque o agente.",
        hint: "Escribe algo",
        do: "type",
        minLen: 1,
      },
      {
        target: { css: '[data-tour="log-filters"]' },
        optional: true,
        icon: "🎛️",
        title: "Filtros",
        body: "Por estado (pendiente, pago parcial, completado), año y orden. El orden abre en “Últimos agregados” (lo que se hizo hoy sale arriba); también hay “Pagados más recientes” y “Devueltos más recientes”. “Filtros” tiene más: agente, forma de pago, fechas y monto.",
      },
      {
        icon: "🔗",
        title: "Abrir y Quitar",
        body: "“Abrir” lleva al reporte en la app. Si borraste un reporte y su fila la escribió la app, sale “Quitar” para sacarla del Excel (se guarda un respaldo antes).",
      },
      {
        target: { css: "button", text: "Exportar Excel" },
        optional: true,
        icon: "⬇️",
        title: "Exportar Excel",
        body: "Guarda una copia del Registro con la fecha de hoy. En la computadora de la oficina va a la carpeta NSF CK LOGS de OneDrive; en otras, a Descargas.",
      },
      {
        target: { css: '[data-hd="nav"] button', text: "Inicio" },
        icon: "🏠",
        title: "Regresa al inicio",
        body: "",
        hint: "Toca Inicio",
        do: "click",
        until: { css: ".kroot" },
      },
      { icon: "🎉", title: "¡Listo!", body: "Ya sabes usar el Registro." },
    ],
  },

  {
    id: "docs",
    category: "files",
    icon: "📁",
    title: "Documentos (Docs)",
    desc: "Guardar papeles generales que no son de un solo cheque.",
    minutes: 1,
    steps: [
      {
        target: { css: '[data-hd="nav"] button', text: "Docs" },
        icon: "👆",
        title: "Abre Docs",
        body: "",
        hint: "Toca Docs",
        do: "click",
      },
      {
        icon: "📁",
        title: "¿Para qué sirve?",
        body: "Para guardar documentos generales: formatos, cartas modelo, políticas, listas de precios… Las fotos de un cheque en particular van dentro de su reporte.",
      },
      {
        target: { css: '[data-hd="nav"] button', text: "Inicio" },
        icon: "🏠",
        title: "Regresa al inicio",
        body: "",
        hint: "Toca Inicio",
        do: "click",
        until: { css: ".kroot" },
      },
      { icon: "🎉", title: "¡Listo!", body: "" },
    ],
  },

  {
    id: "trash",
    category: "more",
    icon: "🗑️",
    title: "Borrar, Papelera y restaurar",
    desc: "Mover a la papelera, recuperar y eliminar para siempre.",
    minutes: 3,
    practice: true,
    steps: [
      PRACTICE_INTRO,
      ...CREATE_PRACTICE,
      {
        target: FIELD("checkAmount"),
        icon: "💵",
        title: "Pon un monto",
        body: "Para que la práctica aparezca en la pantalla principal.",
        hint: "Escribe un monto, ej. 50",
        do: "type",
      },
      ...CLOSE_REPORT,
      {
        target: { css: ".kf", within: PRACTICE_CARD },
        icon: "👆",
        title: "Abre PRACTICA",
        body: "",
        hint: "Toca la tarjeta PRACTICA",
        do: "click",
        until: { css: ".co-detail" },
      },
      {
        target: { css: ".report-grid .report-shot-more" },
        icon: "⋯",
        title: "Más acciones",
        body: "Los tres puntitos de cada cheque tienen: duplicar, mover a Pendientes / Completados / Papelera.",
        hint: "Toca los tres puntitos",
        do: "click",
        until: { css: "button", text: "Mover a Papelera" },
      },
      {
        target: { css: "button", text: "Mover a Papelera" },
        icon: "🗑️",
        title: "Mover a la Papelera",
        body: "No se borra para siempre: queda en la Papelera. Lo que está en la Papelera no se agrega al Registro (Excel); si ya estaba ahí, la app te pregunta si también lo quitas.",
        hint: "Toca Mover a Papelera",
        do: "click",
      },
      {
        target: { css: ".kn-bar button", text: "Papelera" },
        icon: "🗑️",
        title: "Abre la Papelera",
        body: "",
        hint: "Toca Papelera",
        do: "click",
      },
      {
        target: { css: ".kf", within: PRACTICE_CARD },
        optional: true,
        icon: "👀",
        title: "Aquí está",
        body: "Desde aquí se puede Restaurar (regresa a donde estaba) o Eliminar definitivamente.",
      },
      {
        icon: "⚠️",
        title: "Eliminar definitivamente",
        body: "Eso ya no se puede deshacer. Si el cheque estaba en el Registro (Excel), la app te pregunta si también lo quitas de ahí.",
      },
      {
        target: { css: ".kn-bar button", text: "Pendientes" },
        optional: true,
        icon: "↩️",
        title: "Regresa a Pendientes",
        body: "",
        hint: "Toca Pendientes",
        do: "click",
      },
      {
        icon: "🎉",
        title: "¡Listo!",
        body: "La práctica se borra ahora sola.",
      },
    ],
  },

  {
    id: "select",
    category: "more",
    icon: "☑️",
    title: "Seleccionar varias",
    desc: "Mover o borrar varias compañías a la vez.",
    minutes: 1,
    steps: [
      {
        target: { css: '[data-hd="select"]' },
        icon: "☑️",
        title: "Seleccionar",
        body: "Activa la selección: cada tarjeta muestra un círculo para marcarla.",
        hint: "Toca Seleccionar",
        do: "click",
      },
      {
        icon: "✅",
        title: "Marca las que quieras",
        body: "Toca las tarjetas que quieras. Abajo aparecen los botones para moverlas o borrarlas todas juntas.",
      },
      {
        target: { css: '[data-hd="select"]' },
        icon: "✖️",
        title: "Termina",
        body: "Toca Cancelar para salir de la selección.",
        hint: "Toca Cancelar",
        do: "click",
      },
      { icon: "🎉", title: "¡Listo!", body: "" },
    ],
  },

  {
    id: "phone",
    category: "more",
    icon: "📱",
    title: "Usar la app en el celular",
    desc: "Instalarla como app y qué cambia en el teléfono.",
    minutes: 1,
    steps: [
      {
        icon: "📲",
        title: "Instálala",
        body: "Android (Chrome): menú ⋮ → “Agregar a pantalla principal”. iPhone (Safari): botón Compartir → “Agregar a inicio”. Queda como una app con su ícono.",
      },
      {
        icon: "🧾",
        title: "Todo funciona igual",
        body: "Crear reportes, tomar fotos del cheque con la cámara, notas y contactos. Lo que haces en el celular se ve al momento en la computadora.",
      },
      {
        icon: "📄",
        title: "El PDF desde el celular",
        body: "Al exportar, el PDF se envía a la computadora de la tienda y ella lo guarda en OneDrive (tiene que estar prendida).",
      },
      {
        icon: "🔄",
        title: "Actualizaciones",
        body: "Cuando hay una versión nueva sale un aviso abajo. Toca “Actualizar”: tarda unos segundos y no se pierde nada.",
      },
    ],
  },
];

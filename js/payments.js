// ============================================================
// תשלומים (PAYMENTS)
// - תשלום "ייעוץ" קבוע (500₪) נוצר אוטומטית בהמרת ליד ללקוח (נקרא מ-leads.js).
// - פעימות תשלום לפי מסלול נוצרות/מתעדכנות אוטומטית כשנבחר/משתנה מסלול
//   בכרטיס הלקוח (נקרא מ-clients.js), ונמחקות ונוצרות מחדש בשינוי מסלול -
//   בדיוק כמו המשימות. תשלום הייעוץ ותוספות ידניות (addon) לא נפגעים בשינוי מסלול.
// - כל תשלום ניתן לעריכה חופשית (סכום/סטטוס/תאריך/הערות) אחרי היצירה.
// - מסך "תשלומים" גלובלי (חוצה-לקוחות), במקביל למסך "משימות".
//
// ⚠️ כשנוצר מסלול חדש דרך מסך "מסלולים" (js/tracks.js), אין לו תבנית תשלומים
// עד שתתווסף שורה ל-TRACK_PAYMENT_STRUCTURE למטה (ראו גם הערה ב-ERD).
// ============================================================

const PAYMENT_STATUS = { PENDING: "ממתין", PAID: "שולם", LATE: "באיחור" };
const PAYMENT_STATUS_OPTIONS = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PAID, PAYMENT_STATUS.LATE];

const CONSULTATION_PHASE_NAME = "ייעוץ";
const CONSULTATION_FEE = 500;

// סדר תצוגה קבוע בכרטיס הלקוח (פעימות שלא ברשימה - כלומר תוספות - יופיעו בסוף)
const PHASE_DISPLAY_ORDER = ["ייעוץ", "מקדמה", "תשלום מלא", "עיקרי", "סיום"];

// תבנית פעימות תשלום לפי שם מסלול (לא כולל "ייעוץ" - זה נוצר בנפרד, עצמאי מהמסלול)
const TRACK_PAYMENT_STRUCTURE = {
    "הום סטיילינג": [{ phase_name: "תשלום מלא", percent: 100 }],
    "ליווי ממוקד": [
        { phase_name: "מקדמה", percent: 15 },
        { phase_name: "עיקרי", percent: 80 },
        { phase_name: "סיום", percent: 5 },
    ],
    "ליווי מלא": [
        { phase_name: "מקדמה", percent: 15 },
        { phase_name: "עיקרי", percent: 80 },
        { phase_name: "סיום", percent: 5 },
    ],
};

// שמות הפעימות שנוצרות/נמחקות אוטומטית ע"י תבנית מסלול (לא נוגע ב"ייעוץ" ולא בתוספות)
const TRACK_GENERATED_PHASE_NAMES = ["מקדמה", "עיקרי", "סיום", "תשלום מלא"];

function paymentDisplayIndex(p) {
    const idx = PHASE_DISPLAY_ORDER.indexOf(p.phase_name);
    return idx === -1 ? 999 : idx;
}

// ---------- יצירת תשלום ייעוץ (נקרא מ-leads.js בהמרת ליד ללקוח) ----------

async function createConsultationPayment(clientId) {
    const payload = {
        client_id: clientId,
        phase_name: CONSULTATION_PHASE_NAME,
        payment_type: "contracted",
        amount: CONSULTATION_FEE,
        percent: null,
        status: PAYMENT_STATUS.PENDING,
        paid_date: null,
        notes: null,
    };
    const { error } = await client.from("payments").insert(payload);
    if (error) {
        showToast("הלקוח נוצר, אך הייתה שגיאה ביצירת תשלום הייעוץ", "error");
    }
}

// ---------- יצירה/עדכון אוטומטי לפי מסלול (נקרא מ-clients.js בשמירת טופס מסלול, רק כששינוי מסלול) ----------

async function regeneratePaymentsForClient(clientId, trackId, totalPrice) {
    // מחיקת פעימות שנוצרו מתבנית מסלול קודמת בלבד - לא נוגע ב"ייעוץ" ולא בתוספות ידניות
    await client
        .from("payments")
        .delete()
        .eq("client_id", clientId)
        .in("phase_name", TRACK_GENERATED_PHASE_NAMES);

    if (!trackId || !totalPrice) return; // אין עדיין מסלול/מחיר - אין מה ליצור

    const track = tracksCache.find((t) => t.id === trackId);
    const structure = track ? TRACK_PAYMENT_STRUCTURE[track.name] : null;

    if (!structure) {
        showToast(`לא הוגדרה תבנית תשלומים למסלול "${track ? track.name : ""}" - יש להוסיף תשלומים ידנית בכרטיס הלקוח`, "error");
        return;
    }

    const rows = structure.map((p) => ({
        client_id: clientId,
        phase_name: p.phase_name,
        payment_type: "contracted",
        amount: Math.round((totalPrice * p.percent) / 100),
        percent: p.percent,
        status: PAYMENT_STATUS.PENDING,
        paid_date: null,
        notes: null,
    }));

    const { error } = await client.from("payments").insert(rows);
    if (error) showToast("שגיאה ביצירת פעימות התשלום", "error");
}

async function recalculatePaymentAmounts() {
    const total = currentClient.total_project_price;
    if (!total) {
        showToast("אין מחיר כולל מוגדר ללקוח", "error");
        return;
    }

    const toUpdate = clientPaymentsCache.filter((p) => p.percent != null && p.status !== PAYMENT_STATUS.PAID);
    const skippedPaidCount = clientPaymentsCache.filter((p) => p.percent != null && p.status === PAYMENT_STATUS.PAID).length;

    for (const p of toUpdate) {
        const newAmount = Math.round((total * p.percent) / 100);
        if (newAmount !== Number(p.amount)) {
            const { error } = await client.from("payments").update({ amount: newAmount }).eq("id", p.id);
            if (!error) p.amount = newAmount;
        }
    }

    showToast(
        skippedPaidCount > 0
            ? `הסכומים עודכנו לפי המחיר הנוכחי (${skippedPaidCount} פעימות ששולמו כבר לא נגעו)`
            : "הסכומים עודכנו לפי המחיר הנוכחי",
        "ok"
    );
    renderClientDetail();
}

// ---------- קטע תשלומים בכרטיס הלקוח ----------

let clientPaymentsCache = [];

async function loadCurrentClientPayments(clientId) {
    const { data, error } = await client.from("payments").select("*").eq("client_id", clientId);
    clientPaymentsCache = error ? [] : (data || []);
    clientPaymentsCache.sort((a, b) => paymentDisplayIndex(a) - paymentDisplayIndex(b));
}

function renderPaymentsSection() {
    const paidTotal = clientPaymentsCache
        .filter((p) => p.status === PAYMENT_STATUS.PAID)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalSum = clientPaymentsCache.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const canBackfill = clientPaymentsCache.length === 0 && currentClient.track_id && currentClient.total_project_price;
    const canRecalculate = clientPaymentsCache.some((p) => p.percent != null) && currentClient.total_project_price;

    const body = clientPaymentsCache.length === 0 ? `
        <p class="muted">אין עדיין תשלומים ללקוח זה. פעימות התשלום נוצרות אוטומטית כשנבחר מסלול ומחיר.</p>
        ${canBackfill ? `
            <p class="warning-text" style="margin-top:10px">ללקוח זה כבר יש מסלול ומחיר, אך אין פעימות תשלום (כנראה נקבעו לפני שמסך התשלומים היה פעיל).</p>
            <button type="button" class="btn-small btn-primary" data-action="backfill-payments">צור פעימות תשלום לפי המסלול הנוכחי</button>
        ` : ""}
    ` : `
        <table class="data-table">
            <thead>
                <tr>
                    <th>שלב</th>
                    <th>סכום (₪)</th>
                    <th>אחוז</th>
                    <th>סטטוס</th>
                    <th>תאריך תשלום</th>
                    <th>הערות</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${clientPaymentsCache.map(renderPaymentRow).join("")}</tbody>
        </table>
        <p class="muted" style="margin-top:8px">שולם עד כה: ₪${paidTotal.toLocaleString("he-IL")} מתוך ₪${totalSum.toLocaleString("he-IL")}</p>
    `;

    const extraHeader = `
        <div>
            ${canRecalculate ? `<button type="button" class="btn-small btn-ghost" data-action="recalculate-amounts" title="מחשב מחדש את הסכומים של הפעימות האחוזיות לפי המחיר הכולל הנוכחי. פעימות שכבר סומנו כ'שולם' לא ייגעו.">רענון סכומים לפי מחיר</button>` : ""}
            <button type="button" class="btn-small btn-ghost" data-action="add-payment">+ תשלום נוסף</button>
        </div>
    `;

    return renderCollapsibleSection("payments", "תשלומים", body, { extraHeaderHtml: extraHeader });
}

function renderPaymentRow(p) {
    const isAddon = p.payment_type === "addon";
    const lateStyle = p.status === PAYMENT_STATUS.LATE ? 'style="background:#fee2e2;"' : "";
    const statusOptions = PAYMENT_STATUS_OPTIONS.map(
        (s) => `<option value="${s}" ${p.status === s ? "selected" : ""}>${s}</option>`
    ).join("");

    return `
        <tr class="table-row" data-payment-id="${p.id}" ${lateStyle}>
            <td>${escapeHtml(p.phase_name)}${isAddon ? " (תוספת)" : ""}</td>
            <td><input type="number" min="0" step="1" class="inline-number" value="${p.amount ?? ""}" data-field="amount" data-id="${p.id}" /></td>
            <td>${p.percent != null ? p.percent + "%" : "-"}</td>
            <td><select data-field="status" data-id="${p.id}">${statusOptions}</select></td>
            <td><input type="date" data-field="paid_date" data-id="${p.id}" value="${p.paid_date || ""}" /></td>
            <td><input type="text" class="inline-text" placeholder="הערות..." value="${escapeHtml(p.notes || "")}" data-field="notes" data-id="${p.id}" /></td>
            <td><button type="button" class="btn-icon" data-action="delete-payment" data-id="${p.id}">מחיקה</button></td>
        </tr>
    `;
}

function openAddPaymentForm() {
    openModal(`
        <h2>הוספת תשלום</h2>
        <p class="muted">לתוספת שאינה חלק מהחבילה המקורית - למשל תכנית נוספת, יום רכישות נוסף, או הדמיה נוספת.</p>
        <form id="add-payment-form">
            <label for="payment-phase-name">שם הפעימה / סיבת החיוב *</label>
            <input type="text" id="payment-phase-name" required placeholder="לדוגמה: יום רכישות נוסף" />

            <label for="payment-amount">סכום (₪) *</label>
            <input type="number" id="payment-amount" min="0" step="1" required />

            <label for="payment-notes">הערות</label>
            <textarea id="payment-notes" rows="2"></textarea>

            <div class="modal-actions">
                <button type="button" class="btn-ghost" data-action="close-modal">ביטול</button>
                <button type="submit" class="btn-primary">הוספה</button>
            </div>
        </form>
    `);

    document.getElementById("add-payment-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            client_id: currentClient.id,
            phase_name: document.getElementById("payment-phase-name").value.trim(),
            payment_type: "addon",
            amount: Number(document.getElementById("payment-amount").value),
            percent: null,
            status: PAYMENT_STATUS.PENDING,
            paid_date: null,
            notes: document.getElementById("payment-notes").value.trim() || null,
        };

        const { data, error } = await client.from("payments").insert(payload).select().single();
        if (error) {
            showToast("שגיאה בהוספת התשלום", "error");
            return;
        }

        clientPaymentsCache.push(data);
        clientPaymentsCache.sort((a, b) => paymentDisplayIndex(a) - paymentDisplayIndex(b));
        showToast("התשלום נוסף", "ok");
        closeModal();
        renderClientDetail();
    });
}

// אירועים בקטע התשלומים של כרטיס הלקוח (delegation על אותו קונטיינר ששאר clients.js משתמש בו)
clientDetailView.addEventListener("click", async (e) => {
    if (e.target.closest('[data-action="recalculate-amounts"]')) {
        return recalculatePaymentAmounts();
    }

    if (e.target.closest('[data-action="add-payment"]')) {
        return openAddPaymentForm();
    }

    if (e.target.closest('[data-action="backfill-payments"]')) {
        await regeneratePaymentsForClient(currentClient.id, currentClient.track_id, currentClient.total_project_price);
        await loadCurrentClientPayments(currentClient.id);
        showToast("פעימות התשלום נוצרו לפי המסלול הנוכחי", "ok");
        return renderClientDetail();
    }

    const delBtn = e.target.closest('[data-action="delete-payment"]');
    if (delBtn) {
        const id = delBtn.dataset.id;
        openConfirmModal("למחוק את התשלום הזה?", async () => {
            const { error } = await client.from("payments").delete().eq("id", id);
            if (error) {
                showToast("שגיאה במחיקת התשלום", "error");
                return;
            }
            clientPaymentsCache = clientPaymentsCache.filter((p) => p.id !== id);
            showToast("התשלום נמחק", "ok");
            renderClientDetail();
        }, "כן, למחוק");
    }
});

clientDetailView.addEventListener("change", async (e) => {
    const el = e.target.closest("[data-field]");
    if (!el || !el.closest("tr[data-payment-id]")) return;

    const id = el.dataset.id;
    const field = el.dataset.field;
    let value = el.value;
    if (field === "amount") value = value === "" ? null : Number(value);
    if (field === "paid_date") value = value || null;

    const { error } = await client.from("payments").update({ [field]: value }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון התשלום", "error");
        return;
    }

    const p = clientPaymentsCache.find((x) => x.id === id);
    if (p) p[field] = value;
    showToast("עודכן", "ok");
    if (field === "status") renderClientDetail(); // לרענן צביעת "באיחור" וסיכום הסכומים
});

// ---------- מסך תשלומים גלובלי (חוצה-לקוחות) ----------

const paymentsTableContainer = document.getElementById("payments-table-container");
let globalPaymentsCache = [];
let globalPaymentsClientMap = {}; // client_id -> full_name
let paymentsSort = { column: "status", direction: "asc" };

const PAYMENT_STATUS_SORT_PRIORITY = {
    [PAYMENT_STATUS.LATE]: 0,
    [PAYMENT_STATUS.PENDING]: 1,
    [PAYMENT_STATUS.PAID]: 2,
};

async function loadPaymentsView() {
    paymentsTableContainer.innerHTML = `<p class="muted">טוענת תשלומים...</p>`;

    const [{ data: paymentsData, error }, { data: clientsData }] = await Promise.all([
        client.from("payments").select("*"),
        client.from("clients").select("id, full_name"),
    ]);

    if (error) {
        paymentsTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת תשלומים: ${escapeHtml(error.message)}</p>`;
        return;
    }

    globalPaymentsClientMap = {};
    (clientsData || []).forEach((c) => { globalPaymentsClientMap[c.id] = c.full_name; });

    globalPaymentsCache = paymentsData || [];
    renderPaymentsTable();
}

function paymentsSortValue(p, column) {
    if (column === "client") return globalPaymentsClientMap[p.client_id] || "";
    if (column === "status") return PAYMENT_STATUS_SORT_PRIORITY[p.status] ?? 99;
    if (column === "amount") return Number(p.amount || 0);
    if (column === "paid_date") return p.paid_date || "";
    if (column === "phase_name") return p.phase_name || "";
    return "";
}

function renderPaymentsTable() {
    const rows = [...globalPaymentsCache];

    rows.sort((a, b) => {
        const va = paymentsSortValue(a, paymentsSort.column);
        const vb = paymentsSortValue(b, paymentsSort.column);
        const cmp = typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "he");
        return paymentsSort.direction === "asc" ? cmp : -cmp;
    });

    if (rows.length === 0) {
        paymentsTableContainer.innerHTML = `<p class="muted">אין עדיין תשלומים במערכת.</p>`;
        return;
    }

    const arrow = (col) => (paymentsSort.column === col ? (paymentsSort.direction === "asc" ? " ▲" : " ▼") : "");

    const rowsHtml = rows.map((p) => {
        const lateStyle = p.status === PAYMENT_STATUS.LATE ? 'style="background:#fee2e2;"' : "";
        return `
            <tr class="table-row" ${lateStyle}>
                <td class="clickable-row" data-action="open-client-from-payment" data-client-id="${p.client_id}">${escapeHtml(globalPaymentsClientMap[p.client_id] || "-")}</td>
                <td>${escapeHtml(p.phase_name)}${p.payment_type === "addon" ? " (תוספת)" : ""}</td>
                <td>₪${Number(p.amount || 0).toLocaleString("he-IL")}</td>
                <td>${p.percent != null ? p.percent + "%" : "-"}</td>
                <td>${escapeHtml(p.status)}</td>
                <td>${p.paid_date ? formatDate(p.paid_date) : "-"}</td>
            </tr>
        `;
    }).join("");

    paymentsTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="client">לקוח${arrow("client")}</th>
                    <th class="sortable" data-sort="phase_name">שלב${arrow("phase_name")}</th>
                    <th class="sortable" data-sort="amount">סכום${arrow("amount")}</th>
                    <th>אחוז</th>
                    <th class="sortable" data-sort="status">סטטוס${arrow("status")}</th>
                    <th class="sortable" data-sort="paid_date">תאריך תשלום${arrow("paid_date")}</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

paymentsTableContainer.addEventListener("click", (e) => {
    const sortHeader = e.target.closest("th.sortable");
    if (sortHeader) {
        const col = sortHeader.dataset.sort;
        if (paymentsSort.column === col) {
            paymentsSort.direction = paymentsSort.direction === "asc" ? "desc" : "asc";
        } else {
            paymentsSort = { column: col, direction: "asc" };
        }
        renderPaymentsTable();
        return;
    }

    const row = e.target.closest('[data-action="open-client-from-payment"]');
    if (row) {
        switchView("clients");
        openClientDetail(row.dataset.clientId);
    }
});

// ============================================================
// עמלות מחברות עיצוב (COMMISSION_INCOME) - שלב 9
// קטע בכרטיס הלקוח (כמה רשומות ללקוח אחד, ידני לגמרי, אין טריגר אוטומטי)
// + מסך "עמלות" גלובלי חוצה-לקוחות
// חייב להיטען אחרי js/clients.js (הקטע בכרטיס הלקוח משתמש ב-clientDetailView).
// ============================================================

const COMMISSION_STATUS = { PENDING: "ממתין", RECEIVED: "התקבל" };

let currentClientCommissions = [];

// ============================================================
// ---------- כרטיס לקוח: טעינה ורינדור ----------
// ============================================================

async function loadCurrentClientCommissions(clientId) {
    const { data, error } = await client
        .from("commission_income")
        .select("*")
        .eq("client_id", clientId);

    currentClientCommissions = error ? [] : (data || []);
}

function renderCommissionSection() {
    const rows = currentClientCommissions.map((c) => renderCommissionRow(c)).join("");

    const body = currentClientCommissions.length ? `
        <table class="data-table">
            <thead>
                <tr>
                    <th>חברה</th>
                    <th>איש קשר בסניף</th>
                    <th>סכום עסקה (₪)</th>
                    <th>אחוז עמלה (%)</th>
                    <th>סכום עמלה (₪)</th>
                    <th>סטטוס</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    ` : `<p class="muted">אין עדיין עמלות רשומות ללקוח זה.</p>`;

    const extraHeader = `<button type="button" class="btn-small btn-primary" data-action="add-commission">+ הוספת עמלה</button>`;
    return renderCollapsibleSection("commission", "עמלות מחברות עיצוב", body, { extraHeaderHtml: extraHeader });
}

function renderCommissionRow(c) {
    return `
        <tr class="table-row" data-id="${c.id}">
            <td><input type="text" value="${escapeHtml(c.company_name || "")}" data-action="commission-field" data-field="company_name" data-id="${c.id}" /></td>
            <td><input type="text" value="${escapeHtml(c.branch_contact || "")}" data-action="commission-field" data-field="branch_contact" data-id="${c.id}" /></td>
            <td><input type="number" min="0" step="1" value="${c.deal_amount ?? ""}" data-action="commission-field" data-field="deal_amount" data-id="${c.id}" /></td>
            <td><input type="number" min="0" step="0.1" value="${c.commission_percent ?? ""}" data-action="commission-field" data-field="commission_percent" data-id="${c.id}" /></td>
            <td class="commission-amount-cell">
                <input type="number" min="0" step="1" value="${c.commission_amount ?? ""}" data-action="commission-field" data-field="commission_amount" data-id="${c.id}" />
                <button type="button" class="btn-icon" data-action="recalc-commission" data-id="${c.id}" title="חישוב מחדש לפי סכום עסקה ואחוז">↻</button>
            </td>
            <td>
                <select data-action="commission-field" data-field="status" data-id="${c.id}">
                    <option value="${COMMISSION_STATUS.PENDING}" ${c.status === COMMISSION_STATUS.PENDING ? "selected" : ""}>${COMMISSION_STATUS.PENDING}</option>
                    <option value="${COMMISSION_STATUS.RECEIVED}" ${c.status === COMMISSION_STATUS.RECEIVED ? "selected" : ""}>${COMMISSION_STATUS.RECEIVED}</option>
                </select>
            </td>
            <td><button type="button" class="btn-icon" data-action="delete-commission" data-id="${c.id}" title="מחיקה">🗑</button></td>
        </tr>
    `;
}

// ---------- אירועים בכרטיס הלקוח ----------

clientDetailView.addEventListener("click", async (e) => {
    if (e.target.closest('[data-action="add-commission"]')) {
        openCommissionFormModal();
        return;
    }

    const recalcBtn = e.target.closest('[data-action="recalc-commission"]');
    if (recalcBtn) {
        await recalcCommissionAmount(recalcBtn.dataset.id);
        return;
    }

    const delBtn = e.target.closest('[data-action="delete-commission"]');
    if (delBtn) {
        const id = delBtn.dataset.id;
        openConfirmModal("האם למחוק את רשומת העמלה? הפעולה בלתי הפיכה.", async () => {
            await deleteCommission(id);
        }, "כן, למחוק");
        return;
    }
});

clientDetailView.addEventListener("change", async (e) => {
    const el = e.target.closest('[data-action="commission-field"]');
    if (!el) return;

    const id = el.dataset.id;
    const field = el.dataset.field;
    const commission = currentClientCommissions.find((c) => c.id === id);
    if (!commission) return;

    let value = el.value;
    if (["deal_amount", "commission_percent", "commission_amount"].includes(field)) {
        value = value === "" ? null : Number(value);
    }
    if (["company_name", "branch_contact"].includes(field) && value.trim() === "") {
        value = null;
    }

    const { error } = await client.from("commission_income").update({ [field]: value }).eq("id", id);
    if (error) {
        showToast("שגיאה בשמירת השינוי", "error");
        return;
    }

    commission[field] = value;
    showToast("נשמר", "ok");
});

// ---------- פעולות בכרטיס הלקוח ----------

function openCommissionFormModal() {
    openModal(`
        <h2>הוספת עמלה</h2>
        <form id="commission-form">
            <label for="commission-company">שם חברת העיצוב</label>
            <input type="text" id="commission-company" required />

            <label for="commission-contact">איש קשר בסניף</label>
            <input type="text" id="commission-contact" />

            <label for="commission-deal">סכום העסקה שנסגרה (₪)</label>
            <input type="number" id="commission-deal" min="0" step="1" required />

            <label for="commission-percent">אחוז העמלה שהובטח (%)</label>
            <input type="number" id="commission-percent" min="0" step="0.1" required />

            <div class="modal-actions">
                <button type="button" class="btn-ghost" id="commission-cancel-btn">ביטול</button>
                <button type="submit" class="btn-primary">שמירה</button>
            </div>
        </form>
    `);

    document.getElementById("commission-cancel-btn").addEventListener("click", closeModal);

    document.getElementById("commission-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const company_name = document.getElementById("commission-company").value.trim();
        const branch_contact = document.getElementById("commission-contact").value.trim() || null;
        const deal_amount = Number(document.getElementById("commission-deal").value);
        const commission_percent = Number(document.getElementById("commission-percent").value);
        const commission_amount = Math.round((deal_amount * commission_percent) / 100);

        const { error } = await client.from("commission_income").insert({
            client_id: currentClient.id,
            company_name,
            branch_contact,
            deal_amount,
            commission_percent,
            commission_amount,
            status: COMMISSION_STATUS.PENDING,
        });

        if (error) {
            showToast("שגיאה בהוספת העמלה", "error");
            return;
        }

        closeModal();
        showToast("העמלה נוספה", "ok");
        await loadCurrentClientCommissions(currentClient.id);
        renderClientDetail();
    });
}

async function recalcCommissionAmount(id) {
    const commission = currentClientCommissions.find((c) => c.id === id);
    if (!commission) return;

    if (commission.deal_amount == null || commission.commission_percent == null) {
        showToast("צריך גם סכום עסקה וגם אחוז כדי לחשב מחדש", "error");
        return;
    }

    const newAmount = Math.round((commission.deal_amount * commission.commission_percent) / 100);
    const { error } = await client.from("commission_income").update({ commission_amount: newAmount }).eq("id", id);
    if (error) {
        showToast("שגיאה בחישוב מחדש", "error");
        return;
    }

    commission.commission_amount = newAmount;
    renderClientDetail();
}

async function deleteCommission(id) {
    const { error } = await client.from("commission_income").delete().eq("id", id);
    if (error) {
        showToast("שגיאה במחיקה", "error");
        return;
    }

    currentClientCommissions = currentClientCommissions.filter((c) => c.id !== id);
    showToast("הרשומה נמחקה", "ok");
    renderClientDetail();
}

// ============================================================
// ---------- מסך "עמלות" גלובלי, חוצה-לקוחות ----------
// ============================================================

const commissionView = document.getElementById("commission-view");
const commissionTableContainer = document.getElementById("commission-table-container");

let commissionCache = [];
let commissionSort = { column: "status", direction: "asc" };

async function loadCommissionView() {
    commissionTableContainer.innerHTML = `<p class="muted">טוענת עמלות...</p>`;

    const { data, error } = await client
        .from("commission_income")
        .select("*, clients(full_name)");

    if (error) {
        commissionTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת עמלות: ${escapeHtml(error.message)}</p>`;
        return;
    }

    commissionCache = data || [];
    renderCommissionTable();
}

function commissionSortValue(row, column) {
    if (column === "client") return row.clients ? row.clients.full_name : "";
    if (column === "status") return row.status === COMMISSION_STATUS.PENDING ? 0 : 1;
    if (["deal_amount", "commission_percent", "commission_amount"].includes(column)) return Number(row[column] || 0);
    return row[column] || "";
}

function renderCommissionTable() {
    let rows = [...commissionCache];

    rows.sort((a, b) => {
        const va = commissionSortValue(a, commissionSort.column);
        const vb = commissionSortValue(b, commissionSort.column);
        const cmp = (typeof va === "number" && typeof vb === "number")
            ? va - vb
            : String(va).localeCompare(String(vb), "he");
        return commissionSort.direction === "asc" ? cmp : -cmp;
    });

    if (rows.length === 0) {
        commissionTableContainer.innerHTML = `<p class="muted">אין עדיין עמלות רשומות.</p>`;
        return;
    }

    const arrow = (col) => (commissionSort.column === col ? (commissionSort.direction === "asc" ? " ▲" : " ▼") : "");

    const rowsHtml = rows.map((c) => `
        <tr class="table-row clickable-row" data-action="open-client-from-commission" data-client-id="${c.client_id}">
            <td>${escapeHtml(c.clients ? c.clients.full_name : "-")}</td>
            <td>${escapeHtml(c.company_name || "-")}</td>
            <td>${escapeHtml(c.branch_contact || "-")}</td>
            <td>${c.deal_amount != null ? "₪" + Number(c.deal_amount).toLocaleString("he-IL") : "-"}</td>
            <td>${c.commission_percent != null ? c.commission_percent + "%" : "-"}</td>
            <td>${c.commission_amount != null ? "₪" + Number(c.commission_amount).toLocaleString("he-IL") : "-"}</td>
            <td><span class="${c.status === COMMISSION_STATUS.PENDING ? "badge badge-open" : "badge badge-closed"}">${escapeHtml(c.status)}</span></td>
        </tr>
    `).join("");

    commissionTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="client">לקוח${arrow("client")}</th>
                    <th class="sortable" data-sort="company_name">חברה${arrow("company_name")}</th>
                    <th class="sortable" data-sort="branch_contact">איש קשר${arrow("branch_contact")}</th>
                    <th class="sortable" data-sort="deal_amount">סכום עסקה${arrow("deal_amount")}</th>
                    <th class="sortable" data-sort="commission_percent">אחוז${arrow("commission_percent")}</th>
                    <th class="sortable" data-sort="commission_amount">סכום עמלה${arrow("commission_amount")}</th>
                    <th class="sortable" data-sort="status">סטטוס${arrow("status")}</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

commissionTableContainer.addEventListener("click", (e) => {
    const sortHeader = e.target.closest("th.sortable");
    if (sortHeader) {
        const col = sortHeader.dataset.sort;
        if (commissionSort.column === col) {
            commissionSort.direction = commissionSort.direction === "asc" ? "desc" : "asc";
        } else {
            commissionSort = { column: col, direction: "asc" };
        }
        renderCommissionTable();
        return;
    }

    const row = e.target.closest('[data-action="open-client-from-commission"]');
    if (row) {
        switchView("clients");
        openClientDetail(row.dataset.clientId);
    }
});

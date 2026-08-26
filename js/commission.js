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
    await ensureSuppliersLoaded();

    const { data, error } = await client
        .from("commission_income")
        .select("*, suppliers(name)")
        .eq("client_id", clientId);

    currentClientCommissions = error ? [] : (data || []);
}

function renderCommissionSection() {
    const rows = currentClientCommissions.map((c) => renderCommissionRow(c)).join("");

    const body = currentClientCommissions.length ? `
        <table class="data-table commission-table">
            <thead>
                <tr>
                    <th>ספק</th>
                    <th>איש קשר בסניף</th>
                    <th>טלפון</th>
                    <th>סכום עסקה</th>
                    <th>אחוז</th>
                    <th>סכום עמלה</th>
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
    const options = suppliersCache.map(
        (s) => `<option value="${s.id}" ${c.supplier_id === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`
    ).join("");

    return `
        <tr class="table-row" data-id="${c.id}">
            <td>
                <select data-action="commission-field" data-field="supplier_id" data-id="${c.id}">
                    <option value="">- בחרי ספק -</option>
                    ${options}
                </select>
            </td>
            <td><input type="text" value="${escapeHtml(c.branch_contact || "")}" data-action="commission-field" data-field="branch_contact" data-id="${c.id}" /></td>
            <td><input type="tel" dir="ltr" value="${escapeHtml(c.branch_contact_phone || "")}" data-action="commission-field" data-field="branch_contact_phone" data-id="${c.id}" /></td>
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
        await openCommissionFormModal();
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
    if (field === "supplier_id" && value === "") {
        value = null;
    }
    if (field === "branch_contact" && value.trim() === "") {
        value = null;
    }
    if (field === "branch_contact_phone" && value.trim() === "") {
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

async function openCommissionFormModal() {
    await ensureSuppliersLoaded();

    const supplierOptions = suppliersCache.map(
        (s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`
    ).join("");

    openModal(`
        <h2>הוספת עמלה</h2>
        <form id="commission-form">
            <label class="toggle-row">
                <span>ספק חדש (לא ברשימה)</span>
                <input type="checkbox" class="switch" id="commission-new-toggle" ${suppliersCache.length === 0 ? "checked disabled" : ""} />
            </label>

            <div id="commission-existing-block" ${suppliersCache.length === 0 ? 'class="hidden"' : ""}>
                <label for="commission-supplier">ספק / חברת עיצוב</label>
                <select id="commission-supplier">
                    <option value="">- בחרי ספק -</option>
                    ${supplierOptions}
                </select>
            </div>
            ${suppliersCache.length === 0 ? `<p class="muted">המאגר הגלובלי ריק עדיין - ניתן להוסיף כאן את הספק הראשון.</p>` : ""}

            <div id="commission-new-block" class="${suppliersCache.length === 0 ? "" : "hidden"}">
                <label for="commission-new-name">שם הספק/חברה</label>
                <input type="text" id="commission-new-name" />
                <label for="commission-new-contact">איש קשר</label>
                <input type="text" id="commission-new-contact" />
                <label for="commission-new-phone">טלפון</label>
                <input type="tel" id="commission-new-phone" dir="ltr" />
                <label for="commission-new-price-notes">הערות</label>
                <textarea id="commission-new-price-notes" rows="2"></textarea>
            </div>

            <label for="commission-contact">איש קשר בסניף</label>
            <input type="text" id="commission-contact" />

            <label for="commission-contact-phone">טלפון איש הקשר</label>
            <input type="tel" id="commission-contact-phone" dir="ltr" />

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

    const newToggle = document.getElementById("commission-new-toggle");
    const existingBlock = document.getElementById("commission-existing-block");
    const newBlock = document.getElementById("commission-new-block");

    newToggle.addEventListener("change", () => {
        existingBlock.classList.toggle("hidden", newToggle.checked);
        newBlock.classList.toggle("hidden", !newToggle.checked);
    });

    document.getElementById("commission-cancel-btn").addEventListener("click", closeModal);

    document.getElementById("commission-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const branch_contact = document.getElementById("commission-contact").value.trim() || null;
        const branch_contact_phone = document.getElementById("commission-contact-phone").value.trim() || null;
        const deal_amount = Number(document.getElementById("commission-deal").value);
        const commission_percent = Number(document.getElementById("commission-percent").value);
        const commission_amount = Math.round((deal_amount * commission_percent) / 100);

        let supplier_id;

        if (newToggle.checked) {
            const name = document.getElementById("commission-new-name").value.trim();
            if (!name) {
                showToast("יש להזין שם ספק", "error");
                return;
            }

            const { data: newSupplier, error: supplierError } = await client.from("suppliers").insert({
                name,
                contact_person: document.getElementById("commission-new-contact").value.trim() || null,
                phone: document.getElementById("commission-new-phone").value.trim() || null,
                price_notes: document.getElementById("commission-new-price-notes").value.trim() || null,
            }).select().single();

            if (supplierError) {
                showToast("שגיאה ביצירת הספק", "error");
                return;
            }

            suppliersCache.push(newSupplier);
            supplier_id = newSupplier.id;
        } else {
            supplier_id = document.getElementById("commission-supplier").value;
            if (!supplier_id) {
                showToast("יש לבחור ספק", "error");
                return;
            }
        }

        const { error } = await client.from("commission_income").insert({
            client_id: currentClient.id,
            supplier_id,
            branch_contact,
            branch_contact_phone,
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
        .select("*, clients(full_name), suppliers(name)");

    if (error) {
        commissionTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת עמלות: ${escapeHtml(error.message)}</p>`;
        return;
    }

    commissionCache = data || [];
    renderCommissionTable();
}

function commissionSortValue(row, column) {
    if (column === "client") return row.clients ? row.clients.full_name : "";
    if (column === "supplier") return row.suppliers ? row.suppliers.name : "";
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
            <td>${escapeHtml(c.suppliers ? c.suppliers.name : "-")}</td>
            <td>${escapeHtml(c.clients ? c.clients.full_name : "-")}</td>
            <td>${escapeHtml(c.branch_contact || "-")}</td>
            <td class="ltr-cell">${escapeHtml(c.branch_contact_phone || "-")}</td>
            <td>${c.deal_amount != null ? "₪" + Number(c.deal_amount).toLocaleString("he-IL") : "-"}</td>
            <td>${c.commission_percent != null ? c.commission_percent + "%" : "-"}</td>
            <td>${c.commission_amount != null ? "₪" + Number(c.commission_amount).toLocaleString("he-IL") : "-"}</td>
            <td><span class="${c.status === COMMISSION_STATUS.PENDING ? "badge badge-pending" : "badge badge-paid"}">${escapeHtml(c.status)}</span></td>
        </tr>
    `).join("");

    commissionTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="supplier">ספק${arrow("supplier")}</th>
                    <th class="sortable" data-sort="client">לקוח${arrow("client")}</th>
                    <th class="sortable" data-sort="branch_contact">איש קשר${arrow("branch_contact")}</th>
                    <th>טלפון</th>
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

commissionTableContainer.addEventListener("click", async (e) => {
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
        // ה-await כאן מכוון: אם switchView מבצע רינדור/טעינה אסינכרוניים משלו,
        // חייבים לחכות שהוא יסיים לפני שפותחים את כרטיס הלקוח הספציפי - אחרת
        // הרינדור המאוחר של switchView "דורס" את תצוגת הכרטיס וחוזר לרשימה.
        await switchView("clients");
        await openClientDetail(row.dataset.clientId);
    }
});

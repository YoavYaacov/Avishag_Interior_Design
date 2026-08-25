// ============================================================
// ספקים/קבלנים (SUPPLIERS + CLIENT_SUPPLIERS) - שלב 10
// מאגר גלובלי של ספקים (SUPPLIERS) + קישור פר לקוח (CLIENT_SUPPLIERS, one-to-many).
// עריכת פרטי הספק עצמו (שם/איש קשר/טלפון/הערות) נעשית רק דרך המאגר
// הגלובלי - "מקור אמת" יחיד. בכרטיס הלקוח מקשרים/מנתקים ספק, ומזינים הערה
// חופשית ספציפית ללקוח (מה הוזמן ממנו בפרויקט הזה).
// חייב להיטען אחרי js/clients.js (הקטע בכרטיס הלקוח משתמש ב-clientDetailView).
// ============================================================

let currentClientSuppliers = [];

// מאגר הספקים הגלובלי, בקאש משותף בין מסך "ספקים" לבין מודאל הקישור בכרטיס הלקוח
let suppliersCache = [];
let suppliersLoaded = false;

// ============================================================
// ---------- כרטיס לקוח: טעינה ורינדור ----------
// ============================================================

async function loadCurrentClientSuppliers(clientId) {
    const { data, error } = await client
        .from("client_suppliers")
        .select("*, suppliers(*)")
        .eq("client_id", clientId);

    currentClientSuppliers = error ? [] : (data || []);
}

function renderSuppliersSection() {
    const rows = currentClientSuppliers.map((cs) => renderSupplierLinkRow(cs)).join("");

    const body = currentClientSuppliers.length ? `
        <table class="data-table suppliers-table">
            <thead>
                <tr>
                    <th>שם הספק/קבלן</th>
                    <th>איש קשר</th>
                    <th>טלפון</th>
                    <th>מה הוזמן</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    ` : `<p class="muted">אין עדיין ספקים מקושרים ללקוח זה.</p>`;

    const extraHeader = `<button type="button" class="btn-small btn-primary" data-action="add-supplier-link">+ קישור ספק</button>`;
    return renderCollapsibleSection("suppliers", "ספקים/קבלנים", body, { extraHeaderHtml: extraHeader });
}

function renderSupplierLinkRow(cs) {
    const s = cs.suppliers || {};
    return `
        <tr class="table-row" data-id="${cs.id}">
            <td>${escapeHtml(s.name || "-")}</td>
            <td>${escapeHtml(s.contact_person || "-")}</td>
            <td class="ltr-cell">${escapeHtml(s.phone || "-")}</td>
            <td><input type="text" value="${escapeHtml(cs.notes || "")}" data-action="supplier-link-field" data-field="notes" data-id="${cs.id}" placeholder="מה הוזמן..." /></td>
            <td><button type="button" class="btn-icon" data-action="unlink-supplier" data-id="${cs.id}" title="הסרת קישור (הספק עצמו יישאר ברשימה הגלובלית)">🗑</button></td>
        </tr>
    `;
}

// ---------- אירועים בכרטיס הלקוח ----------

clientDetailView.addEventListener("click", async (e) => {
    if (e.target.closest('[data-action="add-supplier-link"]')) {
        await openSupplierLinkModal();
        return;
    }

    const unlinkBtn = e.target.closest('[data-action="unlink-supplier"]');
    if (unlinkBtn) {
        const id = unlinkBtn.dataset.id;
        openConfirmModal("האם להסיר את קישור הספק ללקוח? הספק עצמו יישאר ברשימה הגלובלית.", async () => {
            await unlinkSupplier(id);
        }, "כן, להסיר");
        return;
    }
});

clientDetailView.addEventListener("change", async (e) => {
    const el = e.target.closest('[data-action="supplier-link-field"]');
    if (!el) return;

    const id = el.dataset.id;
    const field = el.dataset.field;
    const link = currentClientSuppliers.find((cs) => cs.id === id);
    if (!link) return;

    const value = el.value.trim() || null;

    const { error } = await client.from("client_suppliers").update({ [field]: value }).eq("id", id);
    if (error) {
        showToast("שגיאה בשמירת השינוי", "error");
        return;
    }

    link[field] = value;
    showToast("נשמר", "ok");
});

// ---------- פעולות בכרטיס הלקוח ----------

async function ensureSuppliersLoaded() {
    if (suppliersLoaded) return;
    const { data, error } = await client.from("suppliers").select("*").order("name");
    suppliersCache = error ? [] : (data || []);
    suppliersLoaded = true;
}

async function openSupplierLinkModal() {
    await ensureSuppliersLoaded();

    // ✅ הוחלט: אפשר לקשר את אותו ספק כמה פעמים לאותו לקוח (למשל כמה הזמנות
    // נפרדות מאותה חברה, כל אחת עם הערה משלה) - לכן כל הספקים במאגר מוצגים
    // תמיד לבחירה, גם אם חלקם כבר מקושרים ללקוח הזה.
    const availableSuppliers = suppliersCache;

    const supplierOptions = availableSuppliers.map(
        (s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`
    ).join("");

    openModal(`
        <h2>קישור ספק/קבלן ללקוח</h2>
        <form id="supplier-link-form">
            <label class="toggle-row">
                <span>ספק חדש (לא ברשימה הקיימת)</span>
                <input type="checkbox" class="switch" id="supplier-new-toggle" />
            </label>

            <div id="supplier-existing-block" ${availableSuppliers.length === 0 ? 'class="hidden"' : ""}>
                <label for="supplier-select">בחירת ספק קיים</label>
                <select id="supplier-select">${supplierOptions}</select>
            </div>

            ${availableSuppliers.length === 0 ? `<p class="muted">המאגר הגלובלי ריק עדיין - ניתן להוסיף כאן את הספק הראשון.</p>` : ""}

            <div id="supplier-new-block" class="hidden">
                <label for="supplier-new-name">שם הספק/קבלן</label>
                <input type="text" id="supplier-new-name" />
                <label for="supplier-new-contact">איש קשר</label>
                <input type="text" id="supplier-new-contact" />
                <label for="supplier-new-phone">טלפון</label>
                <input type="tel" id="supplier-new-phone" dir="ltr" />
                <label for="supplier-new-price-notes">הערות</label>
                <textarea id="supplier-new-price-notes" rows="2"></textarea>
            </div>

            <label for="supplier-link-notes">מה הוזמן (ספציפי ללקוח זה)</label>
            <textarea id="supplier-link-notes" rows="2"></textarea>

            <div class="modal-actions">
                <button type="button" class="btn-ghost" id="supplier-link-cancel-btn">ביטול</button>
                <button type="submit" class="btn-primary">שמירה</button>
            </div>
        </form>
    `);

    const newToggle = document.getElementById("supplier-new-toggle");
    const existingBlock = document.getElementById("supplier-existing-block");
    const newBlock = document.getElementById("supplier-new-block");

    // אם אין שום ספק זמין לבחירה - פותחים ישר במצב "ספק חדש" ונועלים את המתג
    if (availableSuppliers.length === 0) {
        newToggle.checked = true;
        newToggle.disabled = true;
        newBlock.classList.remove("hidden");
    }

    newToggle.addEventListener("change", () => {
        existingBlock.classList.toggle("hidden", newToggle.checked);
        newBlock.classList.toggle("hidden", !newToggle.checked);
    });

    document.getElementById("supplier-link-cancel-btn").addEventListener("click", closeModal);

    document.getElementById("supplier-link-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const notes = document.getElementById("supplier-link-notes").value.trim() || null;
        let supplierId;

        if (newToggle.checked) {
            const name = document.getElementById("supplier-new-name").value.trim();
            if (!name) {
                showToast("יש להזין שם ספק", "error");
                return;
            }

            const { data: newSupplier, error: supplierError } = await client.from("suppliers").insert({
                name,
                contact_person: document.getElementById("supplier-new-contact").value.trim() || null,
                phone: document.getElementById("supplier-new-phone").value.trim() || null,
                price_notes: document.getElementById("supplier-new-price-notes").value.trim() || null,
            }).select().single();

            if (supplierError) {
                showToast("שגיאה ביצירת הספק", "error");
                return;
            }

            suppliersCache.push(newSupplier);
            supplierId = newSupplier.id;
        } else {
            supplierId = document.getElementById("supplier-select").value;
            if (!supplierId) {
                showToast("יש לבחור ספק", "error");
                return;
            }
        }

        const { error } = await client.from("client_suppliers").insert({
            client_id: currentClient.id,
            supplier_id: supplierId,
            notes,
        });

        if (error) {
            showToast("שגיאה בקישור הספק", "error");
            return;
        }

        closeModal();
        showToast("הספק קושר ללקוח", "ok");
        await loadCurrentClientSuppliers(currentClient.id);
        renderClientDetail();
    });
}

async function unlinkSupplier(id) {
    const { error } = await client.from("client_suppliers").delete().eq("id", id);
    if (error) {
        showToast("שגיאה בהסרת הקישור", "error");
        return;
    }

    currentClientSuppliers = currentClientSuppliers.filter((cs) => cs.id !== id);
    showToast("הקישור הוסר", "ok");
    renderClientDetail();
}

// ============================================================
// ---------- מסך "ספקים" גלובלי, חוצה-לקוחות (ניהול המאגר) ----------
// ============================================================

const suppliersView = document.getElementById("suppliers-view");
const suppliersTableContainer = document.getElementById("suppliers-table-container");

let suppliersSort = { column: "name", direction: "asc" };

async function loadSuppliersView() {
    suppliersTableContainer.innerHTML = `<p class="muted">טוענת ספקים...</p>`;

    const { data, error } = await client.from("suppliers").select("*");

    if (error) {
        suppliersTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת ספקים: ${escapeHtml(error.message)}</p>`;
        return;
    }

    suppliersCache = data || [];
    suppliersLoaded = true;
    renderSuppliersTable();
}

function renderSuppliersTable() {
    let rows = [...suppliersCache];

    rows.sort((a, b) => {
        const va = a[suppliersSort.column] || "";
        const vb = b[suppliersSort.column] || "";
        const cmp = String(va).localeCompare(String(vb), "he");
        return suppliersSort.direction === "asc" ? cmp : -cmp;
    });

    const arrow = (col) => (suppliersSort.column === col ? (suppliersSort.direction === "asc" ? " ▲" : " ▼") : "");
    const addBtnHtml = `<button type="button" class="btn-primary" data-action="add-supplier">+ ספק חדש</button>`;

    if (rows.length === 0) {
        suppliersTableContainer.innerHTML = `
            <div class="view-header">${addBtnHtml}</div>
            <p class="muted">אין עדיין ספקים ברשימה. ניתן להוסיף ספק חדש כאן, או ישירות מכרטיס הלקוח בזמן קישור.</p>
        `;
        return;
    }

    const rowsHtml = rows.map((s) => `
        <tr class="table-row" data-id="${s.id}">
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.contact_person || "-")}</td>
            <td class="ltr-cell">${escapeHtml(s.phone || "-")}</td>
            <td>${escapeHtml(s.price_notes || "-")}</td>
            <td>
                <button type="button" class="btn-icon" data-action="edit-supplier" data-id="${s.id}" title="עריכה">✎</button>
                <button type="button" class="btn-icon" data-action="delete-supplier" data-id="${s.id}" title="מחיקה">🗑</button>
            </td>
        </tr>
    `).join("");

    suppliersTableContainer.innerHTML = `
        <div class="view-header">${addBtnHtml}</div>
        <table class="data-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="name">שם${arrow("name")}</th>
                    <th class="sortable" data-sort="contact_person">איש קשר${arrow("contact_person")}</th>
                    <th class="sortable" data-sort="phone">טלפון${arrow("phone")}</th>
                    <th>הערות</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

suppliersTableContainer.addEventListener("click", (e) => {
    const sortHeader = e.target.closest("th.sortable");
    if (sortHeader) {
        const col = sortHeader.dataset.sort;
        if (suppliersSort.column === col) {
            suppliersSort.direction = suppliersSort.direction === "asc" ? "desc" : "asc";
        } else {
            suppliersSort = { column: col, direction: "asc" };
        }
        renderSuppliersTable();
        return;
    }

    if (e.target.closest('[data-action="add-supplier"]')) {
        openSupplierFormModal();
        return;
    }

    const editBtn = e.target.closest('[data-action="edit-supplier"]');
    if (editBtn) {
        const supplier = suppliersCache.find((s) => s.id === editBtn.dataset.id);
        if (supplier) openSupplierFormModal(supplier);
        return;
    }

    const delBtn = e.target.closest('[data-action="delete-supplier"]');
    if (delBtn) {
        const id = delBtn.dataset.id;
        openConfirmModal("האם למחוק את הספק לגמרי מהרשימה הגלובלית? הפעולה בלתי הפיכה.", async () => {
            await deleteSupplier(id);
        }, "כן, למחוק");
        return;
    }
});

function openSupplierFormModal(existing = null) {
    const isEdit = !!existing;

    openModal(`
        <h2>${isEdit ? "עריכת ספק" : "ספק/קבלן חדש"}</h2>
        <form id="supplier-form">
            <label for="supplier-name">שם הספק/קבלן</label>
            <input type="text" id="supplier-name" value="${isEdit ? escapeHtml(existing.name) : ""}" required />

            <label for="supplier-contact">איש קשר</label>
            <input type="text" id="supplier-contact" value="${isEdit ? escapeHtml(existing.contact_person || "") : ""}" />

            <label for="supplier-phone">טלפון</label>
            <input type="tel" id="supplier-phone" dir="ltr" value="${isEdit ? escapeHtml(existing.phone || "") : ""}" />

            <label for="supplier-price-notes">הערות</label>
            <textarea id="supplier-price-notes" rows="3">${isEdit ? escapeHtml(existing.price_notes || "") : ""}</textarea>

            <div class="modal-actions">
                <button type="button" class="btn-ghost" id="supplier-form-cancel-btn">ביטול</button>
                <button type="submit" class="btn-primary">שמירה</button>
            </div>
        </form>
    `);

    document.getElementById("supplier-form-cancel-btn").addEventListener("click", closeModal);

    document.getElementById("supplier-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            name: document.getElementById("supplier-name").value.trim(),
            contact_person: document.getElementById("supplier-contact").value.trim() || null,
            phone: document.getElementById("supplier-phone").value.trim() || null,
            price_notes: document.getElementById("supplier-price-notes").value.trim() || null,
        };

        if (!payload.name) {
            showToast("יש להזין שם ספק", "error");
            return;
        }

        if (isEdit) {
            const { error } = await client.from("suppliers").update(payload).eq("id", existing.id);
            if (error) {
                showToast("שגיאה בשמירת הספק", "error");
                return;
            }
            Object.assign(existing, payload);
            showToast("הספק עודכן", "ok");
        } else {
            const { data: newSupplier, error } = await client.from("suppliers").insert(payload).select().single();
            if (error) {
                showToast("שגיאה ביצירת הספק", "error");
                return;
            }
            suppliersCache.push(newSupplier);
            showToast("הספק נוסף", "ok");
        }

        closeModal();
        renderSuppliersTable();
    });
}

async function deleteSupplier(id) {
    const { error } = await client.from("suppliers").delete().eq("id", id);
    if (error) {
        // כנראה נכשל כי הספק עדיין מקושר ללקוח אחד או יותר (foreign key constraint ב-client_suppliers)
        showToast("לא ניתן למחוק - הספק מקושר ללקוח אחד או יותר. יש להסיר קודם את הקישורים בכרטיסי הלקוחות.", "error");
        return;
    }

    suppliersCache = suppliersCache.filter((s) => s.id !== id);
    showToast("הספק נמחק", "ok");
    renderSuppliersTable();
}

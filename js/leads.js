// ============================================================
// מסך פניות (LEADS)
// ============================================================

const leadsTableContainer = document.getElementById("leads-table-container");
const newLeadBtn = document.getElementById("new-lead-btn");

let leadsCache = [];

async function loadLeadsView() {
    leadsTableContainer.innerHTML = `<p class="muted">טוענת פניות...</p>`;

    const { data, error } = await client
        .from("leads")
        .select("*")
        .order("contact_date", { ascending: false });

    if (error) {
        leadsTableContainer.innerHTML = `<p class="error-text">שגיאה בטעינת פניות: ${escapeHtml(error.message)}</p>`;
        return;
    }

    leadsCache = data || [];
    renderLeadsTable();
}

function renderLeadsTable() {
    if (leadsCache.length === 0) {
        leadsTableContainer.innerHTML = `<p class="muted">אין עדיין פניות. לחצי על "פנייה חדשה" כדי להתחיל.</p>`;
        return;
    }

    const rows = leadsCache.map((lead) => {
        const isIrrelevant = lead.status === LEAD_STATUS.IRRELEVANT;
        const rowClass = isIrrelevant ? "table-row dim" : "table-row";

        let actions = `<button class="btn-icon" data-action="edit-lead" data-id="${lead.id}">עריכה</button>`;

        if (lead.status === LEAD_STATUS.OPEN) {
            actions += `<button class="btn-small btn-primary" data-action="convert-lead" data-id="${lead.id}">המרה ללקוח</button>`;
            actions += `<button class="btn-small btn-ghost" data-action="mark-irrelevant" data-id="${lead.id}">לא רלוונטי</button>`;
        } else if (lead.status === LEAD_STATUS.IRRELEVANT) {
            actions += `<button class="btn-small btn-ghost" data-action="reopen-lead" data-id="${lead.id}">החזרה לפתוח</button>`;
        }

        return `
            <tr class="${rowClass}">
                <td>${escapeHtml(lead.full_name)}</td>
                <td class="ltr-cell">${escapeHtml(lead.phone)}</td>
                <td>${formatDate(lead.contact_date)}</td>
                <td>${escapeHtml(lead.source || "-")}</td>
                <td><span class="${statusBadgeClass(lead.status)}">${escapeHtml(lead.status)}</span></td>
                <td class="actions-cell">${actions}</td>
            </tr>
        `;
    }).join("");

    leadsTableContainer.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>שם מלא</th>
                    <th>טלפון</th>
                    <th>תאריך פנייה</th>
                    <th>מקור</th>
                    <th>סטטוס</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

leadsTableContainer.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const lead = leadsCache.find((l) => l.id === id);

    if (btn.dataset.action === "edit-lead") openLeadForm(lead);
    if (btn.dataset.action === "convert-lead") openConvertToClientForm(lead);
    if (btn.dataset.action === "mark-irrelevant") await setLeadStatus(id, LEAD_STATUS.IRRELEVANT);
    if (btn.dataset.action === "reopen-lead") await setLeadStatus(id, LEAD_STATUS.OPEN);
});

async function setLeadStatus(id, status) {
    const { error } = await client.from("leads").update({ status }).eq("id", id);
    if (error) {
        showToast("שגיאה בעדכון הסטטוס", "error");
        return;
    }
    showToast("הסטטוס עודכן", "ok");
    loadLeadsView();
}

newLeadBtn.addEventListener("click", () => openLeadForm(null));

// ---------- טופס פנייה (יצירה/עריכה) ----------

function openLeadForm(existingLead) {
    const isEdit = !!existingLead;
    const l = existingLead || { full_name: "", phone: "", contact_date: todayISO(), source: "", notes: "" };

    const sourceOptions = LEAD_SOURCES.map(
        (s) => `<option value="${s}" ${l.source === s ? "selected" : ""}>${s}</option>`
    ).join("");

    openModal(`
        <h2>${isEdit ? "עריכת פנייה" : "פנייה חדשה"}</h2>
        <form id="lead-form">
            <label for="lead-full-name">שם מלא *</label>
            <input type="text" id="lead-full-name" required value="${escapeHtml(l.full_name)}" />

            <label for="lead-phone">טלפון *</label>
            <input type="tel" id="lead-phone" required value="${escapeHtml(l.phone)}" dir="ltr" />
            <p id="lead-phone-warning" class="warning-text hidden"></p>

            <label for="lead-contact-date">תאריך פנייה *</label>
            <input type="date" id="lead-contact-date" required value="${l.contact_date || todayISO()}" />

            <label for="lead-source">מקור הפנייה</label>
            <select id="lead-source">
                <option value="">בחרי מקור...</option>
                ${sourceOptions}
            </select>

            <label for="lead-notes">הערות</label>
            <textarea id="lead-notes" rows="3">${escapeHtml(l.notes || "")}</textarea>

            <div class="modal-actions">
                <button type="button" class="btn-ghost" data-action="close-modal">ביטול</button>
                <button type="submit" class="btn-primary">שמירה</button>
            </div>
        </form>
    `);

    const phoneInput = document.getElementById("lead-phone");
    const warningEl = document.getElementById("lead-phone-warning");

    phoneInput.addEventListener("blur", async () => {
        const dup = await findPhoneDuplicate(phoneInput.value, { excludeLeadId: l.id });
        if (dup) {
            const where = dup.type === "lead" ? "פנייה קיימת" : "לקוח קיים";
            warningEl.textContent = `⚠ הטלפון הזה כבר קיים במערכת (${where}: ${dup.record.full_name}, סטטוס: ${dup.record.status}). ניתן להמשיך וליצור בכל זאת.`;
            warningEl.classList.remove("hidden");
        } else {
            warningEl.classList.add("hidden");
        }
    });

    document.getElementById("lead-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            full_name: document.getElementById("lead-full-name").value.trim(),
            phone: document.getElementById("lead-phone").value.trim(),
            contact_date: document.getElementById("lead-contact-date").value,
            source: document.getElementById("lead-source").value || null,
            notes: document.getElementById("lead-notes").value.trim() || null,
        };

        let error;
        if (isEdit) {
            ({ error } = await client.from("leads").update(payload).eq("id", l.id));
        } else {
            payload.status = LEAD_STATUS.OPEN;
            ({ error } = await client.from("leads").insert(payload));
        }

        if (error) {
            showToast("שגיאה בשמירת הפנייה", "error");
            return;
        }

        showToast(isEdit ? "הפנייה עודכנה" : "הפנייה נוצרה", "ok");
        closeModal();
        loadLeadsView();
    });
}

document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.closest('[data-action="close-modal"]')) closeModal();
});

// ---------- המרת פנייה ללקוח ----------

function openConvertToClientForm(lead) {
    openModal(`
        <h2>המרת פנייה ללקוח</h2>
        <p class="muted">נוצרת רשומת לקוח חדשה. פרטי הבית, הסגנון והמסלול יתווספו בהמשך לאחר פגישת הייעוץ.</p>
        <form id="convert-form">
            <label for="client-full-name">שם מלא *</label>
            <input type="text" id="client-full-name" required value="${escapeHtml(lead.full_name)}" />

            <label for="client-phone">טלפון *</label>
            <input type="tel" id="client-phone" required value="${escapeHtml(lead.phone)}" dir="ltr" />

            <label for="client-email">מייל</label>
            <input type="email" id="client-email" />

            <label for="client-address">כתובת הבית</label>
            <input type="text" id="client-address" />

            <div class="modal-actions">
                <button type="button" class="btn-ghost" data-action="close-modal">ביטול</button>
                <button type="submit" class="btn-primary">יצירת לקוח</button>
            </div>
        </form>
    `);

    document.getElementById("convert-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const clientPayload = {
            full_name: document.getElementById("client-full-name").value.trim(),
            phone: document.getElementById("client-phone").value.trim(),
            email: document.getElementById("client-email").value.trim() || null,
            address: document.getElementById("client-address").value.trim() || null,
            status: CLIENT_STATUSES[0],
            ball_in_court: BALL_IN_COURT.AVISHAG,
            created_at: todayISO(),
        };

        const { data: newClient, error: insertError } = await client
            .from("clients")
            .insert(clientPayload)
            .select()
            .single();

        if (insertError) {
            showToast("שגיאה ביצירת הלקוח", "error");
            return;
        }

        await createConsultationPayment(newClient.id);

        const { error: updateError } = await client
            .from("leads")
            .update({ status: LEAD_STATUS.CONVERTED, converted_client_id: newClient.id })
            .eq("id", lead.id);

        if (updateError) {
            showToast("הלקוח נוצר, אך עדכון הפנייה נכשל", "error");
        } else {
            showToast("הפנייה הומרה ללקוח בהצלחה", "ok");
        }

        closeModal();
        switchView("clients");
        openClientDetail(newClient.id);
    });
}

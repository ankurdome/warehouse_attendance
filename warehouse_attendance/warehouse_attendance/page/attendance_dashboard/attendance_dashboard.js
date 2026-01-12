frappe.pages['attendance-dashboard'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Attendance Dashboard',
        single_column: true
    });

    page.set_title('Warehouse Live Status');
    
    // Load the HTML template
    $(frappe.render_template('attendance_dashboard', {})).appendTo(page.main);
    
    // Initial data fetch
    refresh_dashboard(page);

    // Auto-refresh every 30 seconds
    setInterval(() => {
        refresh_dashboard(page);
    }, 30000);
};

function refresh_dashboard(page) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Warehouse Attendance Log",
            // IMPORTANT: Added verification_status and face_distance to fields
            fields: ["staff", "logtype", "selfie", "creation", "verification_status", "face_distance"],
            order_by: "creation desc",
            limit: 100
        },
        callback: function(r) {
            if (r.message) {
                render_cards(r.message);
            }
        }
    });
}

function render_cards(logs) {
    const grid = $('#staff-grid');
    const presentEl = $('#present-count');
    const awayEl = $('#away-count');

    if (!grid.length) return;
    
    grid.empty();
    let latest = {};
    let presentCount = 0;
    let awayCount = 0;

    // 1. Group by staff to get the latest entry for each person
    logs.forEach(l => { 
        if(!latest[l.staff]) {
            latest[l.staff] = l;
        }
    });

    // 2. Loop through the unique latest logs to build the UI
    Object.values(latest).forEach(log => {
        // Increment global counters based on IN/OUT status
        if (log.logtype === 'IN') {
            presentCount++;
        } else {
            awayCount++;
        }

        // Logic for Face Verification UI
        const v_status = log.verification_status || 'Pending';
        const is_failed = v_status === 'Failed';
        
        // Define visual styles based on verification result
        const cardClass = is_failed ? 'staff-card failed-verify' : 'staff-card';
        const badgeColor = is_failed ? '#dc3545' : (v_status === 'Success' ? '#28a745' : '#ffc107');
        const dotClass = log.logtype === 'IN' ? 'is-in' : 'is-out';

        // 3. Append the HTML to the grid
        grid.append(`
            <div class="${cardClass}">
                <img src="${log.selfie || '/assets/frappe/images/default-avatar.png'}" class="staff-photo">
                <div class="staff-info">
                    <b style="font-size: 1.1em;">${log.staff}</b><br>
                    <small><span class="status-dot ${dotClass}"></span> ${log.logtype}</small>
                    <div style="margin-top: 8px;">
                        <span class="status-badge" style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">
                            ${v_status}
                        </span>
                        ${log.face_distance ? `<br><small style="color: #999">Dist: ${log.face_distance.toFixed(2)}</small>` : ''}
                    </div>
                </div>
            </div>
        `);
    });

    // 4. Update the total counts at the top of the dashboard
    presentEl.text(presentCount);
    awayEl.text(awayCount);
}
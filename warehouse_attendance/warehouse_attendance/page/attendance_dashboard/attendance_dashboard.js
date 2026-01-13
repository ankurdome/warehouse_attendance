frappe.pages['attendance-dashboard'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Attendance Dashboard',
        single_column: true
    });

    page.set_title('Warehouse Live Status');
    $(frappe.render_template('attendance_dashboard', {})).appendTo(page.main);
    
    refresh_dashboard(page);
    setInterval(() => { refresh_dashboard(page); }, 30000);
};

function refresh_dashboard(page) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Warehouse Attendance Log",
            // Ensure lowercase and no extra spaces here
            fields: ["staff", "logtype", "selfie", "creation", "verification_status", "work_hours", "location", "is_near_warehouse"],
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
    grid.empty();
    
    let latest = {};
    let presentCount = 0;
    let awayCount = 0;

    logs.forEach(l => { if(!latest[l.staff]) latest[l.staff] = l; });

    Object.values(latest).forEach(log => {
        if (log.logtype === 'IN') presentCount++; else awayCount++;

        const v_status = log.verification_status || 'Pending';
        const aiColor = v_status === 'Success' ? '#28a745' : (v_status === 'Failed' ? '#dc3545' : '#ffc107');
        
        // Format the system creation time
        const timeDisplay = frappe.datetime.get_time(log.creation);
        
        // 1. Work Hours UI (Only shows for the most recent OUT log)
        let workHoursHTML = '';
        if (log.logtype === 'OUT' && log.work_hours) {
            workHoursHTML = `
                <div class="work-hours" style="color: #2b78ff; font-weight: bold; margin-top: 5px; font-size: 12px;">
                    ⏱️ Shift: ${log.work_hours} hrs
                </div>`;
        }

        // 2. Geofencing UI
        const isNear = String(log.is_near_warehouse) === "1";
        let locationHTML = (log.location && log.location.length > 10) 
            ? `<span style="color: ${isNear ? '#28a745' : '#dc3545'}">${isNear ? '✅ On Site' : '🚨 Off Site'}</span>`
            : `<span style="color: #999">📍 GPS Off</span>`;

        grid.append(`
            <div class="staff-card ${v_status === 'Failed' ? 'failed-verify' : ''}">
                <img src="${log.selfie || '/assets/frappe/images/default-avatar.png'}" class="staff-photo">
                <div class="staff-info">
                    <span class="staff-name">${log.staff}</span>
                    <div style="font-size: 11px; color: #666;">
                        <b>${log.logtype}</b> at ${timeDisplay}
                    </div>
                    
                    ${workHoursHTML}

                    <div class="badge-container" style="margin-top: 10px; font-size: 10px;">
                        ${locationHTML}  
                        <span class="status-badge" style="background: ${aiColor}; color: white; padding: 1px 4px; border-radius: 3px;">
                            AI: ${v_status}
                        </span>
                         
                    </div>
                </div>
            </div>
        `);
    });

    $('#present-count').text(presentCount);
    $('#away-count').text(awayCount);
}
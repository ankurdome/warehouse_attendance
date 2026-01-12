frappe.pages['attendance-dashboard'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Attendance Dashboard',
        single_column: true
    });

    // Use the breadcrumb to verify you are in the right place
    page.set_title('Warehouse Live Status');
    
    // Load the HTML template
    $(frappe.render_template('attendance_dashboard', {})).appendTo(page.main);
    
    // Initial data fetch
    refresh_dashboard(wrapper);
};

function refresh_dashboard(wrapper) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Warehouse Attendance Log",
            fields: ["staff", "logtype", "selfie", "creation"],
            order_by: "creation desc",
            limit: 50
        },
        callback: function(r) {
            if (r.message) {
                render_cards(r.message);
            }
        }
    });
}

function render_cards(logs) {
    const grid = $(document).find('#staff-grid');
    const presentEl = $(document).find('#present-count');
    const awayEl = $(document).find('#away-count');

    if (!grid.length) return;
    
    grid.empty();
    let latest = {};
    let presentCount = 0;
    let awayCount = 0;

    // 1. Filter for the most recent log per person
    logs.forEach(l => { 
        if(!latest[l.staff]) {
            latest[l.staff] = l;
            // 2. Increment counters based on the latest status
            if (l.logtype === 'IN') {
                presentCount++;
            } else {
                awayCount++;
            }
        }
    });

    // 3. Update the UI Counters
    presentEl.text(presentCount);
    awayEl.text(awayCount);

    // 4. Render the Cards
    Object.values(latest).forEach(log => {
        const dot = log.logtype === 'IN' ? 'is-in' : 'is-out';
        grid.append(`
            <div class="staff-card">
                <img src="${log.selfie || '/assets/frappe/images/default-avatar.png'}" class="staff-photo">
                <div class="staff-info">
                    <b style="font-size: 1.1em;">${log.staff}</b><br>
                    <small><span class="status-dot ${dot}"></span> ${log.logtype}</small>
                </div>
            </div>
        `);
    });
}
frappe.pages['attendance-dashboard'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Warehouse Live Status',
        single_column: true
    });

    // --- FIX: Button must be inside on_page_load ---
    page.add_inner_button('View Detailed Analytics', function() {
        frappe.set_route('staff-analytics');
    });

    $(wrapper).find('.layout-main-section').empty().append(frappe.render_template("attendance_dashboard", {}));

    // Setup Event Listeners
    $(wrapper).on('change', '#filter-logtype, #filter-verification, #filter-date', () => refresh_dashboard(wrapper));
    $(wrapper).on('keyup', '#filter-search', () => refresh_dashboard(wrapper));

    // Initial load and auto-refresh
    refresh_dashboard(wrapper);
    setInterval(() => refresh_dashboard(wrapper), 60000);
};

function refresh_dashboard(wrapper) {
    let filters = [];
    let search = $(wrapper).find('#filter-search').val();
    let logtype = $(wrapper).find('#filter-logtype').val();
    let verification = $(wrapper).find('#filter-verification').val();
    let date = $(wrapper).find('#filter-date').val() || frappe.datetime.get_today();

    if (search) filters.push(["employee_name", "like", `%${search}%`]);
    if (logtype) filters.push(["logtype", "=", logtype]);
    if (verification) filters.push(["verification_status", "=", verification]);
    
    filters.push(["creation", "between", [date + " 00:00:00", date + " 23:59:59"]]);

    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Staff Daily Working Hours",
            filters: {"date": date},
            fields: ["employee", "working_hours"]
        },
        callback: function(h) {
            let hours_map = {};
            if (h.message) {
                h.message.forEach(row => { hours_map[row.employee] = row.working_hours; });
            }

            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Warehouse Attendance Log",
                    filters: filters,
                    fields: ["name", "staff", "employee_name", "logtype", "selfie", "creation", "verification_status", "work_hours", "location"],
                    order_by: "creation desc",
                    limit: 40
                },
                callback: function(r) {
                    if (r.message) {
                        render_staff_cards(wrapper, r.message, hours_map);
                        update_stats(wrapper, r.message);
                    }
                }
            });
        }
    });
}

function render_staff_cards(wrapper, logs, hours_map) {
    let $grid = $(wrapper).find('#staff-grid').empty();
    
    if (!logs || logs.length === 0) {
        $grid.append('<div class="no-data">No activity found for this period.</div>');
        return;
    }

    logs.forEach(log => {
        let status_class = "";
        let status_text = log.verification_status || "Pending";

        if (status_text === 'Success') status_class = "status-green";
        else if (status_text === 'Pending') status_class = "status-yellow";
        else if (status_text === 'Failed') status_class = "status-red";
        
        let log_class = log.logtype === 'IN' ? 'tag-in' : 'tag-out';
        
        // Use the format_hours function for the badge
        let total_hrs_raw = hours_map[log.staff] || 0;
        let formatted_time = format_hours(total_hrs_raw);
        
        let location_btn = "";
        if (log.location) {
            try {
                const loc = typeof log.location === 'string' ? JSON.parse(log.location) : log.location;
                const coords = loc.features[0].geometry.coordinates;
                const map_url = `https://www.google.com/maps?q=${coords[1]},${coords[0]}`;
                location_btn = `<a href="${map_url}" target="_blank" class="location-btn">📍 Map</a>`;
            } catch (e) { console.log("Map error"); }
        }

        $grid.append(`
            <div class="staff-card ${status_text === 'Failed' ? 'flagged' : ''}">
                <div class="photo-wrapper">
                    <img src="${log.selfie || '/assets/frappe/images/default-avatar.png'}" class="staff-photo">
                    <span class="log-type-tag ${log_class}">${log.logtype}</span>
                </div>
                <div class="staff-content">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <span class="staff-name">${log.employee_name || log.staff}</span>
                            <span class="staff-time">${frappe.datetime.get_time(log.creation)}</span>
                        </div>
                        <div class="hours-badge">
                             ⏱️ ${formatted_time}
                        </div>
                    </div>
                    
                    <div class="card-footer">
                        <span class="ai-label ${status_class}">
                            ${status_text}
                        </span>
                        ${location_btn}
                    </div>
                </div>
            </div>
        `);
    });
}

function update_stats(wrapper, logs) {
    const unique_staff = {};
    logs.forEach(log => {
        if (!unique_staff[log.staff]) {
            unique_staff[log.staff] = log.logtype;
        }
    });

    const values = Object.values(unique_staff);
    const present = values.filter(v => v === 'IN').length;
    const away = values.filter(v => v === 'OUT').length;

    $(wrapper).find('#present-count').text(present);
    $(wrapper).find('#away-count').text(away);
}

// FORMATTER: Converts decimal 5.12 to "5h 7m"
function format_hours(decimal_hours) {
    if (!decimal_hours || decimal_hours <= 0) return "0h 0m";
    let hours = Math.floor(decimal_hours);
    let minutes = Math.round((decimal_hours - hours) * 60);
    return `${hours}h ${minutes}m`;
}
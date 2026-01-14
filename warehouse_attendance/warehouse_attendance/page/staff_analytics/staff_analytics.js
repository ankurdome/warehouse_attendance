frappe.pages['staff-analytics'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Workforce Insights',
        single_column: true
    });

    $(wrapper).find('.layout-main-section').empty().append(frappe.render_template("staff_analytics", {}));

    refresh_analytics(wrapper);

 
    page.set_primary_action('Refresh Data', () => refresh_analytics(wrapper));

    page.add_inner_button('Back to Dashboard', () => {
        frappe.set_route('attendance-dashboard');
    });
};

function refresh_analytics(wrapper) {
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Staff Daily Working Hours',
            fields: ['name', 'employee', 'employee_name', 'working_hours', 'attendance_log'],
            filters: { 'date': frappe.datetime.get_today() },
            order_by: 'working_hours desc'
        },
        callback: function(r) {
            let data = r.message || [];
            
            // --- FIXED MATH LOGIC ---
            let total_decimal = 0;
            data.forEach(d => {
                total_decimal += (parseFloat(d.working_hours) || 0);
            });

            let active_count = data.length;
            let avg_decimal = active_count > 0 ? (total_decimal / active_count) : 0;

            // Update Cards UI - using wrapper find to ensure we hit the right elements
            $(wrapper).find('#total-hours-val').text(format_hours_short(total_decimal));
            $(wrapper).find('#active-staff-val').text(active_count);
            $(wrapper).find('#avg-hours-val').text(format_hours_short(avg_decimal));

            render_employee_rows(wrapper, data);
            render_analytics_chart(data);
        }
    });
}

function render_employee_rows(wrapper, data) {
    let $container = $(wrapper).find('#employee-list-container').empty();

    data.forEach(row => {
        let log_ids = JSON.parse(row.attendance_log || "[]");
        
        let $row = $(`
            <div class="employee-detail-row" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="background: #42a5f5; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                        ${row.employee_name.charAt(0)}
                    </div>
                    <div>
                        <div style="font-weight: bold; color: #2c3e50;">${row.employee_name}</div>
                        <div style="font-size: 12px; color: #888;">ID: ${row.employee} • ${log_ids.length} sessions</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: bold; color: #42a5f5;">${format_hours_short(row.working_hours)}</div>
                    <div style="font-size: 11px; color: #42a5f5;">View Timeline →</div>
                </div>
            </div>
        `).appendTo($container);

        // Click Event: Open the Daily Hours Document to see all linked logs
        $row.on('click', () => {
            frappe.set_route('Form', 'Staff Daily Working Hours', row.name);
        });

        // Hover effect
        $row.hover(
            function() { $(this).css('background-color', '#f1f8ff'); },
            function() { $(this).css('background-color', 'transparent'); }
        );
    });
}

function render_analytics_chart(data) {
    let labels = data.map(d => d.employee_name);
    let values = data.map(d => d.working_hours);

    new frappe.Chart("#staff-work-chart", {
        data: {
            labels: labels,
            datasets: [{ values: values }]
        },
        type: 'bar', // Can change to 'line' or 'percentage'
        height: 350,
        colors: ['#42a5f5'],
        barOptions: { spaceRatio: 0.5 },
        tooltipOptions: {
            formatTooltipY: d => format_hours_short(d)
        }
    });
}

// Helper for readable time
function format_hours_short(decimal) {
    let h = Math.floor(decimal);
    let m = Math.round((decimal - h) * 60);
    return `${h}h ${m}m`;
}
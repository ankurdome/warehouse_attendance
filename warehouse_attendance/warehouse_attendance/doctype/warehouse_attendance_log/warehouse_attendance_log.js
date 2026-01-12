// frappe.web_form.on('after_load', () => {
//     // This alert will pop up if the script is successfully loaded by the browser
//     alert("Automation Script Active");
//     set_warehouse_data();
// });

// // Refresh when selfie is clicked
// frappe.web_form.on('selfie', () => {
//     set_warehouse_data();
// });

// function set_warehouse_data() {
//     // 1. Generate/Get Device ID
//     let d_id = localStorage.getItem('warehouse_device_id') || 'WHS-' + Math.random().toString(36).substr(2, 6).toUpperCase();
//     localStorage.setItem('warehouse_device_id', d_id);

//     // 2. Set Deviceid (Matches your Web Form Capitalization)
//     frappe.web_form.set_value('Deviceid', d_id);

//     // 3. Set Timestamp (Matches your Web Form Capitalization)
//     let now = new Date().toISOString().slice(0, 19).replace('T', ' ');
//     frappe.web_form.set_value('Timestamp', now);

//     // 4. Set Location (Matches your Web Form Capitalization)
//     if (navigator.geolocation) {
//         navigator.geolocation.getCurrentPosition((position) => {
//             const geo_json = JSON.stringify({
//                 "type": "FeatureCollection",
//                 "features": [{
//                     "type": "Feature",
//                     "properties": {},
//                     "geometry": {
//                         "type": "Point",
//                         "coordinates": [position.coords.longitude, position.coords.latitude]
//                     }
//                 }]
//             });
//             frappe.web_form.set_value('Location', geo_json);
//         });
//     }
// }
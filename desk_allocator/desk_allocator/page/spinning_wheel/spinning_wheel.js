frappe.pages['spinning_wheel'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Desk Allocation Spinner',
        single_column: true
    });

    $(wrapper).find('.layout-main-section').append(`
        <style>
            #canvas { transition: transform 4s cubic-bezier(0.15, 0, 0.15, 1); border: 5px solid #333; border-radius: 50%; }
            .spinner-box { padding: 40px; background: #f8f9fa; border-radius: 10px; text-align: center; }
            .controls { margin-bottom: 20px; max-width: 400px; margin-left: auto; margin-right: auto; display: flex; gap: 10px; flex-direction: column; }
            .allocated-badge { background: #d4edda; color: #155724; font-size: 12px; padding: 2px 8px; border-radius: 10px; margin-left: 10px; }
        </style>
        <div class="spinner-box">
            <div class="controls">
                <label>Select Department:</label>
                <select id="dept_select" class="form-control"></select>
                <button class="btn btn-default btn-sm" id="reset_bays">Reset Wheel & Allocations</button>
            </div>
            <div id="wheel-container" style="position: relative; display: inline-block;">
                <div style="position: absolute; top: -25px; left: 50%; transform: translateX(-50%); z-index: 10; color: #e74c3c; font-size: 40px;">▼</div>
                <canvas id="canvas" width="400" height="400"></canvas>
            </div>
            <div style="margin-top: 30px;">
                <button class="btn btn-primary btn-lg" id="spin_button">SPIN THE WHEEL</button>
            </div>
            <div id="result-display" style="margin-top: 20px; font-size: 20px; font-weight: bold; color: #2c3e50;"></div>
            <div id="allocation-log" style="margin-top: 20px; text-align: left; max-width: 400px; margin-left: auto; margin-right: auto;">
                <h5>Current Session Allocations:</h5>
                <ul id="log_list" class="list-group"></ul>
            </div>
        </div>
    `);

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const spinBtn = document.getElementById('spin_button');
    const deptSelect = document.getElementById('dept_select');
    const resultDiv = document.getElementById('result-display');
    const logList = document.getElementById('log_list');
    
    let currentRotation = 0;
    let availableBays = [];
    let allBays = [];
    let usedDepartments = []; // TRACKING ARRAY

    // Fetch Unique Departments
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Employee",
            fields: ["department"],
            filters: { status: "Active" },
            group_by: "department"
        },
        callback: function(r) {
            if (r.message) {
                $(deptSelect).empty().append('<option value="">-- Select Department --</option>');
                r.message.map(emp => emp.department).filter(d => d).sort().forEach(dept => {
                    $(deptSelect).append(`<option value="${dept}">${dept}</option>`);
                });
            }
        }
    });

    function loadBays() {
        frappe.db.get_list('Office Bay', { fields: ['name'] }).then(records => {
            allBays = records.map(r => r.name);
            availableBays = [...allBays];
            drawWheel(availableBays);
        });
    }
    loadBays();

    function drawWheel(labels) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (labels.length === 0) {
            ctx.fillStyle = "#999";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("All Bays Allocated", 200, 200);
            return;
        }
        const sectorAngle = (2 * Math.PI) / labels.length;
        const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c'];

        labels.forEach((label, i) => {
            ctx.beginPath();
            ctx.fillStyle = colors[i % colors.length];
            ctx.moveTo(200, 200);
            ctx.arc(200, 200, 200, i * sectorAngle, (i + 1) * sectorAngle);
            ctx.lineTo(200, 200);
            ctx.fill();
            ctx.stroke();

            ctx.save();
            ctx.translate(200, 200);
            ctx.rotate(i * sectorAngle + sectorAngle / 2);
            ctx.textAlign = "right";
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(label, 180, 5);
            ctx.restore();
        });
    }

    spinBtn.onclick = () => {
        const dept = $(deptSelect).val();
        
        // --- NEW SECURITY CHECKS ---
        if(!dept) return frappe.msgprint("Please select a Department first!");
        
        if(usedDepartments.includes(dept)) {
            return frappe.msgprint({
                title: __('Already Allocated'),
                indicator: 'orange',
                message: __(`The <b>${dept}</b> department already has a bay assigned. Please choose another.`)
            });
        }

        if(availableBays.length === 0) return frappe.msgprint("No more bays left in the office!");
        // ---------------------------

        const randomDegree = Math.floor(3600 + Math.random() * 3600);
        currentRotation += randomDegree;
        canvas.style.transform = `rotate(${currentRotation}deg)`;

        spinBtn.disabled = true;
        resultDiv.innerText = "Spinning...";

        setTimeout(() => {
            spinBtn.disabled = false;
            
            const actualRotation = currentRotation % 360;
            const sectorSize = 360 / availableBays.length;
            const winningIndex = Math.floor((360 - actualRotation % 360) / sectorSize) % availableBays.length;
            const winner = availableBays[winningIndex];

            // CALL PYTHON FOR DESK SHUFFLING
            frappe.call({
                method: "desk_allocator.desk_allocator.page.spinning_wheel.spinning_wheel.save_and_allocate",
                args: {
                    department: dept,
                    bay: winner
                },
                callback: function(r) {
                    if (r.message.status === "success") {
                        resultDiv.innerHTML = `Result: ${dept} -> ${winner}<br><small>Desks Allocated Successfully!</small>`;
                        
                        // Show the random desk results in the log
                        let deskDetails = r.message.allocations.map(a => `<div>${a.employee}: <b>${a.desk}</b></div>`).join("");
                        
                        $(logList).append(`
                            <li class="list-group-item">
                                <b>${dept} (${winner})</b>
                                <div style="font-size: 12px; margin-top: 5px; color: #666;">
                                    ${deskDetails}
                                </div>
                            </li>
                        `);

                        usedDepartments.push(dept);
                        availableBays.splice(winningIndex, 1);
                        
                        // Reset wheel position
                        setTimeout(() => {
                            canvas.style.transition = "none";
                            currentRotation = 0;
                            canvas.style.transform = `rotate(0deg)`;
                            drawWheel(availableBays);
                            setTimeout(() => { canvas.style.transition = "transform 4s cubic-bezier(0.15, 0, 0.15, 1)"; }, 50);
                        }, 2000);
                    } else {
                        frappe.msgprint(r.message.message);
                    }
                }
            });
        }, 4000);
    };

    document.getElementById('reset_bays').onclick = () => {
        availableBays = [...allBays];
        usedDepartments = []; // Clear used departments
        $(logList).empty();
        resultDiv.innerText = "";
        drawWheel(availableBays);
        frappe.show_alert("System Reset!");
    };
}
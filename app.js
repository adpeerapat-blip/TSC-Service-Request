    // --- CONFIGURATION ---
    // !!! สำคัญ: กรุณานำ URL ที่ได้จากการ Deploy Google Apps Script มาวางที่นี่
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzoVYVcBpGVQvwczH7J0iB37aO1-q5p3Ixg-3wo55CsgEnm4e3Td-w026qDQI7JEO5rhA/exec';
    
    // --- STATE MANAGEMENT ---
    let currentUserData = null; // Store logged in user's full data object
    let dropdownData = {}; // Store all dropdown data
    let isUsingSavedSignature = false;
    let selectedFiles = []; // Array to hold selected files for upload
    let allJobsCache = []; // Cache all jobs to improve performance
    let allCustomersCache = []; // Cache all customer data
    let currentCustomerPage = 1;
    let filteredCustomersCache = [];
    let currentActivityPage = 1; // For dashboard pagination
    let currentDashboardJobs = []; // For dashboard filtering and pagination
    let currentDashboardFilter = 'all'; // <-- START CHANGE: เพิ่ม state สำหรับ filter หน้า Dashboard
    let currentApprovalFilter = 'all';
    let currentReceiveFilter = 'all'; // เพิ่ม state สำหรับ filter หน้า Receive Job
    let currentApprovalPage = 1;
    let currentJobsPage = 1;
    let currentHistoryPage = 1;
    let currentReceivePage = 1;
    let currentClosePage = 1;
    let userEmailToNameMap = {}; // Map email -> FullName for display purposes

    // --- DOM ELEMENTS ---
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const pageLoader = document.getElementById('page-loader');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const forgotPasswordView = document.getElementById('forgot-password-view');
    const allViews = document.querySelectorAll('.view-content');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const jobRequestForm = document.getElementById('jobRequestForm');
    const profileUpdateForm = document.getElementById('profile-update-form');
    const signatureUpdateForm = document.getElementById('signature-update-form');

    // Signature Pads
    let signaturePad, newSignaturePad;

    // --- UTILITY FUNCTIONS ---
    let activeApiCallsCount = 0;
    function showLoading() {
        activeApiCallsCount++;
        if (pageLoader) {
            // Hide corner loader if SweetAlert2 loading is active to prevent overlapping spinners
            const isSwalLoading = Swal.isVisible() && Swal.isLoading();
            if (!isSwalLoading) {
                pageLoader.classList.remove('hidden');
            }
        }
    }
    function hideLoading() {
        activeApiCallsCount--;
        if (activeApiCallsCount <= 0) {
            activeApiCallsCount = 0;
            // Delay hiding to ensure the DOM has completed its rendering and repainting
            setTimeout(() => {
                if (activeApiCallsCount === 0 && pageLoader) {
                    pageLoader.classList.add('hidden');
                }
            }, 300);
        }
    }
    
    function showAlert(message, type = 'success') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });

        Toast.fire({
            icon: type,
            title: message
        });
    }
    
    function getStatusBadge(status) {
        let colorClasses = 'bg-slate-50 text-slate-700 border border-slate-200/50'; // Default
        let iconHtml = '<i class="fa-regular fa-circle-question mr-1.5 text-[10px]"></i>';
        if (status.includes('รออนุมัติ')) {
            colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200/50';
            iconHtml = '<i class="fa-regular fa-clock mr-1.5 text-[10px]"></i>';
        } else if (status.includes('รอรับงาน')) {
            colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200/50';
            iconHtml = '<i class="fa-solid fa-hourglass-start mr-1.5 text-[10px]"></i>';
        } else if (status.includes('กำลังดำเนินการ') || status.includes('รับงานแล้ว')) {
            colorClasses = 'bg-indigo-50 text-indigo-700 border border-indigo-200/50';
            iconHtml = '<i class="fa-solid fa-screwdriver-wrench mr-1.5 text-[10px]"></i>';
        } else if (status.includes('ปิดงาน')) {
            colorClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200/50';
            iconHtml = '<i class="fa-regular fa-circle-check mr-1.5 text-[10px]"></i>';
        } else if (status.includes('ไม่อนุมัติ') || status.includes('ปฏิเสธ')) {
            colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200/50';
            iconHtml = '<i class="fa-regular fa-circle-xmark mr-1.5 text-[10px]"></i>';
        }
        return `<span class="status-badge ${colorClasses}">${iconHtml}${status}</span>`;
    }

    function updateSidebarBadges(jobsList) {
        if (!currentUserData) return;
        
        // 1. Update Approval Badge
        const userLevel = currentUserData.ApprovalLevel;
        if (userLevel) {
            const jobsToApprove = jobsList.filter(job => {
                const status = job['สถานะ'];
                return (userLevel.includes('Level1') && status === 'รออนุมัติ Level 1') || (userLevel.includes('Level2') && status === 'รออนุมัติ Level 2');
            });
            const approvalBadge = document.getElementById('approval-badge');
            if (approvalBadge) {
                approvalBadge.textContent = jobsToApprove.length;
                approvalBadge.classList.toggle('hidden', jobsToApprove.length === 0);
            }
        }

        // 2. Update Receive/Close Job Badge
        const canAcceptJobs = currentUserData.CanAcceptJobs === 'TRUE' || currentUserData.CanAcceptJobs === true || currentUserData.Role === 'Admin' || currentUserData.Role === 'Manager';
        if (canAcceptJobs) {
            const isAdmin = currentUserData.Role === 'Admin';
            const isAdminOrManager = currentUserData.Role === 'Admin' || currentUserData.Role === 'Manager';

            // Filter count for "งานที่รอรับ"
            const userCanAccept = currentUserData.CanAcceptJobs === 'TRUE' || currentUserData.CanAcceptJobs === true;
            const receiveCount = userCanAccept ? jobsList.filter(j => {
                if (j['สถานะ'] !== 'รอรับงาน') return false;
                if (j['ผู้รับงานจริง']) return false;
                if (isAdmin) return true;
                return j['ผู้รับผิดชอบ']?.includes(currentUserData.Email);
            }).length : 0;

            // Filter count for "งานที่ต้องปิด"
            const closeCount = jobsList.filter(j => {
                if (j['สถานะ'] !== 'กำลังดำเนินการ') return false;
                if (isAdminOrManager) return true;
                return j['ผู้รับงานจริง'] === currentUserData.Email;
            }).length;

            const totalReceiveClose = receiveCount + closeCount;
            // Update separate badges for pending receive (red) and pending close (amber)
            const pendingBadge = document.getElementById('receive-menu-badge-pending');
            if (pendingBadge) {
                pendingBadge.textContent = receiveCount;
                pendingBadge.classList.toggle('hidden', receiveCount === 0);
            }
            const closeBadge = document.getElementById('receive-menu-badge-close');
            if (closeBadge) {
                closeBadge.textContent = closeCount;
                closeBadge.classList.toggle('hidden', closeCount === 0);
            }
            // Backward-compat: keep old badge hidden
            const legacyBadge = document.getElementById('receive-menu-badge');
            if (legacyBadge) legacyBadge.classList.add('hidden');
        }
    }

    // --- FIREBASE DIRECT API CALL (FOR BLAGING SPEED!) ---
    async function firebaseApiCall(action, payload) {
        const dbUrl = 'https://tsc-work-notification-default-rtdb.asia-southeast1.firebasedatabase.app/';
        
        async function getDb(path) {
            const res = await fetch(dbUrl + path + '.json');
            return await res.json();
        }
        
        async function putDb(path, data) {
            const res = await fetch(dbUrl + path + '.json', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await res.json();
        }

        async function patchDb(path, data) {
            const res = await fetch(dbUrl + path + '.json', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await res.json();
        }
        
        async function hashPasswordJs(password) {
            const msgUint8 = new TextEncoder().encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function encodeEmailJs(email) {
            if (!email) return "";
            return email.replace(/\./g, ',');
        }

        try {
            switch (action) {
                case 'login': {
                    const { email, password } = payload;
                    if (!email || !password) throw new Error("ต้องระบุอีเมลและรหัสผ่าน");
                    const encodedEmail = encodeEmailJs(email);
                    const user = await getDb("users/" + encodedEmail);
                    if (user) {
                        const storedHash = user.PasswordHash;
                        const inputHash = await hashPasswordJs(password);
                        if (storedHash === inputHash) {
                            return { status: "success", message: "เข้าสู่ระบบสำเร็จ" };
                        }
                    }
                    throw new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
                }
                case 'signup': {
                    const { fullName, email, phone, department, password } = payload;
                    if (!fullName || !email || !phone || !department || !password) throw new Error("ต้องกรอกข้อมูลทุกช่องเพื่อสมัครสมาชิก");
                    
                    const encodedEmail = encodeEmailJs(email);
                    const existingUser = await getDb("users/" + encodedEmail);
                    if (existingUser) {
                        throw new Error("อีเมลนี้ถูกลงทะเบียนแล้ว");
                    }
                    
                    await firebaseApiCall('addDropdownItem', { type: 'department', value: department, silent: true });
                    
                    const rawUsers = await getDb("users") || {};
                    const newUserId = `USER-${(Object.keys(rawUsers).length + 1).toString().padStart(3, '0')}`;
                    const hash = await hashPasswordJs(password);
                    
                    const newUser = {
                        UserID: newUserId,
                        FullName: fullName,
                        Email: email,
                        Phone: String(phone),
                        Department: department,
                        PasswordHash: hash,
                        SignatureURL: '',
                        Role: 'User',
                        ApprovalLevel: '',
                        CanAcceptJobs: 'FALSE'
                    };
                    await putDb("users/" + encodedEmail, newUser);
                    return { status: "success", message: "สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ" };
                }
                case 'getUserData': {
                    const email = payload.email || payload.userEmail;
                    if (!email) throw new Error("ต้องระบุพารามิเตอร์อีเมล");
                    const encodedEmail = encodeEmailJs(email);
                    const user = await getDb("users/" + encodedEmail);
                    if (user) {
                        const userData = { ...user };
                        delete userData.PasswordHash;
                        return { status: "success", data: userData };
                    }
                    throw new Error("ไม่พบผู้ใช้งาน");
                }
                case 'updateProfile': {
                    const encodedEmail = encodeEmailJs(payload.email);
                    const user = await getDb("users/" + encodedEmail);
                    if (!user) throw new Error("ไม่พบผู้ใช้งาน");
                    
                    const updateData = {
                        FullName: payload.fullName,
                        Phone: String(payload.phone),
                        Department: payload.userDepartment
                    };
                    await firebaseApiCall('addDropdownItem', { type: 'department', value: payload.userDepartment, silent: true });
                    if (payload.newPassword) {
                        updateData.PasswordHash = await hashPasswordJs(payload.newPassword);
                    }
                    await patchDb("users/" + encodedEmail, updateData);
                    return { status: "success", message: "บันทึกข้อมูลส่วนตัวสำเร็จ!" };
                }
                case 'getAllJobs': {
                    const userEmailForJobs = payload.userEmail;
                    const encodedEmail = encodeEmailJs(userEmailForJobs);
                    const user = await getDb("users/" + encodedEmail);
                    const rawJobsMap = await getDb("jobs") || {};
                    let allJobs = Object.values(rawJobsMap);
                    allJobs = allJobs.filter(Boolean);
                    if (user) {
                        const role = user.Role;
                        const department = user.Department;
                        let jobsData = (role === 'User' && department) ? allJobs.filter(row => row && row["หน่วยงาน"] === department) : allJobs;
                        jobsData = jobsData.filter(Boolean);
                        return { status: "success", data: jobsData };
                    }
                    return { status: "success", data: [] };
                }
                case 'getJobDetails': {
                    const { jobId } = payload;
                    if (!jobId) throw new Error("ต้องระบุ Job ID");
                    const jobDetails = await getDb("jobs/" + jobId);
                    if (!jobDetails) throw new Error("ไม่พบใบงาน");
                    
                    const rawUsersMap = await getDb("users") || {};
                    const users = Object.values(rawUsersMap);
                    const userMap = users.reduce((map, u) => {
                        if (u && u.Email) map[u.Email] = { name: u.FullName, signature: u.SignatureURL };
                        return map;
                    }, {});
                    const approverL1 = userMap[jobDetails["ผู้อนุมัติ Level 1"]] || {};
                    jobDetails.SignatureL1 = approverL1.signature || '';
                    jobDetails.ApproverL1Name = approverL1.name || '...................................';
                    const approverL2 = userMap[jobDetails["ผู้อนุมัติ Level 2"]] || {};
                    jobDetails.SignatureL2 = approverL2.signature || '';
                    jobDetails.ApproverL2Name = approverL2.name || '...................................';
                    const actualReceiver = userMap[jobDetails["ผู้รับงานจริง"]] || {};
                    jobDetails.ActualReceiverName = actualReceiver.name || jobDetails['ผู้รับผิดชอบ'] || '...................................';
                    jobDetails.ActualReceiverSignature = actualReceiver.signature || '';
                    return { status: "success", data: jobDetails };
                }
                case 'processApproval': {
                    const { jobId, isApproved, reason, approverEmail, assignedTo } = payload;
                    const jobData = await getDb("jobs/" + jobId);
                    if (!jobData) throw new Error("ไม่พบใบงาน");
                    const currentStatus = jobData["สถานะ"];
                    const updateData = {};
                    
                    if (currentStatus === "รออนุมัติ Level 1") {
                        updateData["ผู้อนุมัติ Level 1"] = approverEmail;
                        updateData["เหตุผล L1"] = reason;
                        updateData["วันที่ L1"] = new Date().toISOString();
                        if (isApproved) {
                            updateData["ผู้รับผิดชอบ"] = assignedTo.join(',');
                            updateData["สถานะ"] = "รออนุมัติ Level 2";
                        } else {
                            updateData["สถานะ"] = "ไม่อนุมัติ L1";
                        }
                    } else if (currentStatus === "รออนุมัติ Level 2") {
                        updateData["ผู้อนุมัติ Level 2"] = approverEmail;
                        updateData["เหตุผล L2"] = reason;
                        updateData["วันที่ L2"] = new Date().toISOString();
                        updateData["สถานะ"] = isApproved ? "รอรับงาน" : "ไม่อนุมัติ L2";
                    } else throw new Error("ใบงานนี้ไม่อยู่ในสถานะที่จะอนุมัติได้");
                    await patchDb("jobs/" + jobId, updateData);
                    return { status: "success", message: "ดำเนินการอนุมัติสำเร็จ" };
                }
                case 'acceptJob': {
                    const { jobId, technicianEmail } = payload;
                    const updateData = {
                        "สถานะ": "กำลังดำเนินการ",
                        "ผู้รับงานจริง": technicianEmail,
                        "วันที่รับงาน": new Date().toISOString()
                    };
                    await patchDb("jobs/" + jobId, updateData);
                    return { status: "success", message: "รับงานสำเร็จ" };
                }
                case 'declineJob': {
                    const { jobId, technicianEmail, reason } = payload;
                    const jobData = await getDb("jobs/" + jobId);
                    if (!jobData) throw new Error("ไม่พบใบงาน");
                    const assignedCol = jobData["ผู้รับผิดชอบ"] || '';
                    const assignedTechnicians = assignedCol.split(',');
                    let declinedList = jobData["ผู้ปฏิเสธงาน (JSON)"] ? JSON.parse(jobData["ผู้ปฏิเสธงาน (JSON)"]) : [];
                    if (!declinedList.some(d => d.email === technicianEmail)) {
                        declinedList.push({ email: technicianEmail, reason });
                    }
                    const updateData = {
                        "ผู้ปฏิเสธงาน (JSON)": JSON.stringify(declinedList)
                    };
                    if (assignedTechnicians.every(tech => declinedList.some(d => d.email === tech))) {
                        updateData["สถานะ"] = "ถูกปฏิเสธโดยช่าง";
                    }
                    await patchDb("jobs/" + jobId, updateData);
                    return { status: "success", message: "ปฏิเสธงานสำเร็จ" };
                }
                case 'closeJob': {
                    const { jobId, details } = payload;
                    const jobData = await getDb("jobs/" + jobId);
                    if (!jobData) throw new Error("ไม่พบใบงาน");
                    const existingDetails = jobData["รายละเอียดการปฏิบัติงาน"] || '';
                    const timestamp = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                    const closingSummary = `สรุปการปิดงาน (${timestamp}): ${details}`;
                    const updatedDetails = existingDetails ? `${closingSummary}\n\n${existingDetails}` : closingSummary;
                    const updateData = {
                        "สถานะ": "ปิดงาน",
                        "รายละเอียดการปฏิบัติงาน": updatedDetails,
                        "วันที่ปิดงาน": new Date().toISOString()
                    };
                    await patchDb("jobs/" + jobId, updateData);
                    return { status: "success", message: "ปิดงานสำเร็จ" };
                }
                case 'updateJobStatus': {
                    const { jobId, details } = payload;
                    if (!jobId || !details) throw new Error("ต้องระบุ Job ID และรายละเอียด");
                    const jobData = await getDb("jobs/" + jobId);
                    if (!jobData) throw new Error("ไม่พบใบงาน");
                    const existingDetails = jobData["รายละเอียดการปฏิบัติงาน"] || '';
                    const timestamp = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
                    const newUpdate = `${timestamp}: ${details}`;
                    const updatedDetails = existingDetails ? `${newUpdate}\n\n${existingDetails}` : newUpdate;
                    await patchDb("jobs/" + jobId, { "รายละเอียดการปฏิบัติงาน": updatedDetails });
                    return { status: "success", message: "อัปเดตรายละเอียดงานสำเร็จ" };
                }
                case 'getDropdownData': {
                    const rawDropdownsMap = await getDb("dropdowns") || {};
                    const rawDropdowns = Object.values(rawDropdownsMap);
                    const dropdowns = { jobTypes: [], customerTypes: [], departments: [] };
                    rawDropdowns.forEach(row => {
                        if (row.JobType) dropdowns.jobTypes.push(row.JobType);
                        if (row.CustomerType) dropdowns.customerTypes.push(row.CustomerType);
                        if (row.Department) dropdowns.departments.push(row.Department);
                    });
                    return { status: "success", data: dropdowns };
                }
                case 'addDropdownItem': {
                    let rawDropdownsMap = await getDb("dropdowns") || {};
                    const rawDropdowns = Object.values(rawDropdownsMap);
                    const headerMap = {"jobType": "JobType", "customerType": "CustomerType", "department": "Department"};
                    const columnName = headerMap[payload.type];
                    if (!columnName) throw new Error("ประเภท dropdown ไม่ถูกต้อง");
                    const columnValues = rawDropdowns.map(row => row[columnName]).filter(Boolean);
                    if (columnValues.includes(payload.value)) {
                        if (payload.silent) return { status: "success" }; 
                        throw new Error("มีข้อมูลนี้อยู่แล้ว");
                    }
                    const keys = Object.keys(rawDropdownsMap);
                    let addedKey = null;
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        if (!rawDropdownsMap[key][columnName]) {
                            addedKey = key;
                            break;
                        }
                    }
                    if (addedKey) {
                        rawDropdownsMap[addedKey][columnName] = payload.value;
                        await putDb("dropdowns/" + addedKey, rawDropdownsMap[addedKey]);
                    } else {
                        const newKey = "item_" + keys.length;
                        const newRow = {};
                        newRow[columnName] = payload.value;
                        await putDb("dropdowns/" + newKey, newRow);
                    }
                    return { status: "success", message: "เพิ่มข้อมูลสำเร็จ" };
                }
                case 'updateDropdownItem': {
                    let rawDropdownsMap = await getDb("dropdowns") || {};
                    const headerMap = {"jobType": "JobType", "customerType": "CustomerType", "department": "Department"};
                    const columnName = headerMap[payload.type];
                    if (!columnName) throw new Error("ประเภท dropdown ไม่ถูกต้อง");
                    let updated = false;
                    for (const key in rawDropdownsMap) {
                        if (rawDropdownsMap[key][columnName] === payload.oldValue) {
                            rawDropdownsMap[key][columnName] = payload.newValue;
                            await putDb("dropdowns/" + key, rawDropdownsMap[key]);
                            updated = true;
                        }
                    }
                    if (updated) {
                        return { status: "success", message: "อัปเดตข้อมูลสำเร็จ" };
                    }
                    throw new Error("ไม่พบข้อมูล");
                }
                case 'deleteDropdownItem': {
                    let rawDropdownsMap = await getDb("dropdowns") || {};
                    const headerMap = {"jobType": "JobType", "customerType": "CustomerType", "department": "Department"};
                    const columnName = headerMap[payload.type];
                    if (!columnName) throw new Error("ประเภท dropdown ไม่ถูกต้อง");
                    let updated = false;
                    for (const key in rawDropdownsMap) {
                        if (rawDropdownsMap[key][columnName] === payload.value) {
                            delete rawDropdownsMap[key][columnName];
                            if (Object.keys(rawDropdownsMap[key]).length === 0) {
                                await fetch(dbUrl + "dropdowns/" + key + ".json", { method: "DELETE" });
                            } else {
                                await putDb("dropdowns/" + key, rawDropdownsMap[key]);
                            }
                            updated = true;
                        }
                    }
                    if (updated) {
                        return { status: "success", message: "ลบข้อมูลสำเร็จ" };
                    }
                    throw new Error("ไม่พบข้อมูล");
                }
                case 'getAllUsers': {
                    const rawUsersMap = await getDb("users") || {};
                    const users = Object.values(rawUsersMap);
                    const sanitizedUsers = users.map(u => {
                        const copy = { ...u };
                        delete copy.PasswordHash;
                        return copy;
                    });
                    return { status: "success", data: sanitizedUsers };
                }
                case 'updateUserRole': {
                    const { email, newRole, userEmail } = payload;
                    if (email === userEmail) throw new Error("คุณไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้");
                    const encodedEmail = encodeEmailJs(email);
                    const user = await getDb("users/" + encodedEmail);
                    if (!user) throw new Error("ไม่พบผู้ใช้งาน");
                    await patchDb("users/" + encodedEmail, { Role: newRole });
                    return { status: "success", message: "อัปเดตสิทธิ์ผู้ใช้สำเร็จ" };
                }
                case 'updateUserDepartment': {
                    const { email, newDepartment } = payload;
                    const encodedEmail = encodeEmailJs(email);
                    const user = await getDb("users/" + encodedEmail);
                    if (!user) throw new Error("ไม่พบผู้ใช้งาน");
                    await patchDb("users/" + encodedEmail, { Department: newDepartment });
                    return { status: "success", message: "อัปเดตแผนก/หน่วยงานสำเร็จ" };
                }
                case 'deleteUser': {
                    const { emailToDelete } = payload;
                    const encodedEmail = encodeEmailJs(emailToDelete);
                    await fetch(dbUrl + "users/" + encodedEmail + ".json", { method: 'DELETE' });
                    return { status: "success", message: "ลบผู้ใช้สำเร็จ" };
                }
                case 'updateUserApprovalLevel': {
                    const { email, newLevel } = payload;
                    const encodedEmail = encodeEmailJs(email);
                    await patchDb("users/" + encodedEmail, { ApprovalLevel: newLevel });
                    return { status: "success", message: "อัปเดตระดับการอนุมัติสำเร็จ" };
                }
                case 'updateUserCanAcceptJobs': {
                    const { email, canAccept } = payload;
                    const encodedEmail = encodeEmailJs(email);
                    await patchDb("users/" + encodedEmail, { CanAcceptJobs: canAccept ? "TRUE" : "FALSE" });
                    return { status: "success", message: "อัปเดตสถานะการรับงานสำเร็จ" };
                }
                case 'getAllCustomers': {
                    const rawCustomersMap = await getDb("customers") || {};
                    const customers = Object.values(rawCustomersMap);
                    return { status: "success", data: customers };
                }
                case 'addOrUpdateCustomer': {
                    let customerId = payload.CustomerID;
                    const formatAsText = (value) => {
                        const strValue = String(value || '');
                        if (strValue.startsWith("'")) return strValue;
                        return `'${strValue}`;
                    };
                    const customerData = {
                        CustomerID: customerId,
                        BillingName: payload.BillingName || payload.billingName,
                        BillingPhone: formatAsText(payload.BillingPhone || payload.billingPhone),
                        BillingAddress: payload.BillingAddress || payload.billingAddress,
                        ServiceName: payload.ServiceName || payload.serviceName,
                        ServicePhone: formatAsText(payload.ServicePhone || payload.servicePhone),
                        ServiceAddress: payload.ServiceAddress || payload.serviceAddress,
                        CustomerType: payload.CustomerType || payload.customerType,
                        ServiceStartDate: payload.ServiceStartDate || payload.serviceStartDate,
                        ContractPeriod: payload.ContractPeriod || payload.contractPeriod,
                        ServiceEndDate: payload.ServiceEndDate || payload.serviceEndDate,
                        ServiceFrequency: payload.ServiceFrequency || payload.serviceFrequency,
                        BillToDepartment: payload.BillToDepartment || payload.billToDepartment
                    };
                    if (customerId) {
                        await patchDb("customers/" + customerId, customerData);
                        return { status: "success", message: "อัปเดตข้อมูลลูกค้าสำเร็จ" };
                    } else {
                        const rawCustomers = await getDb("customers") || {};
                        const newId = `CUST-${(Object.keys(rawCustomers).length + 1).toString().padStart(4, '0')}`;
                        customerData.CustomerID = newId;
                        await putDb("customers/" + newId, customerData);
                        return { status: "success", message: "เพิ่มข้อมูลลูกค้าใหม่สำเร็จ" };
                    }
                }
                case 'deleteCustomer': {
                    const { CustomerID } = payload;
                    if (!CustomerID) throw new Error("ต้องระบุ Customer ID");
                    await fetch(dbUrl + "customers/" + CustomerID + ".json", { method: 'DELETE' });
                    return { status: "success", message: "ลบข้อมูลลูกค้าสำเร็จ" };
                }
                default:
                    return null;
            }
        } catch (err) {
            console.error("Firebase direct error: ", err);
            throw err;
        }
    }


    // --- API CALL FUNCTION ---
    async function apiCall(action, payload) {
        showLoading();
        try {
            const finalPayload = { ...payload };
            if (currentUserData && currentUserData.Email) {
                 finalPayload.userEmail = currentUserData.Email;
            }

            // TRY FIREBASE DIRECT FIRST (FOR BLAGING SPEED!)
            const fbResult = await firebaseApiCall(action, finalPayload);
            if (fbResult !== null) {
                return fbResult;
            }

            // FALLBACK TO GAS SCRIPT_URL
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, ...finalPayload })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.status === 'error') {
                throw new Error(result.message);
            }
            
            return result;
        } catch (error) {
            showAlert(`เกิดข้อผิดพลาด: ${error.message}`, 'error');
            console.error(`API Call Error (${action}):`, error);
            return null;
        } finally {
            hideLoading();
        }
    }

    function resizePad(padInstance) {
        if (!padInstance || !padInstance.canvas) return;
        const canvas = padInstance.canvas;
        if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
        const data = padInstance.toData();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        padInstance.fromData(data);
    }

    // ฟังก์ชันกลาง: เปิด popup วาดลายเซน แล้วบันทึกไว้ใช้ครั้งต่อไป
    // คืนค่า dataURL ของลายเซน หรือ null ถ้ายกเลิก
    async function promptAndSaveSignature() {
        return new Promise((resolve) => {
            let tempPad = null;

            Swal.fire({
                title: 'กรุณาลงลายเซ็น',
                html: `
                    <p class="text-sm text-slate-500 mb-3">วาดลายเซ็นของคุณในช่องด้านล่าง<br>ลายเซ็นจะถูกบันทึกไว้ใช้ครั้งต่อไปโดยอัตโนมัติ</p>
                    <div style="border:2px solid #e2e8f0; border-radius:8px; background:#f8fafc; position:relative;">
                        <canvas id="swal-signature-canvas" style="width:100%; height:160px; display:block; touch-action:none;"></canvas>
                    </div>
                    <button id="swal-clear-sig" type="button" style="margin-top:8px; font-size:12px; color:#64748b; background:none; border:1px solid #cbd5e1; border-radius:6px; padding:4px 12px; cursor:pointer;">ล้างลายเซ็น</button>
                `,
                showCancelButton: true,
                confirmButtonText: 'ยืนยันลายเซ็น',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
                didOpen: () => {
                    const canvas = document.getElementById('swal-signature-canvas');
                    if (canvas) {
                        const ratio = Math.max(window.devicePixelRatio || 1, 1);
                        canvas.width = canvas.offsetWidth * ratio;
                        canvas.height = canvas.offsetHeight * ratio;
                        canvas.getContext('2d').scale(ratio, ratio);
                        tempPad = new SignaturePad(canvas, { backgroundColor: 'rgba(255,255,255,0)', penColor: 'rgb(0,0,0)' });
                        document.getElementById('swal-clear-sig')?.addEventListener('click', () => tempPad.clear());
                    }
                },
                preConfirm: () => {
                    if (!tempPad || tempPad.isEmpty()) {
                        Swal.showValidationMessage('กรุณาวาดลายเซ็นก่อนยืนยัน');
                        return false;
                    }
                    return tempPad.toDataURL('image/png');
                }
            }).then(async (result) => {
                if (result.isConfirmed && result.value) {
                    const sigData = result.value;
                    // บันทึกลายเซนไปยัง server เพื่อใช้ครั้งต่อไป
                    try {
                        const saveResult = await apiCall('updateUserSignature', { email: currentUserData.Email, newSignature: sigData });
                        if (saveResult && saveResult.status === 'success') {
                            currentUserData.SignatureURL = saveResult.newSignatureUrl;
                        } else {
                            // ถ้าบันทึกไม่สำเร็จก็ยังใช้ dataURL ได้ในครั้งนี้
                            currentUserData.SignatureURL = sigData;
                        }
                    } catch(e) {
                        currentUserData.SignatureURL = sigData;
                    }
                    // รีเฟรช signature pad ในหน้าแจ้งงาน (ถ้ามี)
                    isUsingSavedSignature = true;
                    setupIntelligentSignaturePad();
                    resolve(currentUserData.SignatureURL);
                } else {
                    resolve(null);
                }
            });
        });
    }

    function setCurrentDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
        const requestDateInput = document.getElementById('requestDate');
        if (requestDateInput) requestDateInput.value = formattedDateTime;
    }

    // --- VIEW MANAGEMENT ---
    function showView(viewId) {
        if (viewId.startsWith('login') || viewId.startsWith('signup') || viewId.startsWith('forgot')) {
            if(authContainer) authContainer.classList.remove('hidden');
            if(appContainer) appContainer.classList.add('hidden');
            if(loginView) loginView.classList.toggle('hidden', viewId !== 'login-view');
            if(signupView) signupView.classList.toggle('hidden', viewId !== 'signup-view');
            if(forgotPasswordView) forgotPasswordView.classList.toggle('hidden', viewId !== 'forgot-password-view');
        } else {
            if(authContainer) authContainer.classList.add('hidden');
            if(appContainer) appContainer.classList.remove('hidden');
            allViews.forEach(view => view.classList.add('hidden'));
            const activeView = document.getElementById(viewId);
            if (activeView) {
                activeView.classList.remove('hidden');
                const viewTitle = document.getElementById('view-title');
                
                let titleText = '';
                 const sidebarLink = document.querySelector(`.sidebar-item[data-view="${viewId}"] span`);
                 if(sidebarLink) {
                    titleText = sidebarLink.textContent.trim();
                 } else {
                    const settingsCard = document.querySelector(`.settings-card[data-view="${viewId}"] h3`);
                    if(settingsCard){
                        titleText = settingsCard.textContent.trim();
                    } else {
                        titleText = 'Dashboard'; // Fallback
                    }
                 }
                 if(viewTitle) viewTitle.textContent = titleText;
            }

            // Load data for specific views
            const viewLoadActions = {
                'dashboard-view': loadDashboardData,
                'new-job-view': () => {
                    setCurrentDateTime();
                    if (currentUserData) setupIntelligentSignaturePad();
                    setTimeout(() => resizePad(signaturePad), 50);
                },
                'profile-settings-view': () => setTimeout(() => resizePad(newSignaturePad), 50),
                'user-permissions-view': loadAndDisplayUsers,
                'download-docs-view': loadAndDisplayJobs,
                'approve-job-view': loadAndDisplayApprovalJobs,
                'receive-job-view': loadAndDisplayReceiveJobs,
                'job-history-view': loadAndDisplayJobHistory,
                'customer-management-view': loadAndDisplayCustomers,
            };
            
            // --- START CHANGE ---
            // If there's a load action, execute it and return its promise (if any)
            if (viewLoadActions[viewId]) {
                const actionResult = viewLoadActions[viewId]();
                // Highlight active sidebar item
                document.querySelectorAll('.sidebar-item').forEach(item => {
                    item.classList.remove('active');
                    if (item.dataset.view === viewId) item.classList.add('active');
                });
                // Return the promise if the action is async
                return actionResult; 
            }
            // --- END CHANGE ---

             // Highlight active sidebar item
            document.querySelectorAll('.sidebar-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.view === viewId) item.classList.add('active');
            });
        }
        // Add a default return for non-async paths
        return Promise.resolve();
    }

    // --- AUTHENTICATION & USER DATA ---
    async function apiCallWithoutLoader(action, payload) {
         try {
            // TRY FIREBASE DIRECT FIRST (FOR BLAGING SPEED!)
            const fbResult = await firebaseApiCall(action, payload);
            if (fbResult !== null) {
                if (fbResult.status === 'error') throw new Error(fbResult.message);
                return fbResult;
            }

            // FALLBACK TO GAS SCRIPT_URL
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action, ...payload })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            if (result.status === 'error') throw new Error(result.message);
            return result;
        } catch (error) {
            console.error(`API Call Error (${action}):`, error);
            throw error;
        }
    }


    async function handleLogin(e) {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const email = formData.get('email');
        const password = formData.get('password');

        Swal.fire({ title: 'กำลังเข้าสู่ระบบ...', text: 'กรุณารอสักครู่', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const result = await apiCallWithoutLoader('login', { email, password });
            if (result && result.status === 'success') {
                sessionStorage.setItem('loggedInUser', email);
                const swalTitle = Swal.getHtmlContainer()?.querySelector('.swal2-title');
                if(swalTitle) swalTitle.textContent = 'เข้าสู่ระบบสำเร็จ!';
                const swalText = Swal.getHtmlContainer()?.querySelector('.swal2-html-container');
                if(swalText) swalText.textContent = 'กำลังโหลดข้อมูล...';
                await initializeApp(email);
                Swal.close();
                showView('dashboard-view');
            }
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด!', text: error.message });
        }
    }

    async function handleSignup(e) {
        e.preventDefault();
        const formData = new FormData(signupForm);
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');

        if (password !== confirmPassword) return showAlert('รหัสผ่านไม่ตรงกัน', 'error');
        
        const payload = Object.fromEntries(formData.entries());
        delete payload.confirmPassword;
        
        const result = await apiCall('signup', payload);
        if (result && result.status === 'success') {
            showAlert(result.message);
            signupForm.reset();
            showView('login-view');
        }
    }
    
    async function handleForgotPassword(e) {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const result = await apiCall('forgotPassword', { email });
        if (result && result.status === 'success') {
            showAlert(result.message);
            forgotPasswordForm.reset();
            showView('login-view');
        }
    }

    function handleLogout() {
        currentUserData = null;
        allJobsCache = [];
        sessionStorage.removeItem('loggedInUser');
        document.getElementById('approve-job-menu-item').style.display = 'none';
        document.getElementById('receive-job-menu-item').style.display = 'none';
        document.getElementById('user-permissions-card').classList.add('hidden');
        showView('login-view');
        showAlert('ออกจากระบบแล้ว');
    }

    async function fetchAndPopulateUserData(email) {
        const result = await apiCallWithoutLoader('getUserData', { email });
        if (result && result.status === 'success') {
            currentUserData = result.data;
            // Sidebar & Profile
            document.getElementById('user-fullname').textContent = currentUserData.FullName;
            document.getElementById('user-role').textContent = currentUserData.Role;
            document.getElementById('profile-fullname').value = currentUserData.FullName;
            document.getElementById('profile-email').value = currentUserData.Email;
            document.getElementById('profile-phone').value = String(currentUserData.Phone || '').replace(/'/g, '');
            document.getElementById('profile-department').value = currentUserData.Department;

            // Signature
            const sigImg = document.getElementById('current-signature-img');
            const noSigText = document.getElementById('no-signature-text');
            if(currentUserData.SignatureURL){
                sigImg.src = currentUserData.SignatureURL;
                sigImg.classList.remove('hidden');
                noSigText.classList.add('hidden');
            } else {
                sigImg.classList.add('hidden');
                noSigText.classList.remove('hidden');
            }

            // New Job Form
            document.getElementById('requesterName').value = currentUserData.FullName;
            document.getElementById('requesterPhone').value = String(currentUserData.Phone || '').replace(/'/g, '');
            document.getElementById('department').value = currentUserData.Department;

            // Role-based UI
            const approveMenuItem = document.getElementById('approve-job-menu-item');
            const receiveMenuItem = document.getElementById('receive-job-menu-item');
            const userPermissionsCard = document.getElementById('user-permissions-card');
            const dropdownSettingsCard = document.querySelector('[data-view="dropdown-settings-view"]'); // Find the dropdown settings card
            
            approveMenuItem.style.display = (currentUserData.ApprovalLevel) ? 'flex' : 'none';
            // FIX: Made the check more flexible to accept both string 'TRUE' and boolean true.
            const canReceiveJobs = currentUserData.CanAcceptJobs === 'TRUE' || currentUserData.CanAcceptJobs === true || currentUserData.Role === 'Admin' || currentUserData.Role === 'Manager';
            receiveMenuItem.style.display = canReceiveJobs ? 'flex' : 'none';
            const isAdminOrManager = currentUserData.Role === 'Admin' || currentUserData.Role === 'Manager';
            userPermissionsCard.classList.toggle('hidden', !isAdminOrManager);
            if(dropdownSettingsCard) dropdownSettingsCard.classList.toggle('hidden', !isAdminOrManager); // Hide/show based on role

        } else {
             console.error('Fetch user data error:', result ? result.message : 'Unknown error');
             handleLogout();
        }
    }

    // --- PROFILE & SIGNATURE UPDATE ---
    async function handleProfileUpdate(e) {
        e.preventDefault();
        const formData = new FormData(profileUpdateForm);
        const newPassword = formData.get('newPassword');
        const confirmNewPassword = formData.get('confirmNewPassword');
        if (newPassword !== confirmNewPassword) return showAlert('รหัสผ่านใหม่ไม่ตรงกัน', 'error');

        const payload = Object.fromEntries(formData.entries());
        payload.email = currentUserData.Email;
        delete payload.confirmNewPassword;
        
        const result = await apiCall('updateProfile', payload);
         if (result && result.status === 'success') {
            showAlert(result.message);
            await fetchAndPopulateUserData(currentUserData.Email);
        }
    }
    
    async function handleSignatureUpdate(e){
        e.preventDefault();
        let newSignatureData = '';
        if(!newSignaturePad.isEmpty()) newSignatureData = newSignaturePad.toDataURL('image/png');
        else return showAlert('กรุณาวาดหรืออัปโหลดลายเซ็นใหม่', 'error');

        const payload = { email: currentUserData.Email, newSignature: newSignatureData };
        const result = await apiCall('updateUserSignature', payload);

        if(result && result.status === 'success'){
            showAlert(result.message);
            document.getElementById('current-signature-img').src = result.newSignatureUrl;
            document.getElementById('current-signature-img').classList.remove('hidden');
            document.getElementById('no-signature-text').classList.add('hidden');
            newSignaturePad.clear();
            currentUserData.SignatureURL = result.newSignatureUrl;
        }
    }

    // --- DROPDOWN MANAGEMENT ---
    async function fetchAndPopulateDropdowns() {
        const result = await apiCallWithoutLoader('getDropdownData', {});
        if(result && result.status === 'success'){
            dropdownData = result.data;
            populateDropdownSelect('jobType', dropdownData.jobTypes);
            populateDropdownSelect('customerType', dropdownData.customerTypes);
            populateDatalist('department-list-signup', dropdownData.departments);
            renderDropdownList('jobTypes', dropdownData.jobTypes);
            renderDropdownList('customerTypes', dropdownData.customerTypes);
            renderDropdownList('departments', dropdownData.departments);
        }
    }
    
    function populateDropdownSelect(selectId, options){
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">-- กรุณาเลือก --</option>';
        options.forEach(opt => select.add(new Option(opt, opt)));
        select.add(new Option('อื่นๆ (โปรดระบุ)', 'other'));
    }
    
    function populateDatalist(datalistId, options) {
        const datalist = document.getElementById(datalistId);
        if (!datalist) return; 
        datalist.innerHTML = '';
        options.forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = opt;
            datalist.appendChild(optionEl);
        });
    }

    function renderDropdownList(type, items) {
        const listContainer = document.getElementById(`${type}-list`);
        if (!listContainer) return;
        listContainer.innerHTML = '';
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex items-center justify-between bg-slate-100 p-2 rounded-md';
            itemDiv.innerHTML = `
                <span class="item-value">${item}</span>
                <div class="space-x-2">
                    <button class="edit-item-btn text-slate-500 hover:text-sky-600"><i class="fa-solid fa-pen"></i></button>
                    <button class="delete-item-btn text-slate-500 hover:text-rose-600"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            listContainer.appendChild(itemDiv);
        });
    }
    
    async function handleShowAddDropdownModal(type, title) {
        const { value: newValue } = await Swal.fire({ title, input: 'text', inputPlaceholder: 'กรอกข้อมูลที่นี่...', showCancelButton: true, confirmButtonText: 'เพิ่มข้อมูล', cancelButtonText: 'ยกเลิก', inputValidator: (v) => !v && 'คุณต้องกรอกข้อมูล!' });
        if (newValue && newValue.trim()) {
            const result = await apiCall('addDropdownItem', { type, value: newValue.trim() });
            if (result && result.status === 'success') {
                showAlert(result.message);
                await fetchAndPopulateDropdowns();
            }
        }
    }
    
    async function handleUpdateDropdownItem(type, oldValue) {
        const { value: newValue } = await Swal.fire({ title: 'แก้ไขรายการ', input: 'text', inputValue: oldValue, showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก', inputValidator: (v) => !v && 'คุณต้องกรอกข้อมูล!' });
        if (newValue && newValue.trim() && newValue !== oldValue) {
            const result = await apiCall('updateDropdownItem', { type, oldValue, newValue: newValue.trim() });
            if (result && result.status === 'success') {
                showAlert(result.message);
                await fetchAndPopulateDropdowns();
            }
        }
    }

    async function handleDeleteDropdownItem(type, value) {
        const { isConfirmed } = await Swal.fire({ title: `คุณแน่ใจหรือไม่?`, text: `คุณต้องการลบ "${value}" ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก' });
        if (isConfirmed) {
            const apiResult = await apiCall('deleteDropdownItem', { type, value });
            if (apiResult && apiResult.status === 'success') {
                showAlert(apiResult.message);
                await fetchAndPopulateDropdowns();
            }
        }
    }

    // --- USER MANAGEMENT ---
    async function loadAndDisplayUsers() {
        const result = await apiCall('getAllUsers');
        if (result && result.status === 'success') populateUsersTable(result.data);
    }

    // Load users into a quick-lookup map (email -> FullName)
    async function loadAndCacheUserMap() {
        try {
            const result = await apiCallWithoutLoader('getAllUsers', {});
            if (result && result.status === 'success') {
                userEmailToNameMap = {};
                (result.data || []).filter(Boolean).forEach(u => {
                    if (u.Email) userEmailToNameMap[u.Email] = u.FullName || u.Email;
                });
            }
        } catch (e) {
            console.warn('loadAndCacheUserMap failed:', e);
        }
    }

    // Helper: convert a comma-separated list of emails to display names
    function emailsToNames(emailStr) {
        if (!emailStr) return '-';
        return emailStr.split(',').map(e => {
            const trimmed = e.trim();
            return userEmailToNameMap[trimmed] || trimmed;
        }).join(', ');
    }

    function populateUsersTable(users) {
        const tableBody = document.querySelector('#users-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const countBadge = document.getElementById('users-count-badge');
        if (countBadge) {
            countBadge.textContent = `(พบ ${users.length} รายการ)`;
        }
        const roles = ["Admin", "Manager", "Technician", "User"];
        const approvalLevels = ["ไม่มีสิทธิ์อนุมัติ", "Level1", "Level2", "Level1+Level2"];
        const departments = dropdownData.departments || [];

        users.forEach(user => {
            const isCurrentUser = user.Email === currentUserData.Email;
            const canDelete = currentUserData.Role === 'Admin' && !isCurrentUser;
            
            // Prepare department options
            const userDept = user.Department || '';
            let deptOptions = [...departments];
            if (userDept && !deptOptions.includes(userDept)) {
                deptOptions.push(userDept);
            }
            
            const isDeptDisabled = currentUserData.Role !== 'Admin';

            const row = tableBody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">${user.FullName}</td>
                <td class="px-6 py-4">${user.Email}</td>
                <td class="px-6 py-4">
                    <select data-email="${user.Email}" class="department-select bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" ${isDeptDisabled ? 'disabled' : ''}>
                        <option value="">-- เลือกแผนก --</option>
                        ${deptOptions.map(d => `<option value="${d}" ${userDept === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </td>
                <td class="px-6 py-4">
                    <select data-email="${user.Email}" class="role-select bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5" ${isCurrentUser ? 'disabled' : ''}>
                        ${roles.map(r => `<option value="${r}" ${user.Role === r ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                </td>
                <td class="px-6 py-4">
                    <select data-email="${user.Email}" class="approval-level-select bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                        ${approvalLevels.map(l => `<option value="${l === 'ไม่มีสิทธิ์อนุมัติ' ? '' : l}" ${user.ApprovalLevel === (l === 'ไม่มีสิทธิ์อนุมัติ' ? '' : l) ? 'selected' : ''}>${l}</option>`).join('')}
                    </select>
                </td>
                <td class="px-6 py-4 text-center">
                    <input type="checkbox" data-email="${user.Email}" class="can-accept-jobs-checkbox w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" ${user.CanAcceptJobs === 'TRUE' ? 'checked' : ''}>
                </td>
                <td class="px-6 py-4">
                    <button data-email="${user.Email}" data-name="${user.FullName}" class="delete-user-btn font-medium text-red-600 hover:underline ${canDelete ? '' : 'hidden'}">ลบ</button>
                </td>`;
        });
    }


    // --- NEW JOB FORM & SIGNATURE LOGIC ---
    function setupIntelligentSignaturePad() {
        const savedSigImg = document.getElementById('saved-signature-img-job');
        const sigPadCanvas = document.getElementById('signature-pad');
        const useSavedBtn = document.getElementById('use-saved-sig-btn');
        const drawNewBtn = document.getElementById('draw-new-sig-btn');
        const clearBtn = document.getElementById('clear-signature');
        if (!sigPadCanvas) return;

        const hasSavedSignature = currentUserData && currentUserData.SignatureURL;

        // ถ้ามีลายเซนบันทึกไว้ ให้ใช้ลายเซนที่บันทึกไว้โดยอัตโนมัติ
        // (จะไม่ override ถ้าผู้ใช้กดปุ่ม "วาดลายเซนใหม่" ไปแล้ว ซึ่งจะเซ็ต isUsingSavedSignature = false)
        if (hasSavedSignature && !isUsingSavedSignature) {
            isUsingSavedSignature = true;
        }

        if (hasSavedSignature && isUsingSavedSignature) {
            // State: Show the saved signature
            savedSigImg.src = currentUserData.SignatureURL;
            savedSigImg.classList.remove('hidden');
            sigPadCanvas.classList.add('hidden');
            drawNewBtn.classList.remove('hidden');
            useSavedBtn.classList.add('hidden');
            clearBtn.classList.add('hidden');
        } else {
            // State: Show the drawing canvas
            savedSigImg.classList.add('hidden');
            sigPadCanvas.classList.remove('hidden');
            clearBtn.classList.remove('hidden');
            // Show "use saved" button only if a saved signature actually exists
            useSavedBtn.classList.toggle('hidden', !hasSavedSignature);
            drawNewBtn.classList.add('hidden');
            if (signaturePad) {
                signaturePad.clear();
                // We need to resize the pad after it becomes visible
                setTimeout(() => resizePad(signaturePad), 50);
            }
        }
    }

    function setupNewJobForm() {
        const machineListContainer = document.getElementById('machineListContainer');
        const addMachineBtn = document.getElementById('addMachineBtn');
        if (!machineListContainer || !addMachineBtn) return;

        // Limit textarea lines
        const problemDescriptionTextarea = document.getElementById('problemDescription');
        if (problemDescriptionTextarea) {
            problemDescriptionTextarea.addEventListener('input', (e) => {
                const maxLines = 5; // Changed from 15 to 5
                const lines = e.target.value.split('\n');
                if (lines.length > maxLines) {
                    const newValue = lines.slice(0, maxLines).join('\n');
                    e.target.value = newValue;
                    showAlert('จำกัดรายละเอียดการแจ้งงานไม่เกิน 5 บรรทัด', 'warning'); // Updated alert message
                }
            });
        }

        let machineCount = 0;
        selectedFiles = [];

        function updateRemoveButtons() {
            const removeBtns = machineListContainer.querySelectorAll('.remove-machine-btn');
            const disable = removeBtns.length <= 1;
            removeBtns.forEach(btn => btn.disabled = disable);
        }
        
        function addMachineItem() {
            if (machineCount >= 5) return showAlert('เพิ่มรายการเครื่องจักรได้สูงสุด 5 รายการ', 'error'); // Changed from 10 to 5 and updated message
            machineCount++;
            const machineItem = document.createElement('div');
            machineItem.className = 'grid grid-cols-1 md:grid-cols-5 gap-4 items-center relative';
            machineItem.innerHTML = `
                <div class="md:col-span-2"><label class="text-sm text-slate-600">รุ่นเครื่อง</label><input type="text" name="machineModel" class="w-full p-2 border border-slate-300 rounded-md" required></div>
                <div class="md:col-span-2"><label class="text-sm text-slate-600">หมายเลขเครื่อง</label><input type="text" name="machineSerial" class="w-full p-2 border border-slate-300 rounded-md" required></div>
                <div class="text-right"><button type="button" class="remove-machine-btn mt-5 px-3 py-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition" ${machineCount === 1 ? 'disabled' : ''}>&times;</button></div>`;
            machineListContainer.appendChild(machineItem);
            updateRemoveButtons();
        }

        machineListContainer.addEventListener('click', (e) => {
            if (e.target.closest('.remove-machine-btn')) {
                e.target.closest('.grid.relative').remove();
                machineCount--;
                updateRemoveButtons();
            }
        });
        
        addMachineBtn.addEventListener('click', addMachineItem);
        machineListContainer.innerHTML = '';
        addMachineItem();

        // Dropdown 'Other' fields visibility
        ['jobType', 'customerType'].forEach(id => {
            const select = document.getElementById(id);
            if (select) select.addEventListener('change', e => {
                document.getElementById(`${id}Other`).classList.toggle('hidden', e.target.value !== 'other');
            });
        });

        // Auto-calculate service end date
        const startDateInput = document.getElementById('serviceStartDate');
        const periodInput = document.getElementById('contractPeriod');
        const endDateInput = document.getElementById('serviceEndDate');
        const calculateEndDate = () => {
            if (startDateInput.value && periodInput.value) {
                const startDate = new Date(startDateInput.value);
                const months = parseInt(periodInput.value, 10);
                startDate.setMonth(startDate.getMonth() + months);
                endDateInput.value = startDate.toISOString().split('T')[0];
            } else {
                endDateInput.value = '';
            }
        };
        if(startDateInput) startDateInput.addEventListener('input', calculateEndDate);
        if(periodInput) periodInput.addEventListener('input', calculateEndDate);

        // --- Same Address Checkbox Logic ---
        const sameAsBillingCheckbox = document.getElementById('sameAsBilling');
        const billingName = document.getElementById('billingName');
        const billingPhone = document.getElementById('billingPhone');
        const billingAddress = document.getElementById('billingAddress');
        const serviceName = document.getElementById('serviceName');
        const servicePhone = document.getElementById('servicePhone');
        const serviceAddress = document.getElementById('serviceAddress');

        const syncAddresses = () => {
            const serviceFields = [serviceName, servicePhone, serviceAddress];
            if (sameAsBillingCheckbox.checked) {
                serviceName.value = billingName.value;
                servicePhone.value = billingPhone.value;
                serviceAddress.value = billingAddress.value;
                serviceFields.forEach(field => {
                    field.readOnly = true;
                    field.classList.add('bg-slate-100');
                });
            } else {
                serviceFields.forEach(field => {
                    field.readOnly = false;
                    field.classList.remove('bg-slate-100');
                });
            }
        };
        
        if (sameAsBillingCheckbox) {
            sameAsBillingCheckbox.addEventListener('change', syncAddresses);
            billingName.addEventListener('input', () => { if (sameAsBillingCheckbox.checked) serviceName.value = billingName.value; });
            billingPhone.addEventListener('input', () => { if (sameAsBillingCheckbox.checked) servicePhone.value = billingPhone.value; });
            billingAddress.addEventListener('input', () => { if (sameAsBillingCheckbox.checked) serviceAddress.value = billingAddress.value; });
        }


        // File Attachment Logic
        const fileInput = document.getElementById('fileAttachment');
        const imagePreviewContainer = document.getElementById('image-preview-container');
        const otherFilesList = document.getElementById('other-files-list');
        const imagePreviewPlaceholder = document.getElementById('image-preview-placeholder');

        function updateFilePreviews() {
            if (!imagePreviewContainer || !otherFilesList || !imagePreviewPlaceholder) return;
            const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
            const otherFiles = selectedFiles.filter(f => !f.type.startsWith('image/'));

            imagePreviewContainer.innerHTML = '';
            if (imageFiles.length > 0) {
                imagePreviewPlaceholder.classList.add('hidden');
                let pageDiv = null;
                imageFiles.forEach((file, index) => {
                    if (index % 4 === 0) {
                        pageDiv = document.createElement('div');
                        pageDiv.className = 'a4-page-preview';
                        imagePreviewContainer.appendChild(pageDiv);
                    }
                    const reader = new FileReader();
                    reader.onload = e => {
                        const fileIndex = selectedFiles.indexOf(file);
                        const wrapper = document.createElement('div');
                        wrapper.className = 'preview-image-wrapper';
                        wrapper.innerHTML = `<img src="${e.target.result}" class="preview-image-in-grid"><button type="button" class="remove-image-btn" data-index="${fileIndex}">&times;</button>`;
                        if(pageDiv) pageDiv.appendChild(wrapper);
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                 imagePreviewContainer.appendChild(imagePreviewPlaceholder);
                 imagePreviewPlaceholder.classList.remove('hidden');
            }

            otherFilesList.innerHTML = '';
            if (otherFiles.length > 0) {
                 otherFilesList.innerHTML = '<h4 class="font-semibold text-sm mt-4">ไฟล์อื่นๆ:</h4>';
                 otherFiles.forEach(file => {
                    const fileIndex = selectedFiles.indexOf(file);
                    const fileItem = document.createElement('div');
                    fileItem.className = 'flex justify-between items-center bg-slate-100 p-2 rounded';
                    fileItem.innerHTML = `<span><i class="fa-solid fa-file mr-2 text-slate-500"></i>${file.name}</span><button type="button" class="remove-file-btn text-red-500 hover:text-red-700 font-bold" data-index="${fileIndex}">&times;</button>`;
                    otherFilesList.appendChild(fileItem);
                 });
            }
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                [...fileInput.files].forEach(file => {
                    if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) selectedFiles.push(file);
                });
                updateFilePreviews();
                fileInput.value = ''; 
            });
        }
        
        if (jobRequestForm) {
            jobRequestForm.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.remove-image-btn, .remove-file-btn');
                if (removeBtn) {
                    selectedFiles.splice(parseInt(removeBtn.dataset.index), 1);
                    updateFilePreviews();
                }
            });
        }
    }

    async function handleJobRequestSubmit(e) {
        e.preventDefault();
        
        let signaturePayload = '';
        let isNewSignatureDrawn = !isUsingSavedSignature && signaturePad && !signaturePad.isEmpty();

        if (isUsingSavedSignature && currentUserData && currentUserData.SignatureURL) {
            signaturePayload = currentUserData.SignatureURL;
        } else if (isNewSignatureDrawn) {
            signaturePayload = signaturePad.toDataURL('image/png');
        }

        // บังคับต้องมีลายเซนก่อนส่งใบแจ้งงาน — ถ้าไม่มีให้วาดได้เลย
        if (!signaturePayload) {
            const drawn = await promptAndSaveSignature();
            if (!drawn) return; // ผู้ใช้ยกเลิก
            signaturePayload = drawn;
        }

        const filesToUpload = await Promise.all(selectedFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ fileName: file.name, mimeType: file.type, data: reader.result.split(',')[1] });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }));
        
        const machineNodes = document.querySelectorAll('#machineListContainer .grid');
        const machineList = Array.from(machineNodes).map(node => ({
            model: node.querySelector('[name="machineModel"]').value,
            serial: node.querySelector('[name="machineSerial"]').value,
        }));

        const formData = new FormData(jobRequestForm);
        const payload = Object.fromEntries(formData.entries());
        
        // FIX: Directly add user data to the payload to prevent race conditions
        // This ensures the correct data is sent even if the form fields haven't updated yet.
        if (currentUserData) {
            payload.requesterName = currentUserData.FullName;
            payload.requesterPhone = String(currentUserData.Phone || '').replace(/'/g, '');
            payload.department = currentUserData.Department;
        }

        payload.signature = signaturePayload;
        payload.machineList = JSON.stringify(machineList);
        payload.fileAttachments = filesToUpload.length > 0 ? JSON.stringify(filesToUpload) : '';
        
        const submitBtn = jobRequestForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังส่งใบแจ้งงาน...';
        }

        let result;
        try {
            result = await apiCall('createNewJob', payload);
        } catch (error) {
            console.error(error);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'ส่งใบแจ้งงาน';
            }
        }

        if(result && result.status === 'success'){
            showAlert(`${result.message} เลขที่เอกสาร: ${result.jobID}`);
            
            if (isNewSignatureDrawn && currentUserData && !currentUserData.SignatureURL) {
                const { isConfirmed } = await Swal.fire({ title: 'บันทึกลายเซ็น?', text: 'คุณต้องการบันทึกลายเซ็นนี้เพื่อใช้ในครั้งต่อไปหรือไม่?', icon: 'question', showCancelButton: true, confirmButtonText: 'ใช่, บันทึกเลย', cancelButtonText: 'ไม่, แค่ครั้งนี้' });
                if (isConfirmed) {
                    const saveSigResult = await apiCall('updateUserSignature', { email: currentUserData.Email, newSignature: signaturePayload });
                    if (saveSigResult && saveSigResult.status === 'success') {
                        showAlert('บันทึกลายเซ็นสำเร็จ!');
                        currentUserData.SignatureURL = saveSigResult.newSignatureUrl;
                    }
                }
            }

            jobRequestForm.reset();
            if (signaturePad) signaturePad.clear();
            selectedFiles = [];
            document.getElementById('image-preview-container').innerHTML = `<p id="image-preview-placeholder" class="text-slate-500 text-center">ตัวอย่างไฟล์รูปภาพ (4 รูปต่อ 1 หน้า A4) จะแสดงที่นี่</p>`;
            document.getElementById('other-files-list').innerHTML = '';
            document.getElementById('machineListContainer').innerHTML = '';
            setupNewJobForm();
            setupIntelligentSignaturePad();
            setCurrentDateTime();
            // BUG FIX: Sequential calls to avoid race condition where two parallel
            // API calls both assign to allJobsCache, causing data inconsistency.
            // loadAndDisplayJobs updates allJobsCache and also calls updateSidebarBadges,
            // so no need to separately call loadAndDisplayApprovalJobs.
            await loadAndDisplayJobs();
            loadAndCacheCustomers(); // Refresh customer data (no await needed, runs in background)
        }
    }

     function setupTableSearch(inputId, containerId) {
        const searchInput = document.getElementById(inputId);
        const container = document.getElementById(containerId);
        if (!searchInput || !container) return;

        // Special handling for job history accordion view
        if (containerId === 'job-history-container') {
            searchInput.addEventListener('keyup', () => {
                const searchTerm = searchInput.value.toLowerCase();
                container.querySelectorAll('.customer-history-item').forEach(item => {
                    const customerName = item.dataset.customerName ? item.dataset.customerName.toLowerCase() : '';
                    item.style.display = customerName.includes(searchTerm) ? '' : 'none';
                });
            });
            return; // Exit the function to avoid running the table logic
        }

        // Original logic for tables
        const tableBody = container.querySelector('tbody');
        if (tableBody) {
            searchInput.addEventListener('keyup', () => {
                const searchTerm = searchInput.value.toLowerCase();
                let visibleCount = 0;
                tableBody.querySelectorAll('tr').forEach(row => {
                    const isVisible = row.textContent.toLowerCase().includes(searchTerm);
                    row.style.display = isVisible ? '' : 'none';
                    if (isVisible) visibleCount++;
                });

                // Update count badges dynamically
                if (containerId === 'customers-table') {
                    const badge = document.getElementById('customers-count-badge');
                    if (badge) badge.textContent = `(พบ ${visibleCount} รายการ)`;
                } else if (containerId === 'users-table') {
                    const badge = document.getElementById('users-count-badge');
                    if (badge) badge.textContent = `(พบ ${visibleCount} รายการ)`;
                }
            });
        }
    }

    // --- DOWNLOAD DOCS & PREVIEW ---
    async function loadAndDisplayJobs() {
        const result = await apiCall('getAllJobs');
        if (result && result.status === 'success') {
            allJobsCache = result.data;
            updateSidebarBadges(allJobsCache);
            currentJobsPage = 1;
            const searchInput = document.getElementById('jobs-search-input');
            const dateInput = document.getElementById('jobs-date-input');
            if (searchInput) searchInput.value = '';
            if (dateInput) dateInput.value = '';
            handleDownloadJobsSearch();
        }
    }

    function populateJobsTable(jobs) {
        const tableBody = document.querySelector('#jobs-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = ''; 
        jobs.forEach(job => {
            const row = tableBody.insertRow();
            row.className = 'bg-white border-b hover:bg-slate-50 transition-colors';
            const requestDate = new Date(job['วันที่แจ้ง']);
            const formattedDate = !isNaN(requestDate) ? requestDate.toLocaleString('th-TH') : 'N/A';
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${formattedDate}</td>
                <td class="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">${job.JobID}</td>
                <td class="px-6 py-4">${job['ชื่อลูกค้า (สำหรับเปิดบิล)']}</td>
                <td class="px-6 py-4">${job['ชื่อผู้แจ้ง']}</td>
                <td class="px-6 py-4">${getStatusBadge(job['สถานะ'])}</td>
                <td class="px-6 py-4"><button data-jobid="${job.JobID}" class="preview-job-btn font-medium text-sky-600 hover:underline">พรีวิว</button></td>`;
        });
    }

    // ฟังก์ชันใหม่สำหรับค้นหาหน้า "ดาวน์โหลดเอกสาร"
    function handleDownloadJobsSearch() {
        const searchTerm = document.getElementById('jobs-search-input')?.value.toLowerCase() || '';
        const searchDate = document.getElementById('jobs-date-input')?.value || '';

        const filteredJobs = [...allJobsCache]
            .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
            .filter(job => {
                // Text search logic
                const customerName = (job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || '').toLowerCase();
                const jobID = (job.JobID || '').toLowerCase();
                const requesterName = (job['ชื่อผู้แจ้ง'] || '').toLowerCase();
                const textMatch = customerName.includes(searchTerm) || jobID.includes(searchTerm) || requesterName.includes(searchTerm);

                // Date search logic
                const jobDate = job['วันที่แจ้ง'] ? new Date(job['วันที่แจ้ง']).toISOString().split('T')[0] : '';
                const dateMatch = !searchDate || jobDate === searchDate;

                return textMatch && dateMatch;
            });

        // Pagination calculations
        const itemsPerPage = 20;
        const totalItems = filteredJobs.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        if (currentJobsPage > totalPages) {
            currentJobsPage = totalPages;
        }

        const startIndex = (currentJobsPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

        populateJobsTable(paginatedJobs); // แสดงผลตารางที่กรองแล้ว
        renderJobsPagination(totalPages);
    }

    function renderJobsPagination(totalPages) {
        const container = document.getElementById('jobs-pagination');
        if (!container) return;
        container.innerHTML = '';

        if (totalPages <= 1) return;

        // "<<" First Page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
        firstBtn.disabled = currentJobsPage === 1;
        firstBtn.addEventListener('click', () => {
            currentJobsPage = 1;
            handleDownloadJobsSearch();
        });
        container.appendChild(firstBtn);

        // "<" Previous Page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
        prevBtn.disabled = currentJobsPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentJobsPage > 1) {
                currentJobsPage--;
                handleDownloadJobsSearch();
            }
        });
        container.appendChild(prevBtn);

        // Page Indicator
        const indicator = document.createElement('span');
        indicator.className = 'text-sm font-semibold text-slate-700 px-2';
        indicator.textContent = `หน้า ${currentJobsPage} / ${totalPages}`;
        container.appendChild(indicator);

        // ">" Next Page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
        nextBtn.disabled = currentJobsPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentJobsPage < totalPages) {
                currentJobsPage++;
                handleDownloadJobsSearch();
            }
        });
        container.appendChild(nextBtn);

        // ">>" Last Page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        lastBtn.disabled = currentJobsPage === totalPages;
        lastBtn.addEventListener('click', () => {
            currentJobsPage = totalPages;
            handleDownloadJobsSearch();
        });
        container.appendChild(lastBtn);
    }

    async function showJobPreview(jobId, context = 'download', status = '') {
        const result = await apiCall('getJobDetails', { jobId });
        if (result && result.status === 'success') {
            populateJobPreviewModal(result.data, context, status);
            document.getElementById('job-preview-modal').style.display = 'block';
        }
    }

    function populateJobPreviewModal(job, context = 'download', status = '') {
        const wrapper = document.getElementById('a4-wrapper');
        if(!wrapper) return;
        wrapper.innerHTML = ''; // Clear previous content

        // --- Create Page 1: Form Content ---
        const formPage = document.createElement('div');
        formPage.className = 'a4-page a4-content-page';
        const formContent = document.createElement('div');
        formContent.id = 'a4-preview-content';
        formPage.appendChild(formContent);
        wrapper.appendChild(formPage);
        
        let machineListHtml = 'ไม่มี';
        try {
            const machines = JSON.parse(job['รายการเครื่องจักร (JSON)']);
            if (Array.isArray(machines) && machines.length > 0 && machines[0].model) {
                machineListHtml = machines.map(m => `รุ่น: ${m.model || '-'} / S/N: ${m.serial || '-'}`).join('<br>');
            }
        } catch (e) { /* ignore */ }

        const formatDate = (ds) => ds ? new Date(ds).toLocaleDateString('th-TH') : '-';
        const formatDateTime = (ds) => ds ? new Date(ds).toLocaleString('th-TH') : '-';
        const formatTime = (ds) => ds ? new Date(ds).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '-';

        const problemDescription = (job['รายละเอียดการแจ้งงาน'] || '-').replace(/\n/g, '<br>');
        const billingAddress = (job['ที่อยู่ลูกค้า (สำหรับเปิดบิล)'] || '-').replace(/\n/g, '<br>');
        const serviceAddress = (job['ที่อยู่ลูกค้า (สำหรับเข้าบริการ)'] || '-').replace(/\n/g, '<br>');

        let workDetails = job['รายละเอียดการปฏิบัติงาน'] || 'ยังไม่มีการบันทึก';
        // For downloads, if the job is closed, only show the final summary.
        // For other views, show the full history.
        if (context === 'download' && job['สถานะ'] === 'ปิดงาน') {
            const closingSummaryMatch = workDetails.match(/^สรุปการปิดงาน.*$/m);
            if (closingSummaryMatch) {
                workDetails = closingSummaryMatch[0];
            }
        }
        const displayWorkDetails = workDetails.replace(/\n/g, '<br>');

        // Data for signature blocks
        const allSignatureData = [
            ['URL ลายเซ็น', 'ชื่อผู้แจ้ง', 'ผู้แจ้งงาน'],
            ['ActualReceiverSignature', 'ActualReceiverName', 'ผู้รับงาน'],
            ['SignatureL1', 'ApproverL1Name', 'ผู้ตรวจสอบ'],
            ['SignatureL2', 'ApproverL2Name', 'ผู้อนุมัติ']
        ];

        // List of statuses where the job is considered not yet accepted by a technician
        const unacceptedStatuses = ['รออนุมัติ Level 1', 'รออนุมัติ Level 2', 'รอรับงาน', 'ไม่อนุมัติ L1', 'ไม่อนุมัติ L2', 'ถูกปฏิเสธโดยช่าง'];


        formContent.innerHTML = `
            <div class="main-content-wrapper">
                <div style="position: relative; min-height: 4rem; margin-bottom: 0.5rem;">
                    <img src="https://lh3.googleusercontent.com/d/1b_e-SYaUDdlZqzyAwanUcYhaTx9inclg" alt="Logo" class="h-12" style="position: absolute; left: 0; top: 0;">
                    <h1 class="text-2xl font-bold text-center">แบบฟอร์ม ใบแจ้งงานบริการ</h1>
                    <div class="text-right">
                        <div style="display: inline-grid; grid-template-columns: auto auto; gap: 0.5rem 1rem; text-align: left;">
                            <strong>เลขที่เอกสาร:</strong><span>${job.JobID || 'N/A'}</span>
                            <strong>วันที่แจ้ง:</strong><span>${formatDateTime(job['วันที่แจ้ง'])}</span>
                            <strong>ประเภทงาน:</strong><span class="preview-data">${job['ประเภทงาน'] || '-'} ${job['ประเภทงาน (อื่นๆ)'] ? `(${job['ประเภทงาน (อื่นๆ)']})` : ''}</span>
                        </div>
                    </div>
                </div>
                <div class="preview-grid">
                    <div>
                        <div class="data-row"><span class="preview-label">ผู้แจ้ง:</span> <span class="preview-data">${job['ชื่อผู้แจ้ง'] || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">เบอร์โทรผู้แจ้ง:</span> <span class="preview-data">${job['เบอร์โทรผู้แจ้ง']?.replace(/'/g, '') || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">หน่วยงาน:</span> <span class="preview-data">${job['หน่วยงาน'] || '-'}</span></div>
                        <hr class="my-2">
                        <div class="data-row"><span class="preview-label">รายการเครื่องจักร:</span></div>
                        <div class="pl-4 preview-data">${machineListHtml}</div>
                    </div>
                    <div>
                        <hr class="my-2 md:hidden"> <!-- Divider for mobile view -->
                        <h2>สำหรับเปิดบิล</h2>
                        <div class="data-row"><span class="preview-label">ชื่อ:</span> <span class="preview-data">${job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">เบอร์โทร:</span> <span class="preview-data">${job['เบอร์โทรลูกค้า (สำหรับเปิดบิล)']?.replace(/'/g, '') || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">ที่อยู่:</span> <span class="preview-data">${billingAddress}</span></div>
                        
                        <h2 class="mt-4">สำหรับเข้าบริการ</h2>
                        <div class="data-row"><span class="preview-label">ลูกค้า:</span> <span class="preview-data">${job['ชื่อลูกค้า (สำหรับเข้าบริการ)'] || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">เบอร์โทร:</span> <span class="preview-data">${job['เบอร์โทรลูกค้า (สำหรับเข้าบริการ)']?.replace(/'/g, '') || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">ที่อยู่:</span> <span class="preview-data">${serviceAddress}</span></div>
                        <div class="data-row"><span class="preview-label">วันที่เข้าพื้นที่:</span> <span class="preview-data">${formatDate(job['วันที่ต้องเข้าพื้นที่'])}</span></div>
                        <div class="data-row"><span class="preview-label">เวลานัดหมาย:</span> <span class="preview-data">${formatTime(job['เวลานัดหมาย'])}</span></div>
                        <hr class="my-2">
                        <div class="data-row"><span class="preview-label">ประเภทลูกค้า:</span> <span class="preview-data">${job['ประเภทลูกค้า'] || '-'} ${job['ประเภทลูกค้า (อื่นๆ)'] ? `(${job['ประเภทลูกค้า (อื่นๆ)']})` : ''}</span></div>
                        <div class="data-row"><span class="preview-label">ระยะเวลาสัญญา:</span> <span class="preview-data">${job['ระยะเวลาสัญญา (เดือน)'] || '-'} เดือน</span></div>
                        <div class="data-row"><span class="preview-label">เริ่มสัญญา:</span> <span class="preview-data">${formatDate(job['วันที่เริ่มบริการ'])}</span></div>
                        <div class="data-row"><span class="preview-label">สิ้นสุดสัญญา:</span> <span class="preview-data">${formatDate(job['วันที่สิ้นสุดบริการ'])}</span></div>
                        <div class="data-row"><span class="preview-label">เรียกเก็บกับแผนก:</span> <span class="preview-data">${job['เรียกเก็บค่าใช้จ่ายกับแผนก'] || '-'}</span></div>
                        <div class="data-row"><span class="preview-label">ความถี่การเข้าบริการ:</span> <span class="preview-data">${job['ความถี่การเข้าบริการ'] || '-'}</span></div>
                    </div>
                </div>
                <div class="data-row mt-3"><span class="preview-label">รายละเอียดการแจ้งงาน:</span></div>
                <div class="pl-4 preview-data">${problemDescription}</div>
                <div class="border border-slate-300 rounded-md p-2 mt-1">
                    <p><strong>รายละเอียดการปฏิบัติงาน:</strong></p><div>${displayWorkDetails}</div>
                </div>
            </div>
            <div class="signature-grid">
                ${allSignatureData.map(([sig, name, role]) => {
                    // Default values
                    let signatureImageHtml = job[sig] ? `<img src="${job[sig]}" class="signature-img">` : `<div style="height: 45px;"></div>`;
                    let signatureNameHtml = `(${job[name] || '...................................'})`;

                    // Conditionally hide 'ผู้รับงาน' details if job is not yet accepted
                    if (role === 'ผู้รับงาน' && unacceptedStatuses.includes(job['สถานะ'])) {
                        signatureImageHtml = `<div style="height: 45px;"></div>`; // Show empty space instead of signature
                        signatureNameHtml = `(...................................)`; // Show placeholder instead of name/email
                    }

                    // Conditionally hide L1 / L2 details based on status to prevent displaying incorrect signatures
                    const jobStatus = job['สถานะ'] || '';
                    if (role === 'ผู้ตรวจสอบ' && (jobStatus === 'รออนุมัติ Level 1' || jobStatus.includes('ไม่อนุมัติ L1'))) {
                        signatureImageHtml = `<div style="height: 45px;"></div>`;
                        signatureNameHtml = `(...................................)`;
                    }
                    
                    if (role === 'ผู้อนุมัติ' && (jobStatus === 'รออนุมัติ Level 1' || jobStatus === 'รออนุมัติ Level 2' || jobStatus.includes('ไม่อนุมัติ'))) {
                        signatureImageHtml = `<div style="height: 45px;"></div>`;
                        signatureNameHtml = `(...................................)`;
                    }
                    
                    return `
                    <div class="signature-box">
                        ${signatureImageHtml}
                        <div class="signature-line"></div>
                        <p>${signatureNameHtml}</p>
                        <p>${role}</p>
                    </div>`;
                }).join('')}
            </div>`;

        // --- Create Subsequent Pages: Attachments ---
        const attachmentUrls = (job['URL ไฟล์แนบ'] || '').split(', ').filter(url => url);
        const imagesPerPage = 4;
        
        for (let i = 0; i < attachmentUrls.length; i += imagesPerPage) {
            const pageImages = attachmentUrls.slice(i, i + imagesPerPage);
            const attachmentPage = document.createElement('div');
            attachmentPage.className = 'a4-page a4-attachment-page';
            const attachmentGrid = document.createElement('div');
            attachmentGrid.className = 'attachment-grid';

            pageImages.forEach(url => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'attachment-image-container';
                imgContainer.innerHTML = `<img src="${url}" class="attachment-image" crossorigin="anonymous">`;
                attachmentGrid.appendChild(imgContainer);
            });
            attachmentPage.appendChild(attachmentGrid);
            wrapper.appendChild(attachmentPage);
        }

        // --- Populate Footer Buttons ---
        const footer = document.getElementById('preview-modal-footer');
        if(!footer) return;
        footer.innerHTML = '';
        const actions = {
            approval: [
                { text: 'ไม่อนุมัติ', classes: 'bg-red-600 hover:bg-red-700', icon: 'fa-times', onClick: () => handleApprovalAction(job.JobID, false, status) },
                { text: 'อนุมัติ', classes: 'bg-green-600 hover:bg-green-700', icon: 'fa-check', onClick: () => handleApprovalAction(job.JobID, true, status) }
            ],
            receive: [
                { text: 'ไม่รับงาน', classes: 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/10', icon: 'fa-thumbs-down', onClick: () => handleDeclineJob(job.JobID) },
                { text: 'รับงาน', classes: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20', icon: 'fa-thumbs-up', onClick: () => handleAcceptJob(job.JobID) }
            ],
            close: [{ text: 'ปิดงาน', classes: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10', icon: 'fa-check-double', onClick: () => handleCloseJob(job.JobID) }]
        };

        if (actions[context]) {
            actions[context].forEach(({ text, classes, icon, onClick }) => {
                const btn = document.createElement('button');
                btn.className = `px-5 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${classes}`;
                btn.innerHTML = `<i class="fa-solid ${icon} mr-2"></i>${text}`;
                btn.onclick = onClick;
                footer.appendChild(btn);
            });
        }

        const downloadBtn = document.createElement('button');
        downloadBtn.className = "px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200";
        downloadBtn.innerHTML = `<i class="fa-solid fa-file-pdf mr-2"></i>ดาวน์โหลด PDF`;
        downloadBtn.onclick = () => {
            const elementToPrint = document.getElementById('a4-wrapper');
            if (elementToPrint) {
                const originalStyle = elementToPrint.style.cssText;
                // Temporarily adjust styles for better PDF output
                elementToPrint.style.height = 'auto';
                elementToPrint.style.overflow = 'visible';
                elementToPrint.style.background = 'none';
                elementToPrint.style.padding = '0';

                const opt = { 
                    margin: 0, 
                    filename: `${job.JobID}.pdf`, 
                    image: { type: 'jpeg', quality: 0.98 }, 
                    html2canvas: { scale: 2, useCORS: true, logging: false }, 
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
                };
                html2pdf().from(elementToPrint).set(opt).save().then(() => {
                    // Restore original styles after PDF generation
                    elementToPrint.style.cssText = originalStyle;
                });
            }
        };
        footer.appendChild(downloadBtn);
    }


     // --- APPROVAL WORKFLOW ---
    async function loadAndDisplayApprovalJobs() {
        if (!currentUserData) return;
        const result = await apiCall('getAllJobs');
        if (result && result.status === 'success') {
            allJobsCache = result.data;
            updateSidebarBadges(allJobsCache);
            currentApprovalPage = 1;
            const searchInput = document.getElementById('approval-jobs-search-input');
            if (searchInput) searchInput.value = '';
            filterAndDisplayApprovalJobs();
        }
    }
    
    function filterAndDisplayApprovalJobs() {
        if (!currentUserData) return;
        
        const userLevel = currentUserData.ApprovalLevel;
        const jobsToApprove = allJobsCache.filter(job => {
            if (!userLevel) return false;
            const status = job['สถานะ'];
            return (userLevel.includes('Level1') && status === 'รออนุมัติ Level 1') || (userLevel.includes('Level2') && status === 'รออนุมัติ Level 2');
        });

        // Calculate counts for each category
        const totalCount = jobsToApprove.length;
        let urgentCount = 0;
        let normalCount = 0;

        jobsToApprove.forEach(job => {
            const requestDate = new Date(job['วันที่แจ้ง']);
            const serviceDate = new Date(job['วันที่ต้องเข้าพื้นที่']);
            const diffHours = (serviceDate - requestDate) / (1000 * 60 * 60);
            const isUrgent = diffHours <= 24;
            if (isUrgent) {
                urgentCount++;
            } else {
                normalCount++;
            }
        });

        // Update filter button labels with counts dynamically
        const allBtn = document.querySelector('#approval-filter-buttons [data-filter="all"]');
        const urgentBtn = document.querySelector('#approval-filter-buttons [data-filter="urgent"]');
        const normalBtn = document.querySelector('#approval-filter-buttons [data-filter="normal"]');
        
        if (allBtn) allBtn.textContent = `ทั้งหมด (${totalCount})`;
        if (urgentBtn) urgentBtn.textContent = `งานด่วน (${urgentCount})`;
        if (normalBtn) normalBtn.textContent = `งานปกติ (${normalCount})`;

        const badge = document.getElementById('approval-badge');
        if (badge) {
            badge.textContent = jobsToApprove.length;
            badge.classList.toggle('hidden', jobsToApprove.length === 0);
        }

        const searchTerm = document.getElementById('approval-jobs-search-input')?.value.toLowerCase() || '';

        const filteredJobs = jobsToApprove.filter(job => {
            // Apply category filter
            if (currentApprovalFilter !== 'all') {
                const requestDate = new Date(job['วันที่แจ้ง']);
                const serviceDate = new Date(job['วันที่ต้องเข้าพื้นที่']);
                const diffHours = (serviceDate - requestDate) / (1000 * 60 * 60);
                const isUrgent = diffHours <= 24;
                const matchesCategory = (currentApprovalFilter === 'urgent') ? isUrgent : !isUrgent;
                if (!matchesCategory) return false;
            }

            // Apply search term filter
            if (searchTerm) {
                const jobIdStr = (job.JobID || '').toLowerCase();
                const clientName = (job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || '').toLowerCase();
                const requesterName = (job['ชื่อผู้แจ้ง'] || '').toLowerCase();
                const jobType = (job['ประเภทงาน'] || '').toLowerCase();
                const department = (job['หน่วยงาน'] || '').toLowerCase();
                return jobIdStr.includes(searchTerm) || clientName.includes(searchTerm) || requesterName.includes(searchTerm) || jobType.includes(searchTerm) || department.includes(searchTerm);
            }

            return true;
        });

        // Update the current count badge/text in the header
        const countBadge = document.getElementById('approval-jobs-count-badge');
        if (countBadge) {
            countBadge.textContent = `(พบ ${filteredJobs.length} รายการ)`;
        }

        // Pagination calculations
        const itemsPerPage = 20;
        const totalItems = filteredJobs.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        if (currentApprovalPage > totalPages) {
            currentApprovalPage = totalPages;
        }

        const startIndex = (currentApprovalPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedJobs = [...filteredJobs]
            .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
            .slice(startIndex, endIndex);

        populateApprovalJobsTable(paginatedJobs);
        renderApprovalJobsPagination(totalPages);
    }

    function populateApprovalJobsTable(jobs) {
        const tableBody = document.querySelector('#approval-jobs-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = ''; 
        jobs.forEach(job => {
            // Urgency Calculation
            const requestDate = new Date(job['วันที่แจ้ง']);
            const serviceDate = new Date(job['วันที่ต้องเข้าพื้นที่']);
            const diffHours = (serviceDate - requestDate) / (1000 * 60 * 60);
            const isUrgent = diffHours <= 24;
            const urgencyHtml = `<span class="${isUrgent ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'} text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">${isUrgent ? 'งานด่วน' : 'ปกติ'}</span>`;

            const row = tableBody.insertRow();
            row.className = 'bg-white border-b hover:bg-slate-50 transition-colors';
            const formattedDate = new Date(job['วันที่แจ้ง']).toLocaleString('th-TH');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${formattedDate}</td>
                <td class="px-6 py-4 font-medium text-slate-900">${job.JobID}</td>
                <td class="px-6 py-4">${job['ชื่อลูกค้า (สำหรับเปิดบิล)']}</td>
                <td class="px-6 py-4">${job['ประเภทงาน'] || '-'}</td>
                <td class="px-6 py-4">${job['หน่วยงาน'] || '-'}</td>
                <td class="px-6 py-4">${job['ชื่อผู้แจ้ง']}</td>
                <td class="px-6 py-4">${urgencyHtml}</td>
                <td class="px-6 py-4">${getStatusBadge(job['สถานะ'])}</td>
                <td class="px-6 py-4"><button data-jobid="${job.JobID}" data-status="${job['สถานะ']}" class="preview-job-btn font-medium text-sky-600 hover:underline">พรีวิว</button></td>`;
        });
    }

    function renderApprovalJobsPagination(totalPages) {
        const container = document.getElementById('approval-jobs-pagination');
        if (!container) return;
        container.innerHTML = '';

        if (totalPages <= 1) return;

        // "<<" First Page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
        firstBtn.disabled = currentApprovalPage === 1;
        firstBtn.addEventListener('click', () => {
            currentApprovalPage = 1;
            filterAndDisplayApprovalJobs();
        });
        container.appendChild(firstBtn);

        // "<" Previous Page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
        prevBtn.disabled = currentApprovalPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentApprovalPage > 1) {
                currentApprovalPage--;
                filterAndDisplayApprovalJobs();
            }
        });
        container.appendChild(prevBtn);

        // Page Indicator
        const indicator = document.createElement('span');
        indicator.className = 'text-sm font-semibold text-slate-700 px-2';
        indicator.textContent = `หน้า ${currentApprovalPage} / ${totalPages}`;
        container.appendChild(indicator);

        // ">" Next Page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
        nextBtn.disabled = currentApprovalPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentApprovalPage < totalPages) {
                currentApprovalPage++;
                filterAndDisplayApprovalJobs();
            }
        });
        container.appendChild(nextBtn);

        // ">>" Last Page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        lastBtn.disabled = currentApprovalPage === totalPages;
        lastBtn.addEventListener('click', () => {
            currentApprovalPage = totalPages;
            filterAndDisplayApprovalJobs();
        });
        container.appendChild(lastBtn);
    }

    async function handleApprovalAction(jobId, isApproved, currentStatus) {
        // บังคับต้องมีลายเซนก่อนอนุมัติ — ถ้าไม่มีให้วาดได้เลย
        if (isApproved && currentUserData && !currentUserData.SignatureURL) {
            const drawn = await promptAndSaveSignature();
            if (!drawn) return; // ผู้ใช้ยกเลิก
        }
        const { value: reason } = await Swal.fire({ title: `เหตุผลการ${isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ'}`, input: 'textarea', inputPlaceholder: 'กรอกเหตุผล...', showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', inputValidator: (v) => !v && !isApproved && 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' });
        if (typeof reason === 'undefined') return;

        document.getElementById('preview-loader')?.classList.remove('hidden');
        try {
            let assignedTo = [];
            if (isApproved && currentStatus === 'รออนุมัติ Level 1') {
                const usersResult = await apiCall('getAllUsers');
                if (!usersResult || usersResult.status !== 'success') return showAlert('ไม่สามารถโหลดรายชื่อผู้รับงานได้', 'error');
                const technicians = usersResult.data.filter(u => 
                    u.CanAcceptJobs === 'TRUE' || 
                    u.CanAcceptJobs === true
                );
                if (technicians.length === 0) return showAlert('ไม่พบผู้ใช้งานที่มีสิทธิ์รับงานในระบบ', 'error');
                assignedTo = technicians.map(t => t.Email);
            }
            const result = await apiCall('processApproval', { jobId, isApproved, reason: reason || '', approverEmail: currentUserData.Email, assignedTo });
            if (result && result.status === 'success') {
                showAlert('ดำเนินการสำเร็จ!');
                document.getElementById('job-preview-modal').style.display = 'none';
                loadAndDisplayApprovalJobs();
                loadAndDisplayJobs();
            }
        } finally {
            document.getElementById('preview-loader')?.classList.add('hidden');
        }
    }

    // --- DASHBOARD ---
    async function loadDashboardData() {
        const result = await apiCall('getAllJobs');
        if (result && result.status === 'success') {
            allJobsCache = result.data;
            updateSidebarBadges(allJobsCache);
            // Sort a shallow copy for the dashboard to prevent side effects on allJobsCache
            currentDashboardJobs = [...allJobsCache].sort((a, b) => {
                const dateA = new Date(a.Timestamp);
                const dateB = new Date(b.Timestamp);
                if (isNaN(dateA) || isNaN(dateB)) return 0;
                return dateB - dateA;
            });
            updateDashboardCards(allJobsCache);
            populateActivityTable(currentDashboardJobs, 1);
            populateTopCustomersTable(allJobsCache);
        }
    }

    function populateTopCustomersTable(jobs) {
        const tableBody = document.querySelector('#top-customers-table tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        // Helper to normalize strings for comparison
        const normalizeStr = (str) => {
            if (!str) return '';
            return str.toString()
                .replace(/'/g, '') // remove single quotes
                .replace(/\s+/g, '') // remove all whitespace
                .toLowerCase()
                .trim();
        };

        const normalizePhone = (str) => {
            if (!str) return '';
            return str.toString().replace(/\D/g, ''); // keep only digits
        };

        // Group jobs by unique customer attributes (Name, Phone, Address normalized)
        const customerMap = new Map();

        jobs.forEach(job => {
            const rawName = job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || '-';
            const rawPhone = job['เบอร์โทรลูกค้า (สำหรับเปิดบิล)'] || '-';
            const rawAddress = job['ที่อยู่ลูกค้า (สำหรับเปิดบิล)'] || '-';

            const normName = normalizeStr(rawName);
            const normPhone = normalizePhone(rawPhone);
            const normAddress = normalizeStr(rawAddress);

            // Generate a grouping key
            const groupKey = `${normName}|${normPhone}|${normAddress}`;

            if (customerMap.has(groupKey)) {
                const existing = customerMap.get(groupKey);
                existing.count++;
                // Prefer longer/more complete names if they differ
                if (rawName.length > existing.displayName.length) {
                    existing.displayName = rawName;
                }
                if (rawPhone.length > existing.displayPhone.length && rawPhone !== '-') {
                    existing.displayPhone = rawPhone;
                }
                if (rawAddress.length > existing.displayAddress.length && rawAddress !== '-') {
                    existing.displayAddress = rawAddress;
                }
            } else {
                customerMap.set(groupKey, {
                    displayName: rawName,
                    displayPhone: rawPhone,
                    displayAddress: rawAddress,
                    count: 1
                });
            }
        });

        // Convert map to array, sort by count descending, and take top 10
        const sortedCustomers = Array.from(customerMap.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        if (sortedCustomers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-slate-500">ไม่มีข้อมูลลูกค้า</td></tr>`;
            return;
        }

        // Render rows
        sortedCustomers.forEach((cust, index) => {
            const row = tableBody.insertRow();
            row.className = 'border-b hover:bg-slate-50 transition-colors';
            
            const cleanPhone = cust.displayPhone.replace(/'/g, '');
            const displayAddress = cust.displayAddress.replace(/\n/g, ' ');

            row.innerHTML = `
                <td class="p-3 font-semibold text-slate-700">${index + 1}</td>
                <td class="p-3 font-medium text-slate-900">${cust.displayName}</td>
                <td class="p-3 text-slate-600">${cleanPhone}</td>
                <td class="p-3 text-slate-500 truncate max-w-xs" title="${cust.displayAddress}">${displayAddress}</td>
                <td class="p-3 text-right font-bold text-sky-600">${cust.count} งาน</td>
            `;
        });
    }

    function updateDashboardCards(jobs) {
        const counts = jobs.reduce((acc, job) => {
            acc.allJobs++;
            const status = job['สถานะ'] || '';
            if (status.includes('รออนุมัติ')) acc.pendingReview++;
            else if (status === 'รอรับงาน') acc.pendingAccept++;
            else if (status === 'กำลังดำเนินการ') acc.inProgress++;
            else if (status === 'ปิดงาน') acc.closed++;
            else if (status.includes('ปฏิเสธ')) acc.declined++;
            else if (status.includes('ไม่อนุมัติ')) acc.rejected++;
            return acc;
        }, { allJobs: 0, pendingReview: 0, pendingAccept: 0, inProgress: 0, closed: 0, declined: 0, rejected: 0 });
        // BUG FIX: Added null check to prevent crash if element doesn't exist in DOM.
        Object.keys(counts).forEach(key => {
            const el = document.getElementById(`count-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
            if (el) el.textContent = counts[key];
        });
    }

    function populateActivityTable(jobs, page) {
        currentActivityPage = page;
        const tableBody = document.querySelector('#activity-table tbody');
        const paginationControls = document.getElementById('activity-pagination');
        if (!tableBody || !paginationControls) return;
        tableBody.innerHTML = '';
        paginationControls.innerHTML = '';
        const itemsPerPage = 10;
        const paginatedItems = jobs.slice((page - 1) * itemsPerPage, page * itemsPerPage);
        if (paginatedItems.length === 0) return tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-slate-500">ไม่มีรายการ</td></tr>`;
        
        paginatedItems.forEach(job => {
            const row = tableBody.insertRow();
            row.className = 'border-b';
            // --- START CHANGE: เปลี่ยนเป็น toLocaleString เพื่อแสดงเวลาด้วย ---
            const formattedDate = new Date(job['วันที่แจ้ง']).toLocaleString('th-TH');
            // --- END CHANGE ---
            let fullWorkDetails = job['รายละเอียดการปฏิบัติงาน'] || '-';
            const escapedDetails = fullWorkDetails.replace(/"/g, '&quot;');
            const displayDetails = fullWorkDetails.replace(/\n/g, ' ');

            row.innerHTML = `
                <!-- START CHANGE: เพิ่ม whitespace-nowrap -->
                <td class="p-3 whitespace-nowrap">${formattedDate}</td>
                <!-- END CHANGE -->
                <td class="p-3">${job['ชื่อลูกค้า (สำหรับเปิดบิล)']}</td>
                <td class="p-3">${job['ประเภทงาน'] || '-'}</td>
                <td class="p-3">${job['ชื่อผู้แจ้ง']}</td>
                <td class="p-3 truncate max-w-xs">${job['รายละเอียดการแจ้งงาน']}</td>
                <td class="p-3">${getStatusBadge(job['สถานะ'])}</td>
                <td class="p-3 truncate max-w-xs cursor-pointer hover:text-sky-600 view-details-btn" data-details="${escapedDetails}">${displayDetails}</td>`;
        });
        const totalPages = Math.ceil(jobs.length / itemsPerPage);
        if (totalPages > 1) paginationControls.innerHTML = `<button class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>&lt;&lt;</button><span>หน้า ${page}/${totalPages}</span><button class="pagination-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>&gt;&gt;</button>`;
    }

    // ฟังก์ชันใหม่สำหรับจัดการการค้นหา (รวมข้อความและวันที่)
    function handleDashboardSearch() {
        const searchTerm = document.getElementById('dashboard-search-input').value.toLowerCase();
        const searchDate = document.getElementById('dashboard-date-input').value; // ดึงค่าวันที่

        currentDashboardJobs = allJobsCache.filter(job => {
            // Text search logic
            const customerName = (job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || '').toLowerCase();
            const jobID = (job.JobID || '').toLowerCase();
            const requesterName = (job['ชื่อผู้แจ้ง'] || '').toLowerCase();
            const textMatch = customerName.includes(searchTerm) || jobID.includes(searchTerm) || requesterName.includes(searchTerm);

            // Date search logic
            const jobDate = job['วันที่แจ้ง'] ? new Date(job['วันที่แจ้ง']).toISOString().split('T')[0] : '';
            const dateMatch = !searchDate || jobDate === searchDate; // เป็น true ถ้าไม่ได้เลือกวันที่ หรือ วันที่ตรงกัน

            // --- START CHANGE: เพิ่ม Logic กรองตามสถานะ ---
            const status = job['สถานะ'];
            let statusMatch = true; // Default to true (all)
            if (currentDashboardFilter === 'pending-review') {
                statusMatch = status.includes('รออนุมัติ');
            } else if (currentDashboardFilter === 'pending-accept') {
                statusMatch = status === 'รอรับงาน';
            } else if (currentDashboardFilter === 'in-progress') {
                statusMatch = status === 'กำลังดำเนินการ';
            } else if (currentDashboardFilter === 'closed') {
                statusMatch = status === 'ปิดงาน';
            }
            // --- END CHANGE ---

            return textMatch && dateMatch && statusMatch; // <-- START CHANGE: เพิ่ม statusMatch
        });
        
        // อัปเดตตารางและกลับไปหน้า 1
        populateActivityTable(currentDashboardJobs, 1); 
    }


    // --- RECEIVE/CLOSE JOB WORKFLOW ---
    async function loadAndDisplayReceiveJobs() {
        if (!currentUserData) return;
        const result = await apiCall('getAllJobs');
        if (result && result.status === 'success') {
            allJobsCache = result.data;
            updateSidebarBadges(allJobsCache);
            // เรียกใช้ filterAndDisplayReceiveJobs แทนการ populate โดยตรง
            filterAndDisplayReceiveJobs();
        }
    }

    // ฟังก์ชันใหม่สำหรับกรองและแสดงผลหน้า Receive Job
    function filterAndDisplayReceiveJobs() {
        if (!currentUserData) return;

        const searchTerm = document.getElementById('receive-jobs-search-input')?.value.toLowerCase() || '';

        const isAdmin = currentUserData.Role === 'Admin';
        const isAdminOrManager = currentUserData.Role === 'Admin' || currentUserData.Role === 'Manager';

        // Filter jobs for receiving
        const userCanAccept = currentUserData.CanAcceptJobs === 'TRUE' || currentUserData.CanAcceptJobs === true;
        const jobsToReceiveRaw = userCanAccept ? allJobsCache.filter(j => {
            if (j['สถานะ'] !== 'รอรับงาน') return false;
            if (j['ผู้รับงานจริง']) return false;
            if (isAdmin) return true;
            return j['ผู้รับผิดชอบ']?.includes(currentUserData.Email);
        }) : [];

        // Filter jobs for closing
        const jobsToCloseRaw = allJobsCache.filter(j => {
            if (j['สถานะ'] !== 'กำลังดำเนินการ') return false;
            if (isAdminOrManager) return true;
            return j['ผู้รับงานจริง'] === currentUserData.Email;
        });

        // Apply search and urgency filters
        const filterFn = (job) => {
            // Urgency check
            const requestDate = new Date(job['วันที่แจ้ง']);
            const serviceDate = new Date(job['วันที่ต้องเข้าพื้นที่']);
            const diffHours = (serviceDate - requestDate) / (1000 * 60 * 60);
            const isUrgent = diffHours <= 24;
            const urgencyMatch = (currentReceiveFilter === 'all') ||
                                 (currentReceiveFilter === 'urgent' && isUrgent) ||
                                 (currentReceiveFilter === 'normal' && !isUrgent);

            // Search term check
            const customerName = (job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || '').toLowerCase();
            const jobID = (job.JobID || '').toLowerCase();
            const requesterName = (job['ชื่อผู้แจ้ง'] || '').toLowerCase();
            const searchMatch = !searchTerm || customerName.includes(searchTerm) || jobID.includes(searchTerm) || requesterName.includes(searchTerm);

            return urgencyMatch && searchMatch;
        };

        const jobsToReceiveFiltered = jobsToReceiveRaw.filter(filterFn);
        const jobsToCloseFiltered = jobsToCloseRaw.filter(filterFn);

        // Update headers count badges (Requirement 4 and 5)
        const receiveBadgeEl = document.getElementById('receive-count-badge');
        if (receiveBadgeEl) {
            receiveBadgeEl.textContent = `(พบ ${jobsToReceiveFiltered.length} รายการ)`;
        }
        const closeBadgeEl = document.getElementById('close-count-badge');
        if (closeBadgeEl) {
            closeBadgeEl.textContent = `(พบ ${jobsToCloseFiltered.length} รายการ)`;
        }

        // Pagination for Receive Jobs (10 items per page)
        const itemsPerPage = 10;

        const totalReceiveItems = jobsToReceiveFiltered.length;
        const totalReceivePages = Math.ceil(totalReceiveItems / itemsPerPage) || 1;
        if (currentReceivePage > totalReceivePages) {
            currentReceivePage = totalReceivePages;
        }
        const receiveStartIndex = (currentReceivePage - 1) * itemsPerPage;
        const receiveEndIndex = receiveStartIndex + itemsPerPage;
        const pageReceiveJobs = jobsToReceiveFiltered.slice(receiveStartIndex, receiveEndIndex);

        // Pagination for Close Jobs (10 items per page)
        const totalCloseItems = jobsToCloseFiltered.length;
        const totalClosePages = Math.ceil(totalCloseItems / itemsPerPage) || 1;
        if (currentClosePage > totalClosePages) {
            currentClosePage = totalClosePages;
        }
        const closeStartIndex = (currentClosePage - 1) * itemsPerPage;
        const closeEndIndex = closeStartIndex + itemsPerPage;
        const pageCloseJobs = jobsToCloseFiltered.slice(closeStartIndex, closeEndIndex);

        populateReceiveJobsList('jobs-to-receive-list', pageReceiveJobs, 'ไม่มีใบงานที่รอรับ', 'receive');
        populateReceiveJobsList('jobs-to-close-list', pageCloseJobs, 'ไม่มีใบงานที่ต้องปิด', 'close');

        // Render Pagination Controls (Requirement 2)
        renderReceivePagination('receive-jobs-pagination', totalReceivePages, 'receive');
        renderReceivePagination('close-jobs-pagination', totalClosePages, 'close');
    }

    function renderReceivePagination(containerId, totalPages, type) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (totalPages <= 1) return;

        let currentPage = type === 'receive' ? currentReceivePage : currentClosePage;

        // First page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
        firstBtn.disabled = currentPage === 1;
        firstBtn.addEventListener('click', () => {
            if (type === 'receive') {
                currentReceivePage = 1;
            } else {
                currentClosePage = 1;
            }
            filterAndDisplayReceiveJobs();
        });
        container.appendChild(firstBtn);

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                if (type === 'receive') {
                    currentReceivePage--;
                } else {
                    currentClosePage--;
                }
                filterAndDisplayReceiveJobs();
            }
        });
        container.appendChild(prevBtn);

        // Indicator
        const indicator = document.createElement('span');
        indicator.className = 'text-sm font-semibold text-slate-700 px-2';
        indicator.textContent = `หน้า ${currentPage} / ${totalPages}`;
        container.appendChild(indicator);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                if (type === 'receive') {
                    currentReceivePage++;
                } else {
                    currentClosePage++;
                }
                filterAndDisplayReceiveJobs();
            }
        });
        container.appendChild(nextBtn);

        // Last page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        lastBtn.disabled = currentPage === totalPages;
        lastBtn.addEventListener('click', () => {
            if (type === 'receive') {
                currentReceivePage = totalPages;
            } else {
                currentClosePage = totalPages;
            }
            filterAndDisplayReceiveJobs();
        });
        container.appendChild(lastBtn);
    }

    function populateReceiveJobsList(containerId, jobs, emptyMessage, type) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = jobs.length === 0 ? `<p class="text-slate-500 text-center py-10">${emptyMessage}</p>` :
            jobs.map(job => {
                // Calculate job urgency
                const requestDate = new Date(job['วันที่แจ้ง']);
                const serviceDate = new Date(job['วันที่ต้องเข้าพื้นที่']);
                const diffHours = (serviceDate - requestDate) / (1000 * 60 * 60);
                const isUrgent = diffHours <= 24;

                let buttonsHtml = '';
                let cardClasses = 'bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 space-y-2'; // Base classes

                if (type === 'receive') {
                    buttonsHtml = `<button data-jobid="${job.JobID}" class="preview-job-btn-receive px-4 py-2 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-500/20 bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
                        พรีวิว & รับงาน
                    </button>`;
                } else { // type === 'close'
                    cardClasses += ' job-card-clickable cursor-pointer hover:bg-slate-50 transition'; // Add clickable classes
                    buttonsHtml = `
                    <div class="flex items-center space-x-2">
                        <button data-jobid="${job.JobID}" class="update-job-status-btn px-4 py-2 text-white text-sm font-bold rounded-xl shadow-md shadow-amber-500/10 transition-all duration-200 bg-amber-500 hover:bg-amber-600 hover:-translate-y-0.5 active:translate-y-0">
                            อัพเดทสถานะ
                        </button>
                        <button data-jobid="${job.JobID}" class="close-job-btn px-4 py-2 text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-500/10 transition-all duration-200 bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 active:translate-y-0">
                            ปิดงาน
                        </button>
                    </div>`;
                }

                // Check for Admin role to display assignment details (Requirement 1)
                let assignedInfoHtml = '';
                if (currentUserData && currentUserData.Role === 'Admin') {
                    if (type === 'receive') {
                        // Convert comma-separated emails to display names
                        const assignedNames = emailsToNames(job['ผู้รับผิดชอบ']);
                        assignedInfoHtml = `<p><strong class="font-medium text-slate-800 w-20 inline-block">ผู้รับผิดชอบ:</strong> ${assignedNames}</p>`;
                    } else { // type === 'close'
                        const receiverEmail = job['ผู้รับงานจริง'] || '';
                        const receiverName = userEmailToNameMap[receiverEmail] || receiverEmail || '-';
                        assignedInfoHtml = `<p><strong class="font-medium text-slate-800 w-20 inline-block">ผู้รับงานจริง:</strong> ${receiverName}</p>`;
                    }
                }

                return `
                <div class="${cardClasses}" data-jobid="${job.JobID}">
                    <div class="flex justify-between items-start">
                        <p class="font-bold text-slate-800">${job.JobID}</p>
                        <span class="${isUrgent ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'} text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">${isUrgent ? 'งานด่วน' : 'ปกติ'}</span>
                    </div>
                    <div class="text-sm text-slate-600 space-y-1 border-t pt-2 mt-1">
                        <p><strong class="font-medium text-slate-800 w-20 inline-block">ลูกค้า:</strong> ${job['ชื่อลูกค้า (สำหรับเปิดบิล)']}</p>
                        <p><strong class="font-medium text-slate-800 w-20 inline-block">ผู้แจ้ง:</strong> ${job['ชื่อผู้แจ้ง']}</p>
                        <p><strong class="font-medium text-slate-800 w-20 inline-block">ประเภท:</strong> ${job['ประเภทงาน']}</p>
                        <p><strong class="font-medium text-slate-800 w-20 inline-block">วันที่แจ้ง:</strong> ${new Date(job['วันที่แจ้ง']).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} น.</p>
                        <p class="flex items-start"><strong class="font-medium text-slate-800 w-20 inline-block flex-shrink-0">ปัญหา:</strong> <span>${job['รายละเอียดการแจ้งงาน']}</span></p>
                        ${assignedInfoHtml}
                    </div>
                    <div class="flex justify-end items-center pt-2 border-t mt-2">
                        ${buttonsHtml}
                    </div>
                </div>`;
            }).join('');
    }

    async function handleAcceptJob(jobId) {
        // บังคับต้องมีลายเซนก่อนรับงาน — ถ้าไม่มีให้วาดได้เลย
        if (currentUserData && !currentUserData.SignatureURL) {
            const drawn = await promptAndSaveSignature();
            if (!drawn) return; // ผู้ใช้ยกเลิก
        }
        const result = await apiCall('acceptJob', { jobId, technicianEmail: currentUserData.Email });
        if (result && result.status === 'success') {
            showAlert('รับงานสำเร็จ!');
            document.getElementById('job-preview-modal').style.display = 'none';
            loadAndDisplayReceiveJobs();
        }
    }

    async function handleDeclineJob(jobId) {
        const { value: reason } = await Swal.fire({ title: 'เหตุผลที่ไม่รับงาน', input: 'textarea', inputPlaceholder: 'กรุณาระบุเหตุผล...', showCancelButton: true, confirmButtonText: 'ยืนยัน', inputValidator: (v) => !v && 'คุณต้องระบุเหตุผล' });
        if (reason) {
            const result = await apiCall('declineJob', { jobId, reason, technicianEmail: currentUserData.Email });
            if (result && result.status === 'success') {
                showAlert('ปฏิเสธงานสำเร็จ');
                document.getElementById('job-preview-modal').style.display = 'none';
                loadAndDisplayReceiveJobs();
            }
        }
    }

    async function handleCloseJob(jobId) {
        const { value: details } = await Swal.fire({ title: 'บันทึกการปฏิบัติงาน', input: 'textarea', inputPlaceholder: 'กรอกรายละเอียดสุดท้ายก่อนปิดงาน...', showCancelButton: true, confirmButtonText: 'ปิดงาน', inputValidator: (v) => !v && 'กรุณากรอกรายละเอียด' });
        if (details) {
            const result = await apiCall('closeJob', { jobId, details });
            if (result && result.status === 'success') {
                showAlert('ปิดงานสำเร็จ!');
                document.getElementById('job-preview-modal').style.display = 'none'; // Close preview if open
                loadAndDisplayReceiveJobs();
            }
        }
    }

    async function handleUpdateJobStatus(jobId) {
        const { value: details } = await Swal.fire({
            title: 'อัพเดทสถานะการปฏิบัติงาน',
            input: 'textarea',
            inputPlaceholder: 'กรอกรายละเอียดความคืบหน้าของงานที่นี่...',
            showCancelButton: true,
            confirmButtonText: 'อัพเดท',
            cancelButtonText: 'ยกเลิก',
            inputValidator: (value) => {
                if (!value) {
                    return 'กรุณากรอกรายละเอียด!'
                }
            }
        });

        if (details) {
            const result = await apiCall('updateJobStatus', { jobId, details });
            if (result && result.status === 'success') {
                showAlert('อัพเดทสถานะงานสำเร็จ!');
                loadAndDisplayReceiveJobs(); // Reload the list to show changes
            }
        }
    }

    // --- CUSTOMER MANAGEMENT ---
    async function loadAndCacheCustomers() {
        const result = await apiCallWithoutLoader('getAllCustomers'); // Use without loader for initial load
        if (result && result.status === 'success') {
            allCustomersCache = (result.data || []).filter(Boolean);
            populateDatalist('customer-billing-list', allCustomersCache.map(c => c.BillingName));
        }
    }

    function loadAndDisplayCustomers() {
        currentCustomerPage = 1;
        const searchTermInput = document.getElementById('customer-search-input');
        if (searchTermInput) searchTermInput.value = ''; // Reset search input
        filteredCustomersCache = getDeduplicatedCustomers(allCustomersCache);
        filterAndDisplayCustomers();
    }

    function getDeduplicatedCustomers(rawCustomers) {
        const normalizeStr = (str) => {
            if (!str) return '';
            return str.toString()
                .replace(/'/g, '')
                .replace(/\s+/g, '')
                .toLowerCase()
                .trim();
        };

        const normalizePhone = (str) => {
            if (!str) return '';
            return str.toString().replace(/\D/g, '');
        };

        const customerMap = new Map();

        rawCustomers.forEach(c => {
            const normName = normalizeStr(c.BillingName);
            const normPhone = normalizePhone(c.BillingPhone);
            const normAddress = normalizeStr(c.BillingAddress);
            const key = `${normName}|${normPhone}|${normAddress}`;

            if (customerMap.has(key)) {
                const existing = customerMap.get(key);
                if ((c.BillingName || '').length > (existing.BillingName || '').length) {
                    existing.BillingName = c.BillingName;
                }
                if ((c.BillingPhone || '').length > (existing.BillingPhone || '').length && c.BillingPhone !== '-') {
                    existing.BillingPhone = c.BillingPhone;
                }
                if ((c.BillingAddress || '').length > (existing.BillingAddress || '').length && c.BillingAddress !== '-') {
                    existing.BillingAddress = c.BillingAddress;
                }
            } else {
                customerMap.set(key, { ...c });
            }
        });

        return Array.from(customerMap.values());
    }

    function filterAndDisplayCustomers() {
        const tableBody = document.querySelector('#customers-table tbody');
        if (!tableBody) return;
        
        const searchTerm = document.getElementById('customer-search-input')?.value.toLowerCase() || '';

        // Filter based on search term
        const matchedCustomers = filteredCustomersCache.filter(c => {
            const name = (c.BillingName || '').toLowerCase();
            const phone = (c.BillingPhone || '').replace(/'/g, '').toLowerCase();
            const address = (c.BillingAddress || '').toLowerCase();
            return !searchTerm || name.includes(searchTerm) || phone.includes(searchTerm) || address.includes(searchTerm);
        });

        // Update count badge
        const countBadge = document.getElementById('customers-count-badge');
        if (countBadge) {
            countBadge.textContent = `(พบ ${matchedCustomers.length} รายการ)`;
        }

        // Pagination calculations
        const itemsPerPage = 20;
        const totalItems = matchedCustomers.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        if (currentCustomerPage > totalPages) {
            currentCustomerPage = totalPages;
        }

        const startIndex = (currentCustomerPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageCustomers = matchedCustomers.slice(startIndex, endIndex);

        // Render table rows
        tableBody.innerHTML = '';
        if (pageCustomers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-slate-500">ไม่พบข้อมูลลูกค้า</td></tr>`;
            const paginationControls = document.getElementById('customers-pagination');
            if (paginationControls) paginationControls.innerHTML = '';
            return;
        }

        pageCustomers.forEach(customer => {
            const row = tableBody.insertRow();
            row.className = 'bg-white border-b hover:bg-slate-50 transition-colors';
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">${customer.BillingName}</td>
                <td class="px-6 py-4">${(customer.BillingPhone || '').replace(/'/g, '')}</td>
                <td class="px-6 py-4 truncate max-w-xs" title="${customer.BillingAddress}">${customer.BillingAddress}</td>
                <td class="px-6 py-4">
                    <button data-customer-id="${customer.CustomerID}" class="edit-customer-btn font-medium text-sky-600 hover:underline mr-4">แก้ไข</button>
                    <button data-customer-id="${customer.CustomerID}" class="delete-customer-btn font-medium text-red-600 hover:underline">ลบ</button>
                </td>`;
        });

        // Render pagination controls
        renderCustomersPagination(totalPages);
    }

    function renderCustomersPagination(totalPages) {
        const container = document.getElementById('customers-pagination');
        if (!container) return;
        container.innerHTML = '';

        if (totalPages <= 1) return;

        // "<<" First Page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
        firstBtn.disabled = currentCustomerPage === 1;
        firstBtn.addEventListener('click', () => {
            currentCustomerPage = 1;
            filterAndDisplayCustomers();
        });
        container.appendChild(firstBtn);

        // "<" Previous Page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
        prevBtn.disabled = currentCustomerPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentCustomerPage > 1) {
                currentCustomerPage--;
                filterAndDisplayCustomers();
            }
        });
        container.appendChild(prevBtn);

        // Page Indicator
        const indicator = document.createElement('span');
        indicator.className = 'text-sm font-semibold text-slate-700 px-2';
        indicator.textContent = `หน้า ${currentCustomerPage} / ${totalPages}`;
        container.appendChild(indicator);

        // ">" Next Page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
        nextBtn.disabled = currentCustomerPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentCustomerPage < totalPages) {
                currentCustomerPage++;
                filterAndDisplayCustomers();
            }
        });
        container.appendChild(nextBtn);

        // ">>" Last Page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        lastBtn.disabled = currentCustomerPage === totalPages;
        lastBtn.addEventListener('click', () => {
            currentCustomerPage = totalPages;
            filterAndDisplayCustomers();
        });
        container.appendChild(lastBtn);
    }

    async function showCustomerModal(customer = {}) {
        const isEdit = !!customer.CustomerID;
        const title = isEdit ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่';

        // Ensure dropdown data is available
        const customerTypeOptions = dropdownData.customerTypes || [];

        const { value: formValues, isConfirmed } = await Swal.fire({
            title: title,
            width: '768px',
            customClass: {
                popup: 'rounded-3xl shadow-2xl border border-slate-200/80 p-6',
                title: 'text-xl font-bold text-slate-800 border-b pb-4 !mb-4',
                htmlContainer: '!mx-0 !my-0 !p-0',
                actions: 'mt-6 gap-3',
                confirmButton: 'px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none',
                cancelButton: 'px-6 py-3 bg-slate-500 hover:bg-slate-600 text-white font-bold rounded-xl shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus:ring-4 focus:ring-slate-500/10 focus:outline-none'
            },
            buttonsStyling: false,
            html: `
                <div id="customer-modal-form" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left px-6 py-2 max-h-[60vh] overflow-y-auto">
                    <input type="hidden" id="swal-CustomerID" value="${customer.CustomerID || ''}">
                    
                    <div class="md:col-span-2">
                        <h3 class="font-bold text-indigo-600 border-b pb-2 mb-2 text-base">ข้อมูลสำหรับเปิดบิล</h3>
                    </div>
                    <div>
                        <label for="swal-BillingName" class="block text-sm font-semibold text-slate-700">ชื่อลูกค้า*</label>
                        <input id="swal-BillingName" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${customer.BillingName || ''}" required>
                    </div>
                    <div>
                        <label for="swal-BillingPhone" class="block text-sm font-semibold text-slate-700">เบอร์โทร</label>
                        <input id="swal-BillingPhone" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${(customer.BillingPhone || '').replace(/'/g, '')}">
                    </div>
                    <div class="md:col-span-2">
                        <label for="swal-BillingAddress" class="block text-sm font-semibold text-slate-700">ที่อยู่</label>
                        <textarea id="swal-BillingAddress" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" rows="2">${customer.BillingAddress || ''}</textarea>
                    </div>

                    <div class="md:col-span-2 mt-4">
                        <h3 class="font-bold text-indigo-600 border-b pb-2 mb-2 text-base">ข้อมูลสำหรับเข้าบริการ</h3>
                    </div>
                    <div>
                        <label for="swal-ServiceName" class="block text-sm font-semibold text-slate-700">ชื่อผู้ติดต่อ</label>
                        <input id="swal-ServiceName" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${customer.ServiceName || ''}">
                    </div>
                    <div>
                        <label for="swal-ServicePhone" class="block text-sm font-semibold text-slate-700">เบอร์โทร</label>
                        <input id="swal-ServicePhone" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${(customer.ServicePhone || '').replace(/'/g, '')}">
                    </div>
                    <div class="md:col-span-2">
                        <label for="swal-ServiceAddress" class="block text-sm font-semibold text-slate-700">ที่อยู่</label>
                        <textarea id="swal-ServiceAddress" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" rows="2">${customer.ServiceAddress || ''}</textarea>
                    </div>
                    
                    <div class="md:col-span-2 mt-4">
                        <h3 class="font-bold text-indigo-600 border-b pb-2 mb-2 text-base">ข้อมูลบริการ</h3>
                    </div>
                    <div>
                        <label for="swal-CustomerType" class="block text-sm font-semibold text-slate-700">ประเภทลูกค้า</label>
                        <select id="swal-CustomerType" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800 bg-white">
                            <option value="">-- กรุณาเลือก --</option>
                            ${customerTypeOptions.map(opt => `<option value="${opt}" ${customer.CustomerType === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="swal-ServiceFrequency" class="block text-sm font-semibold text-slate-700">ความถี่บริการ</label>
                        <input id="swal-ServiceFrequency" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${customer.ServiceFrequency || ''}">
                    </div>
                    <div>
                        <label for="swal-ContractPeriod" class="block text-sm font-semibold text-slate-700">ระยะสัญญา (เดือน)</label>
                        <input id="swal-ContractPeriod" type="number" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${customer.ContractPeriod || ''}">
                    </div>
                    <div>
                        <label for="swal-ServiceStartDate" class="block text-sm font-semibold text-slate-700">วันที่เริ่มบริการ</label>
                        <input id="swal-ServiceStartDate" type="date" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${formatDateForInput(customer.ServiceStartDate || '')}">
                    </div>
                    <div class="md:col-span-2">
                        <label for="swal-BillToDepartment" class="block text-sm font-semibold text-slate-700">เรียกเก็บกับแผนก</label>
                        <input id="swal-BillToDepartment" class="w-full mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none text-sm text-slate-800" value="${customer.BillToDepartment || ''}">
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: isEdit ? 'บันทึก' : 'เพิ่ม',
            cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const BillingName = document.getElementById('swal-BillingName').value;
                if (!BillingName) {
                    Swal.showValidationMessage(`กรุณากรอกชื่อลูกค้า`);
                    return false;
                }
                const contractPeriod = document.getElementById('swal-ContractPeriod').value;
                const serviceStartDate = document.getElementById('swal-ServiceStartDate').value;
                let serviceEndDate = '';
                if(contractPeriod && serviceStartDate){
                    const startDate = new Date(serviceStartDate);
                    startDate.setMonth(startDate.getMonth() + parseInt(contractPeriod, 10));
                    serviceEndDate = startDate.toISOString().split('T')[0];
                }

                return {
                    CustomerID: document.getElementById('swal-CustomerID').value,
                    BillingName: BillingName,
                    BillingPhone: `'${document.getElementById('swal-BillingPhone').value}`,
                    BillingAddress: document.getElementById('swal-BillingAddress').value,
                    ServiceName: document.getElementById('swal-ServiceName').value,
                    ServicePhone: `'${document.getElementById('swal-ServicePhone').value}`,
                    ServiceAddress: document.getElementById('swal-ServiceAddress').value,
                    CustomerType: document.getElementById('swal-CustomerType').value,
                    ServiceFrequency: document.getElementById('swal-ServiceFrequency').value,
                    ContractPeriod: contractPeriod,
                    ServiceStartDate: serviceStartDate,
                    ServiceEndDate: serviceEndDate,
                    BillToDepartment: document.getElementById('swal-BillToDepartment').value,
                };
            }
        });

        if (isConfirmed && formValues) {
            const result = await apiCall('addOrUpdateCustomer', formValues);
            if (result && result.status === 'success') {
                showAlert(result.message);
                await loadAndCacheCustomers();
                loadAndDisplayCustomers(); // Refresh the table in case we are on that view
            }
        }
    }

    async function handleDeleteCustomer(customerId) {
        const { isConfirmed } = await Swal.fire({
            title: 'คุณแน่ใจหรือไม่?',
            text: "คุณจะไม่สามารถกู้คืนข้อมูลลูกค้าได้!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก'
        });

        if (isConfirmed) {
            const result = await apiCall('deleteCustomer', { CustomerID: customerId });
            if (result && result.status === 'success') {
                showAlert(result.message);
                await loadAndCacheCustomers();
                loadAndDisplayCustomers();
            }
        }
    }


    // --- JOB HISTORY ---
    async function loadAndDisplayJobHistory() {
        const result = await apiCall('getAllJobs');
        if (result && result.status === 'success') {
            allJobsCache = result.data;
            updateSidebarBadges(allJobsCache);
            currentHistoryPage = 1;
            const searchInput = document.getElementById('history-search-input');
            if (searchInput) searchInput.value = '';
            filterAndDisplayHistory();
        }
    }

    function filterAndDisplayHistory() {
        const container = document.getElementById('job-history-container');
        if (!container) return;

        const searchTerm = document.getElementById('history-search-input')?.value.toLowerCase() || '';

        // 1. Group jobs by customer name
        const groupedJobs = allJobsCache.reduce((acc, job) => {
            const customerName = job['ชื่อลูกค้า (สำหรับเปิดบิล)'] || 'N/A';
            (acc[customerName] = acc[customerName] || []).push(job);
            return acc;
        }, {});

        // 2. Filter customer names by search term
        const customerNames = Object.keys(groupedJobs).sort();
        const matchedNames = customerNames.filter(name => !searchTerm || name.toLowerCase().includes(searchTerm));

        // 3. Pagination calculations
        const itemsPerPage = 20;
        const totalItems = matchedNames.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

        if (currentHistoryPage > totalPages) {
            currentHistoryPage = totalPages;
        }

        const startIndex = (currentHistoryPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageNames = matchedNames.slice(startIndex, endIndex);

        // 4. Render HTML list
        container.innerHTML = pageNames.length === 0 ? `<p class="text-slate-500 text-center py-10">ไม่พบประวัติ</p>` :
            pageNames.map(customerName => {
                const jobs = groupedJobs[customerName].sort((a,b) => new Date(b.Timestamp) - new Date(a.Timestamp));
                return `<div class="border border-slate-200 rounded-lg overflow-hidden customer-history-item" data-customer-name="${customerName.toLowerCase()}">
                    <button class="accordion-header w-full text-left p-4 bg-slate-50 hover:bg-slate-100 flex justify-between items-center transition">
                        <div><h3 class="font-semibold">${customerName}</h3><p class="text-sm text-slate-500">จำนวน ${jobs.length} ครั้ง</p></div>
                        <i class="fa-solid fa-chevron-down transition-transform"></i>
                    </button>
                    <div class="accordion-content bg-white" style="max-height: 0px; overflow: hidden; transition: max-height 0.3s ease-out;">
                        <div class="overflow-x-auto"><table class="w-full text-sm">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-100"><tr>${['เลขที่', 'วันที่', 'รายละเอียด', 'สถานะ', 'จัดการ'].map(h => `<th class="p-3 text-left">${h}</th>`).join('')}</tr></thead>
                            <tbody>${jobs.map(j => {
                                let fullWorkDetails = j['รายละเอียดการปฏิบัติงาน'] || '-';
                                const escapedDetails = fullWorkDetails.replace(/"/g, '&quot;');
                                const displayDetails = fullWorkDetails.replace(/\n/g, ' ');

                                return `<tr class="border-b">
                                    <td class="p-3">${j.JobID}</td>
                                    <td class="p-3 whitespace-nowrap">${new Date(j['วันที่แจ้ง']).toLocaleString('th-TH')}</td>
                                    <td class="p-3 truncate max-w-xs cursor-pointer hover:text-sky-600 view-details-btn" data-details="${escapedDetails}">${displayDetails}</td>
                                    <td class="p-3">${getStatusBadge(j['สถานะ'])}</td>
                                    <td class="p-3"><button data-jobid="${j.JobID}" data-status="${j['สถานะ']}" class="preview-job-btn font-medium text-sky-600 hover:underline text-sm">พรีวิว</button></td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table></div>
                    </div>
                </div>`;
            }).join('');

        // 5. Render Pagination Controls
        renderHistoryPagination(totalPages);
    }

    function renderHistoryPagination(totalPages) {
        const container = document.getElementById('history-pagination');
        if (!container) return;
        container.innerHTML = '';

        if (totalPages <= 1) return;

        // "<<" First Page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.innerHTML = '<i class="fa-solid fa-angles-left"></i>';
        firstBtn.disabled = currentHistoryPage === 1;
        firstBtn.addEventListener('click', () => {
            currentHistoryPage = 1;
            filterAndDisplayHistory();
        });
        container.appendChild(firstBtn);

        // "<" Previous Page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
        prevBtn.disabled = currentHistoryPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentHistoryPage > 1) {
                currentHistoryPage--;
                filterAndDisplayHistory();
            }
        });
        container.appendChild(prevBtn);

        // Page Indicator
        const indicator = document.createElement('span');
        indicator.className = 'text-sm font-semibold text-slate-700 px-2';
        indicator.textContent = `หน้า ${currentHistoryPage} / ${totalPages}`;
        container.appendChild(indicator);

        // ">" Next Page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
        nextBtn.disabled = currentHistoryPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentHistoryPage < totalPages) {
                currentHistoryPage++;
                filterAndDisplayHistory();
            }
        });
        container.appendChild(nextBtn);

        // ">>" Last Page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.innerHTML = '<i class="fa-solid fa-angles-right"></i>';
        lastBtn.disabled = currentHistoryPage === totalPages;
        lastBtn.addEventListener('click', () => {
            currentHistoryPage = totalPages;
            filterAndDisplayHistory();
        });
        container.appendChild(lastBtn);
    }

    // --- INITIALIZATION & EVENT LISTENERS ---
    function setupEventListeners() {
        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (signupForm) signupForm.addEventListener('submit', handleSignup);
        if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', handleForgotPassword);
        document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
        document.getElementById('show-signup-btn')?.addEventListener('click', () => showView('signup-view'));
        document.getElementById('show-forgot-password-btn')?.addEventListener('click', () => showView('forgot-password-view'));
        document.getElementById('back-to-login-from-signup')?.addEventListener('click', () => showView('login-view'));
        document.getElementById('back-to-login-from-forgot')?.addEventListener('click', () => showView('login-view'));

        document.querySelectorAll('.sidebar-item').forEach(item => item.addEventListener('click', e => { e.preventDefault(); showView(e.currentTarget.dataset.view); }));
        document.querySelectorAll('.settings-card').forEach(card => card.addEventListener('click', e => { e.preventDefault(); showView(e.currentTarget.dataset.view); }));
        document.querySelectorAll('.back-to-settings-btn').forEach(btn => btn.addEventListener('click', () => showView('settings-view')));

        if (profileUpdateForm) profileUpdateForm.addEventListener('submit', handleProfileUpdate);
        if (signatureUpdateForm) signatureUpdateForm.addEventListener('submit', handleSignatureUpdate);

        document.getElementById('show-add-jobType-modal')?.addEventListener('click', () => handleShowAddDropdownModal('jobType', 'เพิ่มประเภทงาน'));
        document.getElementById('show-add-customerType-modal')?.addEventListener('click', () => handleShowAddDropdownModal('customerType', 'เพิ่มประเภทลูกค้า'));
        document.getElementById('show-add-department-modal')?.addEventListener('click', () => handleShowAddDropdownModal('department', 'เพิ่มแผนก'));

        document.getElementById('dropdown-settings-view')?.addEventListener('click', e => {
            const btn = e.target.closest('.edit-item-btn, .delete-item-btn');
            if (!btn) return;
            const listContainer = btn.closest('div[id$="-list"]');
            if (!listContainer) return;
            const itemValue = btn.closest('.flex')?.querySelector('.item-value')?.textContent;
            if (!itemValue) return;
            // BUG FIX: Use a reliable map instead of fragile string manipulation
            // to determine the dropdown type from the container's ID.
            const typeMap = {
                'jobTypes-list': 'jobType',
                'customerTypes-list': 'customerType',
                'departments-list': 'department'
            };
            const type = typeMap[listContainer.id];
            if (!type) return;
            if (btn.classList.contains('edit-item-btn')) handleUpdateDropdownItem(type, itemValue);
            else handleDeleteDropdownItem(type, itemValue);
        });
        
        document.getElementById('user-permissions-view')?.addEventListener('change', async e => {
            const { email } = e.target.dataset;
            let result;
            let successMessage = 'อัปเดตสำเร็จ!';
            
            if (e.target.classList.contains('role-select')) {
                const newRole = e.target.value;
                result = await apiCall('updateUserRole', { email, newRole });
                successMessage = 'อัปเดตสิทธิ์สำเร็จ!';
            } else if (e.target.classList.contains('department-select')) {
                const newDepartment = e.target.value;
                result = await apiCall('updateUserDepartment', { email, newDepartment });
                successMessage = 'อัปเดตแผนก/หน่วยงานสำเร็จ!';
            } else if (e.target.classList.contains('approval-level-select')) {
                result = await apiCall('updateUserApprovalLevel', { email, newLevel: e.target.value });
            } else if (e.target.classList.contains('can-accept-jobs-checkbox')) {
                result = await apiCall('updateUserCanAcceptJobs', { email, canAccept: e.target.checked });
            }
            
            if (result?.status === 'success') {
                showAlert(successMessage);
            } else {
                loadAndDisplayUsers();
            }
        });
        document.getElementById('user-permissions-view')?.addEventListener('click', async e => {
             if (e.target.classList.contains('delete-user-btn')) {
                const { email, name } = e.target.dataset;
                const { isConfirmed } = await Swal.fire({ title: `ลบผู้ใช้ ${name}?`, text: `คุณต้องการลบผู้ใช้ "${name}" ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ใช่, ลบเลย!' });
                if (isConfirmed) {
                    const result = await apiCall('deleteUser', { emailToDelete: email });
                    if (result?.status === 'success') { showAlert('ลบผู้ใช้สำเร็จ!'); loadAndDisplayUsers(); }
                }
            }
        });
        
        if (jobRequestForm) jobRequestForm.addEventListener('submit', handleJobRequestSubmit);
        document.getElementById('draw-new-sig-btn')?.addEventListener('click', () => { isUsingSavedSignature = false; setupIntelligentSignaturePad(); });
        document.getElementById('use-saved-sig-btn')?.addEventListener('click', () => { isUsingSavedSignature = true; setupIntelligentSignaturePad(); });

        document.getElementById('approval-filter-buttons')?.addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON') {
                currentApprovalFilter = e.target.dataset.filter;
                document.querySelectorAll('#approval-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                filterAndDisplayApprovalJobs();
            }
        });

        // --- START CHANGE: เพิ่ม Event Listener สำหรับปุ่มกรองหน้า Dashboard ---
        document.getElementById('dashboard-filter-buttons')?.addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON') {
                currentDashboardFilter = e.target.dataset.filter;
                // อัปเดตปุ่ม active
                document.querySelectorAll('#dashboard-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                // เรียกใช้ฟังก์ชันค้นหา/กรองข้อมูลใหม่
                handleDashboardSearch();
            }
        });
        // --- END CHANGE ---

        // แก้ไข event listener ของ dashboard-search-input ให้เรียกใช้ handleDashboardSearch
        document.getElementById('dashboard-search-input')?.addEventListener('keyup', handleDashboardSearch);
        // เพิ่ม event listener สำหรับช่องวันที่
        document.getElementById('dashboard-date-input')?.addEventListener('change', handleDashboardSearch);

        document.getElementById('receive-job-view')?.addEventListener('click', e => {
            const card = e.target.closest('.job-card-clickable');
            const btn = e.target.closest('button[data-jobid]');

            // If a button was clicked, handle the button action
            if (btn) {
                const { jobid } = btn.dataset;
                if (btn.classList.contains('preview-job-btn-receive')) {
                    showJobPreview(jobid, 'receive');
                } else if (btn.classList.contains('close-job-btn')) {
                    handleCloseJob(jobid);
                } else if (btn.classList.contains('update-job-status-btn')) {
                    handleUpdateJobStatus(jobid);
                }
                return; // Stop further processing
            }
            
            // If the card itself (but not a button) was clicked
            if (card) {
                const { jobid } = card.dataset;
                const job = allJobsCache.find(j => j.JobID === jobid);
                if (job) {
                    const workDetails = job['รายละเอียดการปฏิบัติงาน'] || 'ยังไม่มีการบันทึก';
                    Swal.fire({
                        title: `รายละเอียดงาน: ${jobid}`,
                        html: `<div class="text-left whitespace-pre-wrap p-4 bg-slate-50 rounded-md">${workDetails.replace(/\n/g, '<br>')}</div>`,
                        confirmButtonText: 'ปิด'
                    });
                }
            }
        });

        // เพิ่ม event listener สำหรับ filter หน้า Receive Job
        document.getElementById('receive-filter-buttons')?.addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON') {
                currentReceiveFilter = e.target.dataset.filter;
                document.querySelectorAll('#receive-filter-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                currentReceivePage = 1;
                currentClosePage = 1;
                filterAndDisplayReceiveJobs(); // เรียกใช้ filter ใหม่
            }
        });

        // เพิ่ม event listener สำหรับ search หน้า Receive Job
        document.getElementById('receive-jobs-search-input')?.addEventListener('keyup', () => {
            currentReceivePage = 1;
            currentClosePage = 1;
            filterAndDisplayReceiveJobs();
        });


        const sidebar = document.getElementById('sidebar');
        document.getElementById('open-sidebar-btn')?.addEventListener('click', () => sidebar.classList.remove('-translate-x-full'));
        document.getElementById('close-sidebar-btn')?.addEventListener('click', () => sidebar.classList.add('-translate-x-full'));
        
        window.addEventListener('resize', () => { resizePad(signaturePad); resizePad(newSignaturePad); });

        setupTableSearch('user-search-input', 'users-table');
        
        // --- การเปลี่ยนแปลง: เปลี่ยนจากการใช้ setupTableSearch มาใช้ event listeners ที่กำหนดเอง ---
        // setupTableSearch('jobs-search-input', 'jobs-table'); // ลบ dòng นี้
        document.getElementById('jobs-search-input')?.addEventListener('keyup', handleDownloadJobsSearch);
        document.getElementById('jobs-date-input')?.addEventListener('change', handleDownloadJobsSearch);
        // --- จบการเปลี่ยนแปลง ---

        document.getElementById('approval-jobs-search-input')?.addEventListener('keyup', () => {
            currentApprovalPage = 1;
            filterAndDisplayApprovalJobs();
        });
        document.getElementById('history-search-input')?.addEventListener('keyup', () => {
            currentHistoryPage = 1;
            filterAndDisplayHistory();
        });
        document.getElementById('customer-search-input')?.addEventListener('keyup', () => {
            currentCustomerPage = 1;
            filterAndDisplayCustomers();
        });
        
        document.body.addEventListener('click', e => {
            const btn = e.target.closest('.preview-job-btn');
            if (btn) {
                const { jobid, status } = btn.dataset;
                const context = btn.closest('#approve-job-view') ? 'approval' : 'download';
                showJobPreview(jobid, context, status);
            }
        });

        document.getElementById('activity-pagination')?.addEventListener('click', e => {
            if(e.target.matches('.pagination-btn')) populateActivityTable(currentDashboardJobs, parseInt(e.target.dataset.page));
        });

        const activityTableBody = document.querySelector('#activity-table tbody');
        if (activityTableBody) {
            activityTableBody.addEventListener('click', e => {
                if (e.target.classList.contains('view-details-btn')) {
                    const details = e.target.dataset.details;
                    Swal.fire({
                        title: 'รายละเอียดการปฏิบัติงาน',
                        html: `<div class="text-left whitespace-pre-wrap p-4 bg-slate-50 rounded-md">${details}</div>`,
                        confirmButtonText: 'ปิด'
                    });
                }
            });
        }

        // Toggle accordion and view details for job history
        document.getElementById('job-history-container')?.addEventListener('click', e => {
            // 1. Accordion Header Toggle
            const header = e.target.closest('.accordion-header');
            if (header) {
                const content = header.nextElementSibling;
                const icon = header.querySelector('i');
                if (content && content.classList.contains('accordion-content')) {
                    const isOpen = content.style.maxHeight && content.style.maxHeight !== '0px';
                    if (isOpen) {
                        content.style.maxHeight = '0px';
                        if (icon) icon.style.transform = '';
                    } else {
                        content.style.maxHeight = content.scrollHeight + 'px';
                        if (icon) icon.style.transform = 'rotate(180deg)';
                    }
                }
                return;
            }

            // 2. View details pop-up
            if (e.target.classList.contains('view-details-btn')) {
                const details = e.target.dataset.details;
                Swal.fire({
                    title: 'รายละเอียดการปฏิบัติงาน',
                    html: `<div class="text-left whitespace-pre-wrap p-4 bg-slate-50 rounded-md">${details}</div>`,
                    confirmButtonText: 'ปิด'
                });
                return;
            }
        });

        document.getElementById('add-customer-btn')?.addEventListener('click', () => showCustomerModal());

        document.getElementById('customers-table')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-customer-btn');
            if (editBtn) {
                const customerId = editBtn.dataset.customerId;
                // BUG FIX: Search in filteredCustomersCache (deduplicated) first,
                // then fall back to allCustomersCache in case of mismatch.
                let customerData = filteredCustomersCache.find(c => c.CustomerID === customerId);
                if (!customerData) {
                    customerData = allCustomersCache.find(c => c.CustomerID === customerId);
                }
                if (customerData) showCustomerModal(customerData);
            }

            const deleteBtn = e.target.closest('.delete-customer-btn');
            if (deleteBtn) {
                handleDeleteCustomer(deleteBtn.dataset.customerId);
            }
        });

        // Auto-populate form on new job page
        document.getElementById('billingName')?.addEventListener('input', (e) => {
            const customerName = e.target.value;
            const customerData = allCustomersCache.find(c => c.BillingName === customerName);
            if (customerData) {
                // Billing info
                document.getElementById('billingPhone').value = (customerData.BillingPhone || '').replace(/'/g, '');
                document.getElementById('billingAddress').value = customerData.BillingAddress || '';
                // Service Info
                document.getElementById('serviceName').value = customerData.ServiceName || '';
                document.getElementById('servicePhone').value = (customerData.ServicePhone || '').replace(/'/g, '');
                document.getElementById('serviceAddress').value = customerData.ServiceAddress || '';
                // Service Details
                document.getElementById('customerType').value = customerData.CustomerType || '';
                document.getElementById('serviceStartDate').value = formatDateForInput(customerData.ServiceStartDate);
                document.getElementById('contractPeriod').value = customerData.ContractPeriod || '';
                document.getElementById('serviceEndDate').value = formatDateForInput(customerData.ServiceEndDate);
                document.getElementById('serviceFrequency').value = customerData.ServiceFrequency || '';
                document.getElementById('billToDepartment').value = customerData.BillToDepartment || '';
                
                // Trigger change for checkbox if addresses are the same
                const sameAsBilling = document.getElementById('sameAsBilling');
                if (customerData.BillingName === customerData.ServiceName && customerData.BillingPhone === customerData.ServicePhone && customerData.BillingAddress === customerData.ServiceAddress) {
                    sameAsBilling.checked = true;
                } else {
                    sameAsBilling.checked = false;
                }
                sameAsBilling.dispatchEvent(new Event('change')); // To trigger readonly state
            }
        });

        document.getElementById('close-preview-modal')?.addEventListener('click', () => {
            document.getElementById('job-preview-modal').style.display = 'none';
        });
    }
    
    function setupSignaturePads(){
        const canvas = document.getElementById('signature-pad');
        if (canvas) {
            signaturePad = new SignaturePad(canvas, { backgroundColor: 'rgba(255, 255, 255, 0)', penColor: 'rgb(0, 0, 0)' });
            document.getElementById('clear-signature')?.addEventListener('click', () => signaturePad.clear());
        }
        const newCanvas = document.getElementById('new-signature-pad');
        if (newCanvas) {
            newSignaturePad = new SignaturePad(newCanvas, { backgroundColor: 'rgba(255, 255, 255, 0)', penColor: 'rgb(0, 0, 0)' });
            document.getElementById('clear-new-signature')?.addEventListener('click', () => newSignaturePad.clear());
            document.getElementById('upload-signature-input')?.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file?.type === "image/png") {
                    const reader = new FileReader();
                    reader.onload = (event) => { newSignaturePad.clear(); newSignaturePad.fromDataURL(event.target.result); }
                    reader.readAsDataURL(file);
                } else showAlert('กรุณาอัปโหลดไฟล์ .png เท่านั้น', 'error');
                e.target.value = null;
            });
        }
    }

    function formatDateForInput(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
        } catch (e) {
            return '';
        }
    }

    async function initializeApp(email){
        if(!email) return;
        // Fetch user data first so currentUserData is populated for other loaders
        await fetchAndPopulateUserData(email);
        
        await Promise.all([
            loadAndDisplayApprovalJobs(),
            loadAndCacheCustomers(),
            loadAndCacheUserMap() // Cache user email->name map for display
        ]);
        setupNewJobForm();
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        setupEventListeners();
        setupSignaturePads();
        fetchAndPopulateDropdowns();

        const loggedInUserEmail = sessionStorage.getItem('loggedInUser');
        if (loggedInUserEmail) {
            Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            // --- START CHANGE ---
            initializeApp(loggedInUserEmail).then(() => {
                // Now, call showView and await its async data load
                return showView('dashboard-view'); 
            }).then(() => {
                // This .then() will execute after showView's async action (loadDashboardData) completes
                Swal.close(); // Close the spinner AFTER data is loaded
            }).catch(error => {
            // --- END CHANGE ---
                console.error("Initialization failed:", error);
                Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการโหลดข้อมูล', text: 'กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง' });
                handleLogout();
            });
        } else {
            showView('login-view');
        }
    });


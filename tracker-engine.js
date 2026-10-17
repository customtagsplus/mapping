const ADMIN_PASSWORD = "admin123";
const dbUrl = "https://firebaseio.com";

let driverStyles = {
    driver_1: { name: "Driver 1", color: "#00ffcc" },
    driver_2: { name: "Driver 2", color: "#ff007f" },
    driver_3: { name: "Driver 3", color: "#39ff14" },
    driver_4: { name: "Driver 4", color: "#ff5e00" }
};

let map, currentRole = "viewer", watchId = null, isTracking = false, fleetData = {}, isAdminAuthenticated = false;

async function fbRequest(path, method, data = null) {
    try {
        await fetch(`${dbUrl}/${path}.json`, { method, body: data ? JSON.stringify(data) : null });
    } catch(e) { console.error(e); }
}

function startSyncLoop() {
    setInterval(async () => {
        try {
            let r = await fetch(`${dbUrl}/.json`);
            let data = await r.json() || {};
            processFleet(data.fleet || {});
            processMeta(data.fleet_metadata || {});
        } catch(e) {}
    }, 2000);
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("driver-selector").addEventListener("change", (e) => handleRoleChange(e.target.value));
    document.getElementById("action-btn").addEventListener("click", toggleTracking);
    document.getElementById("admin-btn").addEventListener("click", toggleAdmin);
    document.getElementById("close-admin").addEventListener("click", () => document.getElementById("admin-panel").style.display = "none");
    document.getElementById("save-name-btn").addEventListener("click", saveName);
    document.getElementById("wipe-btn").addEventListener("click", wipeData);
    document.getElementById("share-btn").addEventListener("click", () => { navigator.clipboard.writeText(window.location.href); alert("Link Copied!"); });

    initMap();
    startSyncLoop();
});

function initMap() {
    // Renders the open-source map background canvas layer directly without requiring API tokens
    map = L.map('map').setView([43.5446, -96.7311], 13);
    
    // Smooth custom dark mode theme tiles configuration applied natively
    L.tileLayer('https://{s}://{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function processMeta(meta) {
    Object.keys(driverStyles).forEach(id => {
        if (meta[id] && meta[id].name) {
            driverStyles[id].name = meta[id].name;
            let opt = document.getElementById(`opt-${id}`);
            if (opt) { opt.textContent = `${meta[id].name} (${id.replace('_', ' ')})`; }
            let cardName = document.querySelector(`#card-${id} .driver-title-label`);
            if (cardName) cardName.textContent = meta[id].name;
        }
    });
}

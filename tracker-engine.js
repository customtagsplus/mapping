const GOOGLE_MAPS_API_KEY = "AIzaSyBWyV2U6ZFTTxbyHrMFt9Y1IhUXt-uD9_8";
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

    // Secure validation structure to force browser to draw the Map canvas layer
    let s = document.createElement("script");
    s.src = `https://googleapis.com{GOOGLE_MAPS_API_KEY}&callback=initMap&v=weekly`;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
    startSyncLoop();
});

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 13, center: { lat: 43.5446, lng: -96.7311 }, mapTypeId: 'roadmap',
        styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }, { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] }]
    });
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

function processFleet(fleet) {
    Object.keys(fleetData).forEach(id => { if (!fleet[id]) removeDriver(id); });
    let activeCount = 0;
    Object.keys(driverStyles).forEach((driverId) => {
        let record = fleet[driverId] || {};
        let tel = record.telemetry || { active: false, speed: 0 };
        let pts = Object.values(record.path || {}).map(pt => ({ lat: pt.lat, lng: pt.lng }));
        if (pts.length > 0 || tel.active) {
            activeCount++;
            if(map) {
                initDriverOnMap(driverId);
                fleetData[driverId].polyline.setPath(pts);
                if (tel.lat && tel.lng) {
                    fleetData[driverId].marker.setPosition({ lat: tel.lat, lng: tel.lng });
                    fleetData[driverId].marker.setVisible(true);
                    if (currentRole === driverId && isTracking) map.panTo({ lat: tel.lat, lng: tel.lng });
                }
            }
            updateCard(driverId, tel, pts.length);
        } else { removeDriver(driverId); }
    });
    document.getElementById("no-drivers").style.display = (activeCount === 0) ? "block" : "none";
}

function toggleAdmin() {
    let panel = document.getElementById("admin-panel");
    if (panel.style.display === "block") { panel.style.display = "none"; return; }
    if (!isAdminAuthenticated) {
        if (prompt("🔑 Enter Admin Password:") === ADMIN_PASSWORD) { isAdminAuthenticated = true; panel.style.display = "block"; }
        else { alert("Access Denied."); }
    } else { panel.style.display = "block"; }
}

function saveName() {
    let id = document.getElementById("admin-driver-pick").value;
    let name = document.getElementById("new-name-input").value.trim();
    if (!name) return;
    fbRequest(`fleet_metadata/${id}`, 'PUT', { name }).then(() => { 
        document.getElementById("new-name-input").value = ""; 
        alert("Driver renamed successfully!"); 
    });
}

function wipeData() {
    if (confirm("🚨 Wipe all painted trails?")) { fbRequest('fleet', 'DELETE').then(() => alert("All tracks wiped.")); }
}

function handleRoleChange(role) {
    if (isTracking) toggleTracking();
    currentRole = role;
    let btn = document.getElementById("action-btn");
    let badge = document.getElementById("role-badge");
    if (currentRole === "viewer") { btn.style.display = "none"; badge.textContent = "Viewer / Dashboard Mode"; }
    else { btn.style.display = "inline-block"; badge.textContent = `Driver Selected: ${driverStyles[currentRole].name}`; }
}

function toggleTracking() {
    let btn = document.getElementById("action-btn");
    if (isTracking) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        isTracking = false; btn.textContent = "Start Driving"; btn.style.backgroundColor = "#059669";
        fbRequest(`fleet/${currentRole}/telemetry`, 'PUT', { active: false, speed: 0 });
    } else {
        if (!navigator.geolocation) return alert("Geolocation unsupported.");
        isTracking = true; btn.textContent = "Stop Driving"; btn.style.backgroundColor = "#be123c";
        watchId = navigator.geolocation.watchPosition((pos) => {
            let lat = pos.coords.latitude, lng = pos.coords.longitude;
            let speed = ((pos.coords.speed || 0) * 2.23694).toFixed(1);
            fbRequest(`fleet/${currentRole}/path`, 'POST', { lat, lng, timestamp: Date.now() });
            fbRequest(`fleet/${currentRole}/telemetry`, 'PUT', { active: true, speed, lat, lng });
        }, (err) => {}, { enableHighAccuracy: true });
    }
}

function initDriverOnMap(id) {
    if (!fleetData[id] && map) {
        let color = driverStyles[id].color;
        let polyline = new google.maps.Polyline({ path: [], strokeColor: color, strokeOpacity: 0.8, strokeWeight: 8, map: map });
        let marker = new google.maps.Marker({ position: { lat: 0, lng: 0 }, map: map, visible: false, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
        fleetData[id] = { polyline, marker };
    }
}

function updateCard(id, tel, count) {
    let card = document.getElementById(`card-${id}`);
    if (!card) {
        card = document.createElement("div"); card.id = `card-${id}`; card.className = "fleet-card";
        document.getElementById("fleet-list").appendChild(card);
    }
    card.innerHTML = `<div class="card-row"><span class="driver-title-label" style="color:${driverStyles[id].color}">${driverStyles[id].name}</span><span style="color:${tel.active ? '#34d399':'#6b7280'}">${tel.active ? 'PAINTING':'IDLE'}</span></div>
    <div class="card-row" style="color:#9ca3af; margin-top:5px;"><span>Speed: <b>${tel.speed || 0} mph</b></span><span>Points: <b>${count}</b></span></div>`;
}

function removeDriver(id) {
    if (fleetData[id]) { if(fleetData[id].polyline) fleetData[id].polyline.setMap(null); if(fleetData[id].marker) fleetData[id].marker.setMap(null); delete fleetData[id]; }
    let card = document.getElementById(`card-${id}`); if (card) card.remove();
}

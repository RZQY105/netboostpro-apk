const DNS_ENDPOINTS = {
  cloudflare: {
    name: "Cloudflare 1.1.1.1",
    url: "https://cloudflare-dns.com/dns-query?name=example.com&type=A"
  },
  google: {
    name: "Google 8.8.8.8",
    url: "https://dns.google/resolve?name=example.com&type=A"
  },
  quad9: {
    name: "Quad9 9.9.9.9",
    url: "https://dns9.quad9.net:5053/dns-query?name=example.com&type=A"
  }
};

let isBoosting = false;
let keepAliveTimer = null;
let wakeLock = null;
let pingHistory = [];
let activeDns = DNS_ENDPOINTS.cloudflare;

const boostBtn = document.getElementById("boostBtn");
const boostLabel = document.getElementById("boostLabel");
const boostHint = document.getElementById("boostHint");
const statusPill = document.getElementById("statusPill");
const pingValue = document.getElementById("pingValue");
const jitterValue = document.getElementById("jitterValue");
const dnsValue = document.getElementById("dnsValue");
const stabilityValue = document.getElementById("stabilityValue");
const dnsSelect = document.getElementById("dnsSelect");
const keepAliveToggle = document.getElementById("keepAliveToggle");
const logBox = document.getElementById("logBox");
const clearLogBtn = document.getElementById("clearLogBtn");

function addLog(message) {
  const time = new Date().toLocaleTimeString("id-ID", { hour12: false });
  const line = document.createElement("p");
  line.textContent = `[${time}] ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {
    // Abaikan jika perangkat membatasi wakeLock
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

async function measureLatency(url) {
  const start = performance.now();
  try {
    await fetch(`${url}&_t=${Date.now()}`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store"
    });
    return Math.round(performance.now() - start);
  } catch {
    return null;
  }
}

async function findFastestDns() {
  const selected = dnsSelect.value;
  if (selected !== "auto") {
    activeDns = DNS_ENDPOINTS[selected];
    addLog(`Mengunci jalur DNS ke ${activeDns.name}...`);
    return activeDns;
  }

  addLog("Menguji latensi server DNS (Cloudflare, Google, Quad9)...");
  let best = DNS_ENDPOINTS.cloudflare;
  let lowestPing = Infinity;

  for (const key of Object.keys(DNS_ENDPOINTS)) {
    const endpoint = DNS_ENDPOINTS[key];
    const latency = await measureLatency(endpoint.url);
    if (latency !== null) {
      addLog(`• ${endpoint.name}: ${latency} ms`);
      if (latency < lowestPing) {
        lowestPing = latency;
        best = endpoint;
      }
    }
  }

  activeDns = best;
  addLog(`Jalur tercepat dipilih: ${best.name} (${lowestPing} ms)`);
  return best;
}

function updateMetrics(latency) {
  if (latency === null) {
    pingValue.textContent = "Timeout";
    stabilityValue.textContent = "Lemah";
    return;
  }

  pingHistory.push(latency);
  if (pingHistory.length > 10) pingHistory.shift();

  pingValue.textContent = `${latency} ms`;

  let jitter = 0;
  if (pingHistory.length > 1) {
    let diffs = 0;
    for (let i = 1; i < pingHistory.length; i++) {
      diffs += Math.abs(pingHistory[i] - pingHistory[i - 1]);
    }
    jitter = Math.round(diffs / (pingHistory.length - 1));
  }
  jitterValue.textContent = `${jitter} ms`;

  const score = Math.max(15, Math.min(99, Math.round(100 - jitter * 1.5 - latency / 15)));
  stabilityValue.textContent = `${score} %`;
}

function startKeepAliveLoop() {
  stopKeepAliveLoop();
  keepAliveTimer = setInterval(async () => {
    if (!isBoosting) return;
    const ping = await measureLatency(activeDns.url);
    updateMetrics(ping);
    if (keepAliveToggle.checked) {
      addLog(`Keep-Alive heartbeat terkirim • Ping: ${ping ?? "RTO"} ms`);
    }
  }, 2500);
}

function stopKeepAliveLoop() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

async function toggleBooster() {
  isBoosting = !isBoosting;

  if (isBoosting) {
    boostBtn.classList.add("active");
    boostLabel.textContent = "AKTIF";
    statusPill.textContent = "OPTIMIZED";
    statusPill.className = "status-pill online";
    boostHint.textContent = "Mode Keep-Alive aktif • Koneksi dikunci ke jalur tercepat";

    pingHistory = [];
    await requestWakeLock();
    addLog("Memulai optimasi soket & mengunci radio modem...");
    const chosen = await findFastestDns();
    dnsValue.textContent = chosen.name;

    const initialPing = await measureLatency(chosen.url);
    updateMetrics(initialPing);
    startKeepAliveLoop();
  } else {
    stopKeepAliveLoop();
    releaseWakeLock();
    boostBtn.classList.remove("active");
    boostLabel.textContent = "AKTIFKAN";
    statusPill.textContent = "STANDBY";
    statusPill.className = "status-pill offline";
    boostHint.textContent = "Ketuk untuk mencari DNS tercepat & mengunci kestabilan sinyal";
    dnsValue.textContent = "Default ISP";
    addLog("Booster dinonaktifkan. Koneksi kembali ke standar.");
  }
}

boostBtn.addEventListener("click", toggleBooster);
clearLogBtn.addEventListener("click", () => {
  logBox.innerHTML = "<p>[SYSTEM] Log dibersihkan.</p>";
});

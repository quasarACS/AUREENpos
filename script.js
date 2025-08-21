// --- INICIO: CONFIGURACIÓN DE FIREBASE ---
// REEMPLAZA ESTO CON LA CONFIGURACIÓN REAL DE TU PROYECTO
const firebaseConfig = {
  apiKey: "AIzaSyBI38TK3ISnHBSOaXfouYAhNf-yXgM7EIE",
  authDomain: "aureenpos.firebaseapp.com",
  projectId: "aureenpos",
  storageBucket: "aureenpos.firebasestorage.app",
  messagingSenderId: "960599055342",
  appId: "1:960599055342:web:73f44f0892890e399b4cff",
  measurementId: "G-Z59MRLMDSS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// --- FIN: CONFIGURACIÓN DE FIREBASE ---


// --- ESTADO GLOBAL ---
let state = {
    factura: {
        cliente: "",
        cedula: "",
        tasa: 0,
        items: [{ name: '', price: '' }]
    }
};

// --- FUNCIÓN PARA OBTENER TASA BCV ---
async function fetchBCVRate() {
    try {
        const bcvUrl = encodeURIComponent('https://www.bcv.org.ve/');
        const proxyUrl = `https://corsproxy.io/?${bcvUrl}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Respuesta del proxy no fue OK. Estatus: ${response.status}`);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const dolarDiv = doc.querySelector('#dolar strong');
        if (!dolarDiv) throw new Error("No se encontró el elemento '#dolar strong'.");
        const rateStr = dolarDiv.textContent.trim();
        const rateNum = parseFloat(rateStr.replace(',', '.'));
        if (isNaN(rateNum)) throw new Error(`El texto '${rateStr}' no se pudo convertir a número.`);
        state.factura.tasa = rateNum;
        document.getElementById('factura-tasa').value = rateNum.toFixed(2);
        updateInvoice();
    } catch (error) {
        console.error("Error al obtener la tasa del BCV:", error);
    }
}

// --- INICIALIZACIÓN ---
window.onload = function() {
    try { 
        Telegram.WebApp.ready(); 
    } catch (e) { 
        console.log("Modo de prueba local."); 
    }
    fetchBCVRate();
    initializeFactura();
};

// --- FUNCIÓN PARA GUARDAR EN FIREBASE (CON INICIALIZACIÓN INTELIGENTE) ---
async function saveInvoiceToFirebase() {
    // LA CLAVE ESTÁ AQUÍ: Inicializamos Firebase SOLO cuando se va a guardar.
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(firebaseConfig);
        } catch (e) {
            console.error("Error al inicializar Firebase. Revisa tu objeto firebaseConfig.", e);
            alert("Error de configuración de Firebase. La factura no se puede guardar.");
            return;
        }
    }
    const db = firebase.firestore();

    // El resto de la lógica de guardado
    const hayItemsValidos = state.factura.items.some(item => item.name && item.price);
    if (!state.factura.cliente || !hayItemsValidos) {
        alert("Por favor, añade un cliente y al menos un producto con precio antes de guardar.");
        return;
    }
    const saveButton = document.getElementById('save-invoice-btn');
    saveButton.innerText = "Guardando...";
    saveButton.disabled = true;

    try {
        const totalUSD = state.factura.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
        const invoiceData = {
            cliente: state.factura.cliente,
            cedula: state.factura.cedula,
            tasa: state.factura.tasa,
            items: state.factura.items.filter(item => item.name && item.price),
            totalUSD: totalUSD,
            totalBs: totalUSD * state.factura.tasa,
            fecha: new Date()
        };
        const docRef = await db.collection("facturas").add(invoiceData);
        console.log("Factura guardada con ID: ", docRef.id);
        saveButton.innerText = "¡Guardado con Éxito!";
        setTimeout(() => {
            saveButton.innerText = "Guardar Factura";
            saveButton.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Error al guardar la factura: ", error);
        alert("Hubo un error al guardar la factura. Revisa la consola.");
        saveButton.innerText = "Error al Guardar";
         setTimeout(() => {
            saveButton.innerText = "Guardar Factura";
            saveButton.disabled = false;
        }, 2000);
    }
}

// --- LÓGICA DEL SISTEMA DE FACTURACIÓN ---
function initializeFactura() {
    document.getElementById('factura-fecha').innerText = new Date().toLocaleDateString('es-VE');
    renderInvoiceItems();
    updateInvoice();
}
function addInvoiceItem() {
    state.factura.items.push({ name: '', price: '' });
    renderInvoiceItems();
}
function removeInvoiceItem(index) {
    if (state.factura.items.length > 1) {
        state.factura.items.splice(index, 1);
        renderInvoiceItems();
        updateInvoice();
    }
}
function renderInvoiceItems() {
    const container = document.getElementById('factura-items-container');
    container.innerHTML = '';
    state.factura.items.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'invoice-item';
        itemDiv.innerHTML = `
            <input type="text" class="item-name" placeholder="Producto ${index + 1}" value="${item.name}" oninput="updateItem(${index}, 'name', this.value)">
            <input type="number" class="item-price" placeholder="Precio ($)" value="${item.price}" oninput="updateItem(${index}, 'price', this.value)">
            <button class="delete-item-btn" onclick="removeInvoiceItem(${index})">-</button>
        `;
        container.appendChild(itemDiv);
    });
}
function updateItem(index, field, value) {
    state.factura.items[index][field] = value;
    updateInvoice();
}
function updateInvoice() {
    state.factura.cliente = document.getElementById('factura-cliente').value;
    state.factura.cedula = document.getElementById('factura-cedula').value;
    state.factura.tasa = parseFloat(document.getElementById('factura-tasa').value) || 0;
    let totalUSD = state.factura.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
    let totalBs = totalUSD * state.factura.tasa;
    let itemCount = state.factura.items.filter(item => item.name && item.price).length;
    document.getElementById('factura-preview-cliente').innerText = state.factura.cliente || 'N/A';
    document.getElementById('factura-preview-cedula').innerText = state.factura.cedula || 'N/A';
    document.getElementById('factura-preview-tasa').innerText = state.factura.tasa.toFixed(2);
    const itemsPreview = document.getElementById('factura-preview-items');
    itemsPreview.innerHTML = '';
    state.factura.items.forEach(item => {
        if (item.name && item.price) {
            const li = document.createElement('li');
            const priceBs = (parseFloat(item.price) || 0) * state.factura.tasa;
            li.innerHTML = `<span>${item.name} ($${parseFloat(item.price).toFixed(2)})</span> <span>Bs ${priceBs.toFixed(2)}</span>`;
            itemsPreview.appendChild(li);
        }
    });
    document.getElementById('factura-preview-item-count').innerText = itemCount;
    document.getElementById('factura-preview-total-usd').innerText = `$${totalUSD.toFixed(2)}`;
    document.getElementById('factura-preview-total-bs').innerText = `Bs ${totalBs.toFixed(2)}`;
}
function clearInvoice() {
    state.factura = {
        cliente: "",
        cedula: "",
        tasa: state.factura.tasa,
        items: [{ name: '', price: '' }]
    };
    document.getElementById('factura-cliente').value = "";
    document.getElementById('factura-cedula').value = "";
    renderInvoiceItems();
    updateInvoice();
}

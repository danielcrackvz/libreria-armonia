// ========================================
// Librería Armonía - Interfaz de Venta (POS)
// ========================================

let currentUser = null;
let allProductos = [];
let carrito = {};          // { id_producto: { nombre, marca, precio_venta, cantidad, stock_actual } }
let metodoPagoActual = null;
let montoRecibido = 0;
let qrConfirmado = false;
let configNegocio = { nombre_negocio: 'Librería Armonía', qr_pago_url: '' };

document.addEventListener('DOMContentLoaded', async () => {
    await checkSession();
    await cargarConfiguracion();
    await cargarProductos();
    setupBusqueda();
});

// ========== SESIÓN ==========
async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const { data: perfil, error } = await db
        .from('usuarios').select('*, roles(nombre_rol)')
        .eq('id_usuario', session.user.id).single();

    if (error || !perfil || perfil.estado !== 'activo') {
        await db.auth.signOut();
        window.location.href = 'login.html';
        return;
    }

    currentUser = { id_usuario: perfil.id_usuario, nombres: perfil.nombres, rol: perfil.roles?.nombre_rol };
    document.getElementById('vendedoraNombre').textContent = perfil.nombres;
}

async function logout() {
    await db.auth.signOut();
    window.location.href = 'login.html';
}

async function cargarConfiguracion() {
    const { data } = await db.from('configuracion_negocio').select('*').limit(1).single();
    if (data) configNegocio = data;
}

// ========== CATÁLOGO ==========
async function cargarProductos() {
    const { data, error } = await db
        .from('productos')
        .select('*, marcas(nombre_marca)')
        .eq('estado', 'activo')
        .gt('stock_actual', 0)
        .order('nombre_producto');

    const grid = document.getElementById('productosGrid');
    if (error) { grid.innerHTML = '<p class="text-muted">Error al cargar productos</p>'; return; }

    allProductos = data || [];
    renderProductosGrid(allProductos);
}

function renderProductosGrid(lista) {
    const grid = document.getElementById('productosGrid');
    if (!lista.length) { grid.innerHTML = '<p class="text-muted">No se encontraron productos</p>'; return; }

    grid.innerHTML = lista.map(p => {
        const cantidadEnCarrito = carrito[p.id_producto]?.cantidad || 0;
        return `
        <div class="producto-card">
            <div class="producto-imagen">
                ${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre_producto}">` : '<i class="fas fa-image"></i>'}
            </div>
            <div class="producto-nombre">${p.nombre_producto}</div>
            <div class="producto-marca">${p.marcas?.nombre_marca || 'Genérico'}</div>
            <div class="producto-precio">Bs. ${parseFloat(p.precio_venta).toFixed(2)}</div>
            <div class="producto-stock">Stock: ${p.stock_actual}</div>
            <div class="cantidad-selector">
                <button onclick="cambiarCantidad(${p.id_producto}, -1)"><i class="fas fa-minus"></i></button>
                <span id="cant-${p.id_producto}">${cantidadEnCarrito}</span>
                <button onclick="cambiarCantidad(${p.id_producto}, 1)"><i class="fas fa-plus"></i></button>
            </div>
        </div>`;
    }).join('');
}

function setupBusqueda() {
    document.getElementById('buscarProducto').addEventListener('input', function () {
        const q = this.value.toLowerCase();
        const filtrados = allProductos.filter(p =>
            p.nombre_producto.toLowerCase().includes(q) ||
            (p.marcas?.nombre_marca || '').toLowerCase().includes(q)
        );
        renderProductosGrid(filtrados);
    });
}

// ========== CARRITO ==========
function cambiarCantidad(idProducto, delta) {
    const producto = allProductos.find(p => p.id_producto === idProducto);
    if (!producto) return;

    const actual = carrito[idProducto]?.cantidad || 0;
    const nueva = actual + delta;

    if (nueva <= 0) {
        delete carrito[idProducto];
    } else if (nueva > producto.stock_actual) {
        showNotification(`Solo hay ${producto.stock_actual} en stock`, 'error');
        return;
    } else {
        carrito[idProducto] = {
            nombre: producto.nombre_producto,
            marca: producto.marcas?.nombre_marca || '',
            precio_venta: parseFloat(producto.precio_venta),
            cantidad: nueva,
            stock_actual: producto.stock_actual
        };
    }

    document.getElementById(`cant-${idProducto}`).textContent = carrito[idProducto]?.cantidad || 0;
    actualizarBarraCarrito();
}

function actualizarBarraCarrito() {
    const items = Object.values(carrito);
    const totalCantidad = items.reduce((acc, i) => acc + i.cantidad, 0);
    const totalMonto = items.reduce((acc, i) => acc + i.cantidad * i.precio_venta, 0);

    const barra = document.getElementById('carritoBar');
    if (totalCantidad === 0) { barra.classList.add('oculto'); return; }

    barra.classList.remove('oculto');
    document.getElementById('carritoCantidad').textContent = `${totalCantidad} producto${totalCantidad > 1 ? 's' : ''}`;
    document.getElementById('carritoTotal').textContent = `Bs. ${totalMonto.toFixed(2)}`;
}

function totalCarrito() {
    return Object.values(carrito).reduce((acc, i) => acc + i.cantidad * i.precio_venta, 0);
}

// ========== VISTAS ==========
function mostrarVistaOrden() {
    document.getElementById('vistaCatalogo').classList.add('oculto');
    document.getElementById('vistaOrden').classList.remove('oculto');
    document.getElementById('carritoBar').classList.add('oculto');
    renderOrden();
}

function mostrarVistaCatalogo() {
    document.getElementById('vistaOrden').classList.add('oculto');
    document.getElementById('vistaCatalogo').classList.remove('oculto');
    actualizarBarraCarrito();
}

function renderOrden() {
    const items = Object.entries(carrito);
    const contenedor = document.getElementById('ordenItems');
    contenedor.innerHTML = items.map(([id, item]) => `
        <div class="orden-item-row">
            <span>${item.nombre} ${item.marca ? `(${item.marca})` : ''} x${item.cantidad}</span>
            <strong>Bs. ${(item.cantidad * item.precio_venta).toFixed(2)}</strong>
        </div>`).join('');

    document.getElementById('ordenTotalMonto').textContent = `Bs. ${totalCarrito().toFixed(2)}`;

    // Reset del panel de pago cada vez que se entra a la orden
    metodoPagoActual = null;
    montoRecibido = 0;
    qrConfirmado = false;
    document.getElementById('panelEfectivo').classList.add('oculto');
    document.getElementById('panelQr').classList.add('oculto');
    document.getElementById('btnEfectivo').classList.remove('activo');
    document.getElementById('btnQr').classList.remove('activo');
    document.getElementById('inputMontoOtro').value = '';
    document.getElementById('checkPagoQrConfirmado').checked = false;
    document.getElementById('qrImagen').src = configNegocio.qr_pago_url || '';
    actualizarEstadoBotonRegistrar();
}

// ========== MÉTODO DE PAGO ==========
function seleccionarMetodoPago(metodo) {
    metodoPagoActual = metodo;
    document.getElementById('btnEfectivo').classList.toggle('activo', metodo === 'efectivo');
    document.getElementById('btnQr').classList.toggle('activo', metodo === 'qr');
    document.getElementById('panelEfectivo').classList.toggle('oculto', metodo !== 'efectivo');
    document.getElementById('panelQr').classList.toggle('oculto', metodo !== 'qr');

    if (metodo === 'efectivo') { montoRecibido = 0; actualizarResultadoCambio(); }
    actualizarEstadoBotonRegistrar();
}

function setMontoRecibido(valor) {
    montoRecibido = parseFloat(valor) || 0;
    if (document.activeElement.id !== 'inputMontoOtro') {
        document.getElementById('inputMontoOtro').value = montoRecibido;
    }
    actualizarResultadoCambio();
    actualizarEstadoBotonRegistrar();
}

function actualizarResultadoCambio() {
    const total = totalCarrito();
    const cambio = montoRecibido - total;
    document.getElementById('montoRecibidoTexto').textContent = `Bs. ${montoRecibido.toFixed(2)}`;
    document.getElementById('cambioTexto').textContent = `Bs. ${(cambio > 0 ? cambio : 0).toFixed(2)}`;
    document.getElementById('cambioTexto').style.color = cambio < 0 ? 'var(--error)' : 'var(--success)';
}

document.addEventListener('change', (e) => {
    if (e.target.id === 'checkPagoQrConfirmado') {
        qrConfirmado = e.target.checked;
        actualizarEstadoBotonRegistrar();
    }
});

function actualizarEstadoBotonRegistrar() {
    const total = totalCarrito();
    let habilitado = false;

    if (metodoPagoActual === 'efectivo') {
        habilitado = montoRecibido >= total && total > 0;
    } else if (metodoPagoActual === 'qr') {
        habilitado = qrConfirmado && total > 0;
    }

    document.getElementById('btnRegistrarVenta').disabled = !habilitado;
}

// ========== REGISTRAR VENTA ==========
async function registrarVenta() {
    const total = totalCarrito();
    if (total <= 0) return;

    showLoading();

    const cambio = metodoPagoActual === 'efectivo' ? Math.max(montoRecibido - total, 0) : 0;

    const { data: venta, error: errorVenta } = await db.from('ventas').insert([{
        id_usuario: currentUser.id_usuario,
        id_cliente: null,
        metodo_pago: metodoPagoActual,
        monto_recibido: metodoPagoActual === 'efectivo' ? montoRecibido : null,
        cambio: cambio,
        total: total
    }]).select().single();

    if (errorVenta) {
        hideLoading();
        showNotification('Error al registrar la venta: ' + errorVenta.message, 'error');
        return;
    }

    const detalleItems = Object.entries(carrito).map(([id_producto, item]) => ({
        id_venta: venta.id_venta,
        id_producto: parseInt(id_producto),
        cantidad: item.cantidad,
        precio_unitario: item.precio_venta
    }));

    const { error: errorDetalle } = await db.from('detalle_ventas').insert(detalleItems);

    hideLoading();

    if (errorDetalle) {
        showNotification('La venta se creó pero hubo un error en el detalle: ' + errorDetalle.message, 'error');
        return;
    }

    generarComprobantePDF(venta, cambio);
    showNotification('¡Venta registrada con éxito!', 'success');

    // Reset y volver al catálogo
    carrito = {};
    await cargarProductos();
    mostrarVistaCatalogo();
}

// ========== COMPROBANTE PDF ==========
function generarComprobantePDF(venta, cambio) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [80, 150] }); // formato tipo ticket

    let y = 10;
    doc.setFontSize(12);
    doc.text(configNegocio.nombre_negocio || 'Librería Armonía', 40, y, { align: 'center' });
    y += 6;
    doc.setFontSize(8);
    doc.text('Comprobante interno de venta', 40, y, { align: 'center' });
    y += 4;
    doc.text(`Fecha: ${new Date().toLocaleString('es-ES')}`, 5, y);
    y += 4;
    doc.text(`Vendedora: ${currentUser.nombres}`, 5, y);
    y += 4;
    doc.text('----------------------------------------', 5, y);
    y += 4;

    Object.values(carrito).forEach(item => {
        doc.text(`${item.nombre}`, 5, y);
        y += 4;
        doc.text(`  ${item.cantidad} x Bs.${item.precio_venta.toFixed(2)}`, 5, y);
        doc.text(`Bs.${(item.cantidad * item.precio_venta).toFixed(2)}`, 75, y, { align: 'right' });
        y += 5;
    });

    doc.text('----------------------------------------', 5, y);
    y += 5;
    doc.setFontSize(10);
    doc.text('TOTAL:', 5, y);
    doc.text(`Bs. ${venta.total.toFixed(2)}`, 75, y, { align: 'right' });
    y += 5;
    doc.setFontSize(8);
    doc.text(`Método de pago: ${venta.metodo_pago === 'efectivo' ? 'Efectivo' : 'QR'}`, 5, y);
    y += 4;
    if (venta.metodo_pago === 'efectivo') {
        doc.text(`Recibido: Bs. ${venta.monto_recibido.toFixed(2)}`, 5, y);
        y += 4;
        doc.text(`Cambio: Bs. ${cambio.toFixed(2)}`, 5, y);
        y += 4;
    }
    y += 3;
    doc.text('¡Gracias por su compra!', 40, y, { align: 'center' });

    doc.save(`venta_${venta.id_venta}.pdf`);
}

// ========== HELPERS ==========
function showLoading() { document.getElementById('loadingOverlay').classList.add('show'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }

function showNotification(message, type = 'success') {
    const colors = { success: '#4CAF50', error: '#f44336', info: '#08435a' };
    const n = document.createElement('div');
    n.style.cssText = `position:fixed;top:20px;right:20px;left:20px;max-width:400px;margin:0 auto;background:${colors[type]};color:white;padding:1rem 1.5rem;border-radius:12px;z-index:10000;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.3);text-align:center;`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3500);
}
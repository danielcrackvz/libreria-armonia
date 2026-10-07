// ========================================
// Librería Armonía - Dashboard JavaScript
// ========================================

let currentUser = null;   // { id_usuario, nombres, apellidos, nombre_usuario, rol }
let currentSection = 'dashboard';
let allProductos = [];

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async function () {
    await checkSession();
    initializeDashboard();
    setupEventListeners();
});

async function checkSession() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    const { data: perfil, error } = await db
        .from('usuarios')
        .select('*, roles(nombre_rol)')
        .eq('id_usuario', session.user.id)
        .single();

    if (error || !perfil) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = {
        id_usuario: perfil.id_usuario,
        nombres: perfil.nombres,
        apellidos: perfil.apellidos,
        nombre_usuario: perfil.nombre_usuario,
        rol: perfil.roles?.nombre_rol || 'Vendedor'
    };

    // Un vendedor no debería estar aquí: lo mandamos a su interfaz simplificada
    if (currentUser.rol === 'Vendedor') {
        window.location.href = 'venta.html';
        return;
    }

    document.getElementById('userName').textContent = currentUser.nombre_usuario;
    document.getElementById('userRole').textContent = `(${currentUser.rol})`;

    aplicarPermisosPorRol();
}

// Oculta secciones del menú y botones que no correspondan al rol actual
function aplicarPermisosPorRol() {
    document.querySelectorAll('[data-roles]').forEach(el => {
        const permitidos = el.getAttribute('data-roles').split(',').map(r => r.trim());
        if (!permitidos.includes(currentUser.rol)) {
            el.style.display = 'none';
        }
    });
}

function initializeDashboard() {
    showSection('dashboard');
    loadDashboardStats();
    loadAlertasStock();
}

function setupEventListeners() {
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');

            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.closest('.nav-item').classList.add('active');

            showSection(section);
            updatePageTitle(section);

            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('open');
            }
        });
    });

    document.getElementById('userMenu').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('userDropdown').classList.toggle('show');
    });

    document.addEventListener('click', function () {
        document.getElementById('userDropdown').classList.remove('show');
    });

    const searchInput = document.getElementById('searchProducto');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const q = this.value.toLowerCase();
            const filtered = allProductos.filter(p =>
                p.nombre_producto.toLowerCase().includes(q) ||
                (p.marcas?.nombre_marca || '').toLowerCase().includes(q)
            );
            displayProductosTable(filtered);
        });
    }

    const configForm = document.getElementById('configForm');
    if (configForm) {
        configForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            showLoading();
            const fd = new FormData(e.target);
            const { error } = await db.from('configuracion_negocio')
                .update({
                    nombre_negocio: fd.get('nombre_negocio'),
                    qr_pago_url: fd.get('qr_pago_url'),
                    updated_at: new Date().toISOString()
                })
                .eq('id_config', 1);
            hideLoading();
            if (error) { showNotification('Error al guardar configuración', 'error'); return; }
            showNotification('Configuración guardada', 'success');
        });
    }
}

function showSection(name) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${name}-section`);
    if (target) {
        target.classList.add('active');
        currentSection = name;
        loadSectionData(name);
    }
}

function updatePageTitle(section) {
    const titles = {
        dashboard: 'Dashboard', productos: 'Productos', marcas: 'Marcas',
        categorias: 'Categorías', proveedores: 'Proveedores', compras: 'Compras',
        ventas: 'Ventas', clientes: 'Clientes', usuarios: 'Usuarios', configuracion: 'Configuración'
    };
    document.getElementById('pageTitle').textContent = titles[section] || 'Librería Armonía';
}

async function loadSectionData(section) {
    showLoading();
    try {
        switch (section) {
            case 'dashboard': await loadDashboardStats(); await loadAlertasStock(); break;
            case 'productos': await loadProductos(); break;
            case 'marcas': await loadMarcas(); break;
            case 'categorias': await loadCategorias(); break;
            case 'proveedores': await loadProveedores(); break;
            case 'compras': await loadCompras(); break;
            case 'ventas': await loadVentas(); break;
            case 'clientes': await loadClientes(); break;
            case 'usuarios': await loadUsuarios(); break;
            case 'configuracion': await loadConfiguracion(); break;
        }
    } catch (err) {
        console.error('Error cargando sección:', err);
        showNotification('Error al cargar datos', 'error');
    } finally {
        hideLoading();
    }
}

// ========== DASHBOARD STATS ==========
async function loadDashboardStats() {
    try {
        const { count: totalProductos } = await db
            .from('productos').select('*', { count: 'exact', head: true }).eq('estado', 'activo');
        document.getElementById('statProductos').textContent = totalProductos || 0;

        const { count: stockBajo } = await db
            .from('productos').select('*', { count: 'exact', head: true })
            .eq('estado', 'activo').filter('stock_actual', 'lte', 'stock_minimo');
        document.getElementById('statStockBajo').textContent = stockBajo || 0;

        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
        const { data: ventasHoy } = await db.from('ventas').select('total')
            .gte('created_at', hoy.toISOString()).lt('created_at', manana.toISOString());
        const totalHoy = (ventasHoy || []).reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0);
        document.getElementById('statVentasHoy').textContent = `Bs. ${totalHoy.toFixed(2)}`;

        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        const { data: comprasMes } = await db.from('compras').select('total')
            .gte('created_at', inicioMes.toISOString());
        const totalComprasMes = (comprasMes || []).reduce((acc, c) => acc + (parseFloat(c.total) || 0), 0);
        document.getElementById('statComprasMes').textContent = `Bs. ${totalComprasMes.toFixed(2)}`;
    } catch (err) {
        console.error('Error stats:', err);
    }
}

async function loadAlertasStock() {
    const { data } = await db.from('productos')
        .select('nombre_producto, stock_actual, stock_minimo, marcas(nombre_marca)')
        .eq('estado', 'activo').order('stock_actual').limit(6);

    const container = document.getElementById('stockBajoList');
    const bajos = (data || []).filter(p => p.stock_actual <= p.stock_minimo);
    if (!bajos.length) { container.innerHTML = '<p class="text-muted">No hay productos con stock bajo</p>'; return; }
    container.innerHTML = bajos.map(p => `
        <div class="alert-item">
            <span>${p.nombre_producto} ${p.marcas ? `(${p.marcas.nombre_marca})` : ''}</span>
            <span class="badge badge-warning">${p.stock_actual} / ${p.stock_minimo}</span>
        </div>`).join('');
}

// ========== PRODUCTOS ==========
async function loadProductos() {
    const { data, error } = await db
        .from('productos')
        .select('*, categorias(nombre_categoria), marcas(nombre_marca), proveedores(nombre_proveedor)')
        .eq('estado', 'activo')
        .order('nombre_producto');

    if (error) { showNotification('Error cargando productos', 'error'); return; }
    allProductos = data || [];
    displayProductosTable(allProductos);
}

function displayProductosTable(data) {
    const container = document.getElementById('productosContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay productos registrados</p>'; return; }

    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>Imagen</th><th>Nombre</th><th>Categoría</th><th>Marca</th><th>Precio Venta</th><th>Stock</th><th>Acciones</th></tr></thead>
                <tbody>
                    ${data.map(p => `
                    <tr>
                        <td>${p.imagen_url ? `<img src="${p.imagen_url}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">` : '<i class="fas fa-image text-muted"></i>'}</td>
                        <td><strong>${p.nombre_producto}</strong></td>
                        <td>${p.categorias?.nombre_categoria || '—'}</td>
                        <td>${p.marcas?.nombre_marca || '—'}</td>
                        <td>Bs. ${parseFloat(p.precio_venta).toFixed(2)}</td>
                        <td><span class="badge ${p.stock_actual <= p.stock_minimo ? 'badge-warning' : 'badge-success'}">${p.stock_actual}</span></td>
                        <td class="table-actions">
                            <button class="btn-icon btn-delete" onclick="eliminarProducto(${p.id_producto})" title="Desactivar"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div></div>`;
}

// ========== MARCAS ==========
async function loadMarcas() {
    const { data, error } = await db.from('marcas').select('*').order('nombre_marca');
    if (error) { showNotification('Error cargando marcas', 'error'); return; }
    const container = document.getElementById('marcasContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay marcas registradas</p>'; return; }
    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Marca</th></tr></thead>
                <tbody>${data.map(m => `<tr><td>${m.id_marca}</td><td><strong>${m.nombre_marca}</strong></td></tr>`).join('')}</tbody>
            </table>
        </div></div>`;
}

// ========== CATEGORÍAS ==========
async function loadCategorias() {
    const { data, error } = await db.from('categorias').select('*').order('nombre_categoria');
    if (error) { showNotification('Error cargando categorías', 'error'); return; }
    const container = document.getElementById('categoriasContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay categorías registradas</p>'; return; }
    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Nombre</th><th>Descripción</th></tr></thead>
                <tbody>${data.map(c => `<tr><td>${c.id_categoria}</td><td><strong>${c.nombre_categoria}</strong></td><td>${c.descripcion || '—'}</td></tr>`).join('')}</tbody>
            </table>
        </div></div>`;
}

// ========== PROVEEDORES ==========
async function loadProveedores() {
    const { data, error } = await db.from('proveedores').select('*').eq('estado', 'activo').order('nombre_proveedor');
    if (error) { showNotification('Error cargando proveedores', 'error'); return; }
    const container = document.getElementById('proveedoresContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay proveedores registrados</p>'; return; }
    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Nombre</th><th>NIT</th><th>Contacto</th><th>Teléfono</th></tr></thead>
                <tbody>${data.map(p => `
                    <tr><td>${p.id_proveedor}</td><td><strong>${p.nombre_proveedor}</strong></td><td>${p.nit || '—'}</td><td>${p.contacto || '—'}</td><td>${p.telefono || '—'}</td></tr>
                `).join('')}</tbody>
            </table>
        </div></div>`;
}

// ========== COMPRAS ==========
async function loadCompras() {
    const { data, error } = await db
        .from('compras')
        .select('*, proveedores(nombre_proveedor), detalle_compras(cantidad, precio_unitario, subtotal, productos(nombre_producto))')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) { showNotification('Error cargando compras', 'error'); return; }
    const container = document.getElementById('comprasContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay compras registradas</p>'; return; }

    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Proveedor</th><th>Fecha</th><th>Productos</th><th>Total</th><th>Factura</th></tr></thead>
                <tbody>
                    ${data.map(c => {
                        const fecha = new Date(c.fecha_compra + 'T00:00:00').toLocaleDateString('es-ES');
                        const productosTxt = (c.detalle_compras || []).map(d => `${d.productos?.nombre_producto || 'N/A'} x${d.cantidad}`).join(', ');
                        const total = (c.detalle_compras || []).reduce((acc, d) => acc + parseFloat(d.subtotal || 0), 0);
                        return `<tr>
                            <td>${c.id_compra}</td>
                            <td>${c.proveedores?.nombre_proveedor || 'N/A'}</td>
                            <td>${fecha}</td>
                            <td>${productosTxt || '—'}</td>
                            <td><strong>Bs. ${total.toFixed(2)}</strong></td>
                            <td>${c.numero_factura || '—'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div></div>`;
}

// ========== VENTAS (solo lectura) ==========
async function loadVentas() {
    const { data, error } = await db
        .from('ventas')
        .select('*, clientes(nombres, apellidos), detalle_ventas(cantidad, precio_unitario, subtotal, productos(nombre_producto))')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) { showNotification('Error cargando ventas', 'error'); return; }
    const container = document.getElementById('ventasContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay ventas registradas</p>'; return; }

    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Productos</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Fecha</th></tr></thead>
                <tbody>
                    ${data.map(v => {
                        const fecha = new Date(v.created_at).toLocaleString('es-ES');
                        const cliente = v.clientes ? `${v.clientes.nombres} ${v.clientes.apellidos || ''}` : 'General';
                        const productosTxt = (v.detalle_ventas || []).map(d => `${d.productos?.nombre_producto || 'N/A'} x${d.cantidad}`).join(', ');
                        return `<tr>
                            <td>${v.id_venta}</td>
                            <td>${productosTxt || '—'}</td>
                            <td>${cliente}</td>
                            <td><strong>Bs. ${parseFloat(v.total).toFixed(2)}</strong></td>
                            <td><span class="badge badge-info">${v.metodo_pago}</span></td>
                            <td>${fecha}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div></div>`;
}

// ========== CLIENTES ==========
async function loadClientes() {
    const { data, error } = await db.from('clientes').select('*').order('apellidos');
    if (error) { showNotification('Error cargando clientes', 'error'); return; }
    const container = document.getElementById('clientesContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay clientes registrados</p>'; return; }
    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Nombre Completo</th><th>Teléfono</th><th>Correo</th><th>Acciones</th></tr></thead>
                <tbody>${data.map(c => `
                    <tr>
                        <td>${c.id_cliente}</td>
                        <td><strong>${c.nombres} ${c.apellidos || ''}</strong></td>
                        <td>${c.telefono || '—'}</td>
                        <td>${c.correo_electronico || '—'}</td>
                        <td class="table-actions">
                            <button class="btn-icon btn-delete" onclick="eliminarCliente(${c.id_cliente})" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`).join('')}</tbody>
            </table>
        </div></div>`;
}

// ========== USUARIOS ==========
async function loadUsuarios() {
    const { data, error } = await db.from('usuarios').select('*, roles(nombre_rol)').order('created_at', { ascending: false });
    if (error) { showNotification('Error cargando usuarios', 'error'); return; }
    const container = document.getElementById('usuariosContent');
    if (!data || !data.length) { container.innerHTML = '<p class="text-muted">No hay usuarios registrados</p>'; return; }
    container.innerHTML = `
        <div class="table-container"><div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>Usuario</th><th>Nombre Completo</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                    ${data.map(u => `
                    <tr>
                        <td><strong>${u.nombre_usuario}</strong></td>
                        <td>${u.nombres} ${u.apellidos}</td>
                        <td>${u.correo_electronico || '—'}</td>
                        <td><span class="badge badge-info">${u.roles?.nombre_rol || 'N/A'}</span></td>
                        <td><span class="badge ${u.estado === 'activo' ? 'badge-success' : 'badge-secondary'}">${u.estado}</span></td>
                        <td class="table-actions">
                            <button class="btn-icon btn-delete" onclick="eliminarUsuario('${u.id_usuario}')" title="Desactivar"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div></div>`;
}

// ========== CONFIGURACIÓN ==========
async function loadConfiguracion() {
    const { data } = await db.from('configuracion_negocio').select('*').limit(1).single();
    if (data) {
        document.getElementById('configNombre').value = data.nombre_negocio || '';
        document.getElementById('configQr').value = data.qr_pago_url || '';
    }
}

// ========== HELPERS ==========
function showLoading() { document.getElementById('loadingOverlay').classList.add('show'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }

function showNotification(message, type = 'success') {
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('show'), 50);
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 350); }, 3500);
}

async function logout() {
    if (confirm('¿Cerrar sesión?')) {
        await db.auth.signOut();
        window.location.href = 'login.html';
    }
}

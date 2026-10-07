// ========== MODAL HELPERS ==========
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    if (modalId === 'addProductoModal') {
        loadCategoriasSelect('selectCategoria');
        loadMarcasSelect('selectMarca');
        loadProveedoresSelect('selectProveedor');
    } else if (modalId === 'addCompraModal') {
        loadProveedoresSelect('selectProveedorCompra');
        loadProductosSelect('selectProductoCompra');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
    const form = modal.querySelector('form');
    if (form) form.reset();
}

document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal')) {
        closeModal(e.target.id);
    }
});

// ========== CARGAR SELECTS ==========
async function loadCategoriasSelect(selectId) {
    const { data } = await db.from('categorias').select('id_categoria, nombre_categoria').order('nombre_categoria');
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar categoría...</option>';
    (data || []).forEach(c => sel.innerHTML += `<option value="${c.id_categoria}">${c.nombre_categoria}</option>`);
}

async function loadMarcasSelect(selectId) {
    const { data } = await db.from('marcas').select('id_marca, nombre_marca').order('nombre_marca');
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Sin marca / Genérico</option>';
    (data || []).forEach(m => sel.innerHTML += `<option value="${m.id_marca}">${m.nombre_marca}</option>`);
}

async function loadProveedoresSelect(selectId) {
    const { data } = await db.from('proveedores').select('id_proveedor, nombre_proveedor').eq('estado', 'activo').order('nombre_proveedor');
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar proveedor...</option>';
    (data || []).forEach(p => sel.innerHTML += `<option value="${p.id_proveedor}">${p.nombre_proveedor}</option>`);
}

async function loadProductosSelect(selectId) {
    const { data } = await db.from('productos').select('id_producto, nombre_producto, precio_costo, stock_actual').eq('estado', 'activo').order('nombre_producto');
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleccionar producto...</option>';
    (data || []).forEach(p => sel.innerHTML += `<option value="${p.id_producto}">${p.nombre_producto} (stock: ${p.stock_actual})</option>`);
}

// ========== GUARDAR PRODUCTO (con imagen opcional) ==========
document.getElementById('productoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);

    let imagenUrl = null;
    const archivoImagen = document.getElementById('productoImagenInput').files[0];
    if (archivoImagen) {
        const nombreArchivo = `${Date.now()}_${archivoImagen.name}`;
        const { data: subida, error: errorSubida } = await db.storage
            .from('productos') // bucket público llamado "productos" (crear en Supabase Storage)
            .upload(nombreArchivo, archivoImagen);

        if (errorSubida) {
            hideLoading();
            showNotification('Error al subir la imagen: ' + errorSubida.message, 'error');
            return;
        }
        const { data: urlPublica } = db.storage.from('productos').getPublicUrl(nombreArchivo);
        imagenUrl = urlPublica.publicUrl;
    }

    const data = {
        nombre_producto: fd.get('nombre_producto'),
        id_categoria: fd.get('id_categoria') ? parseInt(fd.get('id_categoria')) : null,
        id_marca: fd.get('id_marca') ? parseInt(fd.get('id_marca')) : null,
        id_proveedor: fd.get('id_proveedor') ? parseInt(fd.get('id_proveedor')) : null,
        unidad_medida: fd.get('unidad_medida') || 'unidad',
        precio_costo: parseFloat(fd.get('precio_costo')) || 0,
        precio_venta: parseFloat(fd.get('precio_venta')) || 0,
        stock_actual: parseInt(fd.get('stock_actual')) || 0,
        stock_minimo: parseInt(fd.get('stock_minimo')) || 5,
        imagen_url: imagenUrl,
        descripcion: fd.get('descripcion') || null,
        estado: 'activo'
    };

    const { error } = await db.from('productos').insert([data]);
    hideLoading();

    if (error) { showNotification('Error al guardar el producto: ' + error.message, 'error'); return; }
    showNotification('Producto guardado exitosamente', 'success');
    closeModal('addProductoModal');
    if (typeof loadProductos === 'function') loadProductos();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
});

// ========== GUARDAR MARCA ==========
document.getElementById('marcaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);
    const { error } = await db.from('marcas').insert([{ nombre_marca: fd.get('nombre_marca') }]);
    hideLoading();
    if (error) { showNotification('Error al guardar la marca', 'error'); return; }
    showNotification('Marca guardada exitosamente', 'success');
    closeModal('addMarcaModal');
    if (typeof loadMarcas === 'function') loadMarcas();
});

// ========== GUARDAR CATEGORÍA ==========
document.getElementById('categoriaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);
    const { error } = await db.from('categorias').insert([{
        nombre_categoria: fd.get('nombre_categoria'),
        descripcion: fd.get('descripcion') || null
    }]);
    hideLoading();
    if (error) { showNotification('Error al guardar la categoría', 'error'); return; }
    showNotification('Categoría guardada exitosamente', 'success');
    closeModal('addCategoriaModal');
    if (typeof loadCategorias === 'function') loadCategorias();
});

// ========== GUARDAR PROVEEDOR ==========
document.getElementById('proveedorForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);
    const { error } = await db.from('proveedores').insert([{
        nombre_proveedor: fd.get('nombre_proveedor'),
        nit: fd.get('nit') || null,
        telefono: fd.get('telefono') || null,
        correo_electronico: fd.get('correo_electronico') || null,
        contacto: fd.get('contacto') || null,
        direccion: fd.get('direccion') || null,
        estado: 'activo'
    }]);
    hideLoading();
    if (error) { showNotification('Error al guardar el proveedor', 'error'); return; }
    showNotification('Proveedor guardado exitosamente', 'success');
    closeModal('addProveedorModal');
    if (typeof loadProveedores === 'function') loadProveedores();
});

// ========== GUARDAR COMPRA (cabecera + detalle; el stock lo suma un trigger) ==========
document.getElementById('compraForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);

    const idProducto = parseInt(fd.get('id_producto'));
    const cantidad = parseInt(fd.get('cantidad'));
    const precioUnitario = parseFloat(fd.get('precio_unitario'));
    const total = cantidad * precioUnitario;

    const { data: compra, error: compraError } = await db.from('compras').insert([{
        id_proveedor: parseInt(fd.get('id_proveedor')),
        id_usuario: currentUser?.id_usuario || null,
        fecha_compra: fd.get('fecha_compra'),
        numero_factura: fd.get('numero_factura') || null,
        observaciones: fd.get('observaciones') || null,
        total: total
    }]).select().single();

    if (compraError) {
        hideLoading();
        showNotification('Error al registrar la compra: ' + compraError.message, 'error');
        return;
    }

    // El trigger fn_sumar_stock_compra suma el stock automáticamente al insertar aquí
    const { error: detalleError } = await db.from('detalle_compras').insert([{
        id_compra: compra.id_compra,
        id_producto: idProducto,
        cantidad: cantidad,
        precio_unitario: precioUnitario
    }]);

    hideLoading();
    if (detalleError) { showNotification('Error al registrar el detalle de la compra', 'error'); return; }

    showNotification('Compra registrada y stock actualizado', 'success');
    closeModal('addCompraModal');
    if (typeof loadCompras === 'function') loadCompras();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof loadAlertasStock === 'function') loadAlertasStock();
});

// ========== GUARDAR CLIENTE ==========
document.getElementById('clienteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);
    const { error } = await db.from('clientes').insert([{
        nombres: fd.get('nombres'),
        apellidos: fd.get('apellidos') || null,
        telefono: fd.get('telefono') || null,
        correo_electronico: fd.get('correo_electronico') || null
    }]);
    hideLoading();
    if (error) { showNotification('Error al guardar el cliente', 'error'); return; }
    showNotification('Cliente guardado exitosamente', 'success');
    closeModal('addClienteModal');
    if (typeof loadClientes === 'function') loadClientes();
});

// ========== CREAR USUARIO (vía Edge Function, no inserta directo) ==========
document.getElementById('usuarioForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    showLoading();
    const fd = new FormData(e.target);

    const { data: { session } } = await db.auth.getSession();
    if (!session) { hideLoading(); showNotification('Sesión expirada, vuelve a iniciar sesión', 'error'); return; }

    try {
        const respuesta = await fetch(CREATE_USER_FN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                email: fd.get('correo_electronico'),
                password: fd.get('password'),
                nombres: fd.get('nombres'),
                apellidos: fd.get('apellidos'),
                nombre_usuario: fd.get('nombre_usuario'),
                id_rol: parseInt(fd.get('id_rol'))
            })
        });

        const resultado = await respuesta.json();
        hideLoading();

        if (!respuesta.ok) {
            showNotification('Error al crear usuario: ' + (resultado.error || 'desconocido'), 'error');
            return;
        }

        showNotification('Usuario creado exitosamente', 'success');
        closeModal('addUsuarioModal');
        if (typeof loadUsuarios === 'function') loadUsuarios();

    } catch (err) {
        hideLoading();
        showNotification('Error de conexión con la función de creación de usuarios', 'error');
    }
});

// ========== ELIMINAR / DESACTIVAR ==========
async function eliminarProducto(id) {
    if (!confirm('¿Desactivar este producto del inventario?')) return;
    showLoading();
    const { error } = await db.from('productos').update({ estado: 'inactivo' }).eq('id_producto', id);
    hideLoading();
    if (error) { showNotification('Error al desactivar el producto', 'error'); return; }
    showNotification('Producto desactivado', 'success');
    loadProductos();
    loadDashboardStats();
}

async function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    showLoading();
    const { error } = await db.from('clientes').delete().eq('id_cliente', id);
    hideLoading();
    if (error) { showNotification('Error al eliminar el cliente', 'error'); return; }
    showNotification('Cliente eliminado', 'success');
    loadClientes();
}

async function eliminarUsuario(id) {
    if (!confirm('¿Desactivar este usuario?')) return;
    showLoading();
    const { error } = await db.from('usuarios').update({ estado: 'inactivo' }).eq('id_usuario', id);
    hideLoading();
    if (error) { showNotification('Error al desactivar el usuario', 'error'); return; }
    showNotification('Usuario desactivado', 'success');
    loadUsuarios();
}

console.log('✅ Librería Armonía - Modales y CRUD cargados');

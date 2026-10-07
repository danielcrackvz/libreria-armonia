// login.js - Librería Armonía
// Ahora la autenticación la maneja Supabase Auth (auth.signInWithPassword),
// ya no comparamos contraseñas manualmente contra la tabla "usuarios".

document.addEventListener('DOMContentLoaded', async function () {
    // Si ya hay una sesión activa, redirigir directamente según el rol
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        await redirigirSegunRol();
    }
});

function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showNotification('Por favor, completa todos los campos', 'error');
        return;
    }

    showLoading();

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        hideLoading();
        showNotification('Correo o contraseña incorrectos', 'error');
        return;
    }

    // Verificar que el usuario esté activo antes de dejarlo entrar
    const { data: perfil, error: errorPerfil } = await db
        .from('usuarios')
        .select('*, roles(nombre_rol)')
        .eq('id_usuario', data.user.id)
        .single();

    if (errorPerfil || !perfil || perfil.estado !== 'activo') {
        await db.auth.signOut();
        hideLoading();
        showNotification('Tu cuenta está inactiva. Contacta a la administradora.', 'error');
        return;
    }

    await db.from('usuarios')
        .update({ ultimo_acceso: new Date().toISOString() })
        .eq('id_usuario', data.user.id);

    hideLoading();
    showNotification('¡Bienvenida, ' + perfil.nombres + '!', 'success');
    setTimeout(redirigirSegunRol, 1200);
});

async function redirigirSegunRol() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const { data: perfil } = await db
        .from('usuarios')
        .select('*, roles(nombre_rol)')
        .eq('id_usuario', user.id)
        .single();

    if (!perfil) return;

    if (perfil.roles.nombre_rol === 'Vendedor') {
        window.location.href = 'venta.html';       // interfaz simplificada de ventas
    } else {
        window.location.href = 'dashboard.html';   // admin y encargado de compras
    }
}

function showLoading() { document.getElementById('loadingOverlay').classList.add('show'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }

function showNotification(message, type = 'info') {
    const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#87CEEB' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

    const n = document.createElement('div');
    n.style.cssText = `position:fixed;top:20px;right:20px;background:${colors[type]};color:white;padding:1rem 1.5rem;border-radius:12px;z-index:10000;display:flex;align-items:center;gap:10px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.3);animation:slideInRight 0.4s ease;min-width:280px;font-family:'Segoe UI',sans-serif;`;
    n.innerHTML = `<i class="fas ${icons[type]}"></i> ${message}`;
    document.body.appendChild(n);

    const style = document.createElement('style');
    style.textContent = `@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOutRight{from{transform:translateX(0);opacity:1}to{transform:translateX(0);opacity:0}}`;
    document.head.appendChild(style);

    setTimeout(() => {
        n.style.animation = 'slideOutRight 0.4s ease';
        setTimeout(() => n.remove(), 400);
    }, 4000);
}
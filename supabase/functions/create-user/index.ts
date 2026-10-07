// supabase/functions/create-user/index.ts
//
// Edge Function para que la ADMINISTRADORA cree cuentas nuevas
// (Encargado de Compras o Vendedor) sin cerrar su propia sesión.
//
// Flujo:
// 1. El navegador de la admin llama a esta función incluyendo su propio
//    token de sesión (Authorization: Bearer <access_token>).
// 2. La función verifica, usando ese token, que quien llama es realmente
//    una Administradora (consulta la tabla "usuarios" respetando RLS).
// 3. Si es admin, usa la SERVICE ROLE KEY (que nunca se expone al navegador,
//    solo vive como "secret" de la función) para crear el nuevo usuario
//    en auth.users. El trigger de la base de datos (fn_crear_perfil_usuario)
//    se encarga de crear su fila en "usuarios" automáticamente.
//
// Despliegue (desde tu computadora, con Supabase CLI instalado):
//   supabase functions deploy create-user
//
// La SERVICE_ROLE_KEY y la URL del proyecto ya están disponibles
// automáticamente dentro de las Edge Functions como variables de entorno,
// no hace falta configurarlas a mano.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Falta el token de autorización." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente "en nombre de quien llama" (respeta RLS) -> para verificar que es admin
    const clienteQueLlama = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: quienLlama }, error: errorUsuario } = await clienteQueLlama.auth.getUser();
    if (errorUsuario || !quienLlama) {
      return new Response(JSON.stringify({ error: "Sesión inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: perfilQuienLlama, error: errorPerfil } = await clienteQueLlama
      .from("usuarios")
      .select("*, roles(nombre_rol)")
      .eq("id_usuario", quienLlama.id)
      .single();

    if (errorPerfil || perfilQuienLlama?.roles?.nombre_rol !== "Administrador") {
      return new Response(JSON.stringify({ error: "Solo la administradora puede crear usuarios." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Datos del nuevo usuario a crear
    const { email, password, nombres, apellidos, nombre_usuario, id_rol } = await req.json();

    if (!email || !password || !nombres || !apellidos || !nombre_usuario || !id_rol) {
      return new Response(JSON.stringify({ error: "Faltan datos obligatorios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente con permisos de administrador del proyecto (service role)
    const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: nuevoUsuario, error: errorCreacion } = await clienteAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // se confirma automáticamente, sin correo de verificación
      user_metadata: { nombres, apellidos, nombre_usuario, id_rol },
    });

    if (errorCreacion) {
      return new Response(JSON.stringify({ error: errorCreacion.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, usuario: nuevoUsuario.user }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
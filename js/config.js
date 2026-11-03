// ==================== CONFIGURACIÓN ====================
// Proyecto Supabase compartido por todas las apps de ADMI ("ADMI Apps").
// La clave es pública por diseño: la seguridad la ponen el login y las políticas RLS.

const SUPABASE_URL = 'https://qizycxlubakoekorseqv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pFhZ_u3DKzZ0fSnIsHVh_A_WR0RMwnU';

// Esta app dentro de ADMI: slug en public.apps y esquema de sus tablas
const APP_SLUG = 'finanzas';
const APP_SCHEMA = 'finanzas';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

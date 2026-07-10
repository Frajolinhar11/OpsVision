/* ============================================
   OPS VISION - Supabase Configuration
   ============================================ */

const SUPABASE_URL = 'https://zlbbmcrfxhkwkaweeasc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wibY823lGdC-x6lCGruTaw_JHo6fiLO';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});
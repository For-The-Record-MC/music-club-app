import { supabase, supabaseAnonKey, supabaseUrl } from './client';

// ALL Supabase queries live in this file, grouped into typed query objects
// (db.clubs, db.cycles, …) — one object per domain. Screens and hooks must never
// call the raw supabase client directly; add a method here instead.
// Query objects arrive with each phase's migration (see PLAN.md).

export const db = {
  /** Connectivity probe for the scaffold screen — hits the GoTrue health endpoint. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: supabaseAnonKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};

export { supabase };

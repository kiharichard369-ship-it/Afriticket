import { supabase } from "../lib/supabaseClient";

export interface ThemeEvent {
  id: string;
  title: string;
  cover_image_url: string;
  starts_at: string;
}

export interface SiteSettings {
  wallpaperUrl: string | null;
  wallpaperUpdatedAt: string | null;
  wallpaperDisabled: boolean;
  landingThemeEventId: string | null;
  landingThemeEventUntil: string | null;
  landingThemeEvent: ThemeEvent | null;
  automaticThemeEvent: ThemeEvent | null;
}

const FALLBACK_SETTINGS: SiteSettings = {
  wallpaperUrl: null,
  wallpaperUpdatedAt: null,
  wallpaperDisabled: false,
  landingThemeEventId: null,
  landingThemeEventUntil: null,
  landingThemeEvent: null,
  automaticThemeEvent: null,
};

const SETTINGS_COLUMNS = "wallpaper_url, wallpaper_updated_at, wallpaper_disabled, landing_theme_event_id, landing_theme_event_until";

type SettingsRow = {
  wallpaper_url?: string | null;
  wallpaper_updated_at?: string | null;
  wallpaper_disabled?: boolean | null;
  landing_theme_event_id?: string | null;
  landing_theme_event_until?: string | null;
};

function fromRow(row: SettingsRow | null, landingThemeEvent: ThemeEvent | null = null, automaticThemeEvent: ThemeEvent | null = null): SiteSettings {
  return {
    wallpaperUrl: row?.wallpaper_url ?? null,
    wallpaperUpdatedAt: row?.wallpaper_updated_at ?? null,
    wallpaperDisabled: row?.wallpaper_disabled ?? false,
    landingThemeEventId: row?.landing_theme_event_id ?? null,
    landingThemeEventUntil: row?.landing_theme_event_until ?? null,
    landingThemeEvent,
    automaticThemeEvent,
  };
}

async function resolveThemeEvents(row: SettingsRow): Promise<{ landingThemeEvent: ThemeEvent | null; automaticThemeEvent: ThemeEvent | null }> {
  if (!supabase) return { landingThemeEvent: null, automaticThemeEvent: null };
  const now = new Date();
  const manualIsActive = Boolean(row.landing_theme_event_id && row.landing_theme_event_until && new Date(row.landing_theme_event_until) > now);
  const manualQuery = manualIsActive
    ? supabase.from("events_public").select("id, title, cover_image_url, starts_at").eq("id", row.landing_theme_event_id).not("cover_image_url", "is", null).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const automaticQuery = supabase
    .from("events_public")
    .select("id, title, cover_image_url, starts_at")
    .not("cover_image_url", "is", null)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const [{ data: manual }, { data: automatic }] = await Promise.all([manualQuery, automaticQuery]);
  return { landingThemeEvent: (manual as ThemeEvent | null) ?? null, automaticThemeEvent: (automatic as ThemeEvent | null) ?? null };
}

export const siteSettingsRepository = {
  async getPublic(): Promise<SiteSettings> {
    if (!supabase) return FALLBACK_SETTINGS;
    const { data, error } = await supabase
      .from("site_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    const settings = fromRow(data);
    return { ...settings, ...(await resolveThemeEvents(data ?? {})) };
  },

  async uploadWallpaper(file: File, staffUserId: string): Promise<SiteSettings> {
    if (!supabase) throw new Error("Connect Supabase before changing site settings.");
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Choose an image smaller than 8 MB.");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `wallpapers/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("site-assets").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from("site-assets").getPublicUrl(path);
    const { data, error } = await supabase
      .from("site_settings")
      .update({ wallpaper_url: publicUrl.publicUrl, wallpaper_updated_by: staffUserId })
      .eq("id", true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async clearWallpaper(): Promise<SiteSettings> {
    if (!supabase) throw new Error("Connect Supabase before changing site settings.");
    const { data, error } = await supabase
      .from("site_settings")
      .update({ wallpaper_url: null, wallpaper_updated_by: null })
      .eq("id", true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  /** Hides the landing-page background picture for everyone while true. */
  async setWallpaperDisabled(disabled: boolean): Promise<SiteSettings> {
    if (!supabase) throw new Error("Connect Supabase before changing site settings.");
    const { data, error } = await supabase
      .from("site_settings")
      .update({ wallpaper_disabled: disabled })
      .eq("id", true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async setEventTheme(eventId: string): Promise<SiteSettings> {
    if (!supabase) throw new Error("Connect Supabase before changing site settings.");
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("site_settings")
      .update({ landing_theme_event_id: eventId, landing_theme_event_until: until })
      .eq("id", true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async clearEventTheme(): Promise<SiteSettings> {
    if (!supabase) throw new Error("Connect Supabase before changing site settings.");
    const { data, error } = await supabase
      .from("site_settings")
      .update({ landing_theme_event_id: null, landing_theme_event_until: null })
      .eq("id", true)
      .select(SETTINGS_COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data);
  },
};
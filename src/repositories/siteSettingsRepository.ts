import { supabase } from "../lib/supabaseClient";

export interface SiteSettings {
  wallpaperUrl: string | null;
  wallpaperUpdatedAt: string | null;
}

const FALLBACK_SETTINGS: SiteSettings = {
  wallpaperUrl: null,
  wallpaperUpdatedAt: null,
};

function fromRow(row: { wallpaper_url?: string | null; wallpaper_updated_at?: string | null } | null): SiteSettings {
  return {
    wallpaperUrl: row?.wallpaper_url ?? null,
    wallpaperUpdatedAt: row?.wallpaper_updated_at ?? null,
  };
}

export const siteSettingsRepository = {
  async getPublic(): Promise<SiteSettings> {
    if (!supabase) return FALLBACK_SETTINGS;
    const { data, error } = await supabase
      .from("site_settings")
      .select("wallpaper_url, wallpaper_updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return fromRow(data);
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
      .select("wallpaper_url, wallpaper_updated_at")
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
      .select("wallpaper_url, wallpaper_updated_at")
      .single();
    if (error) throw error;
    return fromRow(data);
  },
};

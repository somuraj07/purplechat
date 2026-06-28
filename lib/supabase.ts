import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ChatMessage = {
  id: string;
  author_id: "you" | "partner";
  author_name: string;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "video" | null;
  file_name: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
};

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  browserClient ??= createClient(supabaseUrl, supabaseAnonKey);

  return browserClient;
}

// Minimal hand-rolled Database type. Replace with output of
//   npm run types
// once supabase CLI is installed (`brew install supabase/tap/supabase`).
//
// Until then, this captures just the columns we read/write from the app.

export type UserRole = "admin" | "editor" | "staff" | "coach" | "member";
export type MemberStatus = "active" | "inactive" | "suspended" | "pending";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "waitlist" | "withdrawn";
export type EventStatus = "draft" | "published" | "cancelled" | "done";
export type EventType = "race" | "ride" | "camp" | "training";
export type RegistrationStatus = "registered" | "waitlist" | "cancelled" | "checked_in" | "dnf" | "dns";
export type DuesStatus = "paid" | "unpaid" | "overdue" | "waived";
export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type ContentStatus = "draft" | "published" | "archived";
export type SponsorTier = "title" | "technical" | "partner" | "supporter";

export interface Database {
  public: {
    Tables: {
      sections: {
        Row: {
          id: string;
          slug: string;
          display_order: number;
          name_sq: string;
          name_en: string;
          description_sq: string | null;
          description_en: string | null;
          coach_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sections"]["Row"]> & {
          slug: string; display_order: number; name_sq: string; name_en: string;
        };
        Update: Partial<Database["public"]["Tables"]["sections"]["Row"]>;
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          dob: string | null;
          role: UserRole;
          section_id: string | null;
          avatar_url: string | null;
          bio: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          status: MemberStatus;
          joined_at: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string; full_name: string; email: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      applications: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          age: number | null;
          section_id: string | null;
          experience: string | null;
          notes: string | null;
          status: ApplicationStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["applications"]["Row"]> & {
          full_name: string; email: string;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Row"]>;
      };
      events: {
        Row: {
          id: string;
          slug: string | null;
          title_sq: string;
          title_en: string | null;
          type: EventType;
          status: EventStatus;
          section_id: string | null;
          start_at: string;
          end_at: string | null;
          location: string | null;
          distance_km: number | null;
          elevation_m: number | null;
          description_sq: string | null;
          description_en: string | null;
          registration_open_at: string | null;
          registration_close_at: string | null;
          cover_media_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]> & {
          title_sq: string; type: EventType; start_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
      };
      event_categories: {
        Row: { id: string; event_id: string; name: string; max_riders: number | null; display_order: number };
        Insert: { event_id: string; name: string; max_riders?: number | null; display_order?: number };
        Update: Partial<Database["public"]["Tables"]["event_categories"]["Row"]>;
      };
      event_registrations: {
        Row: {
          id: string; event_id: string; member_id: string;
          category_id: string | null; status: RegistrationStatus;
          bib_number: number | null; registered_at: string; notes: string | null;
        };
        Insert: { event_id: string; member_id: string; category_id?: string | null; status?: RegistrationStatus; bib_number?: number | null; notes?: string | null };
        Update: Partial<Database["public"]["Tables"]["event_registrations"]["Row"]>;
      };
      results: {
        Row: {
          id: string; event_id: string; category_id: string | null;
          member_id: string | null; rider_name_override: string | null;
          position: number | null; time_seconds: number | null;
          points: number | null; notes: string | null;
          recorded_by: string | null; created_at: string;
        };
        Insert: { event_id: string; category_id?: string | null; member_id?: string | null; rider_name_override?: string | null; position?: number | null; time_seconds?: number | null; points?: number | null; notes?: string | null };
        Update: Partial<Database["public"]["Tables"]["results"]["Row"]>;
      };
      media: {
        Row: {
          id: string; storage_path: string; filename: string;
          mime_type: string | null; width: number | null; height: number | null;
          byte_size: number | null; alt: string | null; caption: string | null;
          uploaded_by: string | null; created_at: string;
        };
        Insert: { storage_path: string; filename: string; mime_type?: string | null; byte_size?: number | null; alt?: string | null; caption?: string | null };
        Update: Partial<Database["public"]["Tables"]["media"]["Row"]>;
      };
      news: {
        Row: {
          id: string; slug: string; title_sq: string; title_en: string | null;
          body_sq: string; body_en: string | null;
          cover_media_id: string | null; status: ContentStatus;
          author_id: string | null; published_at: string | null;
          tags: string[]; created_at: string; updated_at: string;
        };
        Insert: { slug: string; title_sq: string; body_sq: string; title_en?: string | null; body_en?: string | null; status?: ContentStatus; author_id?: string | null; published_at?: string | null; tags?: string[] };
        Update: Partial<Database["public"]["Tables"]["news"]["Row"]>;
      };
      sponsors: {
        Row: {
          id: string; name: string; tier: SponsorTier;
          logo_media_id: string | null; role_sq: string | null; role_en: string | null;
          body_sq: string | null; body_en: string | null;
          website_url: string | null; contract_start: string | null; contract_end: string | null;
          display_order: number; active: boolean; created_at: string; updated_at: string;
        };
        Insert: { name: string; tier: SponsorTier; role_sq?: string | null; role_en?: string | null; body_sq?: string | null; body_en?: string | null; website_url?: string | null; contract_start?: string | null; contract_end?: string | null; display_order?: number; active?: boolean };
        Update: Partial<Database["public"]["Tables"]["sponsors"]["Row"]>;
      };
      dues: {
        Row: {
          id: string; member_id: string; period: string;
          amount_eur: number; status: DuesStatus;
          paid_at: string | null; paid_method: string | null;
          recorded_by: string | null; notes: string | null;
          created_at: string; updated_at: string;
        };
        Insert: { member_id: string; period: string; amount_eur: number; status?: DuesStatus; paid_at?: string | null; paid_method?: string | null; notes?: string | null };
        Update: Partial<Database["public"]["Tables"]["dues"]["Row"]>;
      };
      attendance: {
        Row: {
          id: string; member_id: string; session_date: string;
          section_id: string | null; status: AttendanceStatus;
          notes: string | null; recorded_by: string | null; created_at: string;
        };
        Insert: { member_id: string; session_date: string; section_id?: string | null; status?: AttendanceStatus; notes?: string | null };
        Update: Partial<Database["public"]["Tables"]["attendance"]["Row"]>;
      };
      settings: {
        Row: { key: string; value: unknown; updated_by: string | null; updated_at: string };
        Insert: { key: string; value: unknown };
        Update: { key?: string; value?: unknown };
      };
      audit_log: {
        Row: {
          id: number; actor_id: string | null; action: string;
          entity_type: string; entity_id: string | null;
          before: unknown; after: unknown; created_at: string;
        };
        Insert: { actor_id?: string | null; action: string; entity_type: string; entity_id?: string | null; before?: unknown; after?: unknown };
        Update: never;
      };
    };
    Functions: {
      approve_application: { Args: { app_id: string }; Returns: string };
      reject_application:  { Args: { app_id: string; reason?: string | null }; Returns: string };
      set_user_role:       { Args: { target_id: string; new_role: UserRole }; Returns: string };
      current_role:        { Args: Record<string, never>; Returns: UserRole | null };
      has_role:            { Args: { roles: UserRole[] }; Returns: boolean };
      is_coach_of:         { Args: { target_section_id: string }; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      member_status: MemberStatus;
      application_status: ApplicationStatus;
      event_status: EventStatus;
      event_type: EventType;
      registration_status: RegistrationStatus;
      dues_status: DuesStatus;
      attendance_status: AttendanceStatus;
      content_status: ContentStatus;
      sponsor_tier: SponsorTier;
    };
  };
}

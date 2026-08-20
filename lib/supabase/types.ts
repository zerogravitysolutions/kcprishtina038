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
export type TrainingRideKind = "group" | "solo";
// memberships.status and dues.paid_method are text + CHECK, not enums.
export type MembershipStatus = "active" | "paused" | "ended";
export type PaidMethod = "cash" | "bank" | "online" | "waived";
// club_funds / club_expenses are text + CHECK too (migration 20260810000002).
export type ClubFundKind = "sponsor" | "project" | "donation" | "grant" | "other";
export type ExpenseStatus = "paid" | "unpaid";
/** Who actually handed over the money. 'member' = the club owes them it back. */
export type ExpensePaidBy = "club" | "member";
export type ExpensePaymentMethod = "cash" | "transfer";
/**
 * public.team_position. The last three were added by migrations 20260518000006
 * and 20260518000007; this union used to stop at "staff", so a secretary or a
 * board member read off `team_members.positions` was typed as something that
 * cannot occur.
 */
export type TeamPosition =
  | "president" | "board_member"
  | "secretary_general" | "secretary_organizational"
  | "commissaire" | "coach" | "rider" | "mechanic" | "physio" | "staff";
export type NewsSource = "manual" | "facebook";
export type EventSignupStatus = "pending" | "confirmed" | "waitlisted" | "cancelled";
export type EventSignupGender = "m" | "f" | "other";

/**
 * The tables, written without the `Relationships` key so the entries stay
 * readable. `Database` below adds it — see WithRelationships.
 */
interface PublicTables {
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
        Insert: Partial<PublicTables["sections"]["Row"]> & {
          slug: string; display_order: number; name_sq: string; name_en: string;
        };
        Update: Partial<PublicTables["sections"]["Row"]>;
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
        Insert: Partial<PublicTables["profiles"]["Row"]> & {
          id: string; full_name: string; email: string;
        };
        Update: Partial<PublicTables["profiles"]["Row"]>;
      };
      applications: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          age: number | null;
          // Date of birth, "YYYY-MM-DD" (migration 20260518000010). Optional on
          // the /join form, and copied onto the profile at enrolment.
          dob: string | null;
          section_id: string | null;
          // Chosen academy tier on /join. Null on applications that predate plans.
          plan_id: string | null;
          experience: string | null;
          notes: string | null;
          // Path inside the `media` bucket for the photo uploaded on /join.
          photo_storage_path: string | null;
          status: ApplicationStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<PublicTables["applications"]["Row"]> & {
          full_name: string; email: string;
        };
        Update: Partial<PublicTables["applications"]["Row"]>;
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
          // migration 20260517000012 (Facebook sync).
          source: "native" | "facebook";
          external_id: string | null;
          external_url: string | null;
          // migration 20260518000013.
          strava_url: string | null;
          // migration 20260519000001.
          results_published: boolean;
          results_published_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<PublicTables["events"]["Row"]> & {
          title_sq: string; type: EventType; start_at: string;
        };
        Update: Partial<PublicTables["events"]["Row"]>;
      };
      event_categories: {
        Row: { id: string; event_id: string; name: string; max_riders: number | null; display_order: number };
        Insert: { event_id: string; name: string; max_riders?: number | null; display_order?: number };
        Update: Partial<PublicTables["event_categories"]["Row"]>;
      };
      event_registrations: {
        Row: {
          id: string; event_id: string; member_id: string;
          category_id: string | null; status: RegistrationStatus;
          bib_number: number | null; registered_at: string; notes: string | null;
        };
        Insert: { event_id: string; member_id: string; category_id?: string | null; status?: RegistrationStatus; bib_number?: number | null; notes?: string | null };
        Update: Partial<PublicTables["event_registrations"]["Row"]>;
      };
      results: {
        Row: {
          id: string; event_id: string; category_id: string | null;
          member_id: string | null; rider_name_override: string | null;
          position: number | null; time_seconds: number | null;
          points: number | null; notes: string | null;
          recorded_by: string | null; created_at: string;
        };
        // Partial<Row> rather than a hand-listed subset: the old list omitted
        // recorded_by, which the admin results editor writes.
        Insert: Partial<PublicTables["results"]["Row"]> & { event_id: string };
        Update: Partial<PublicTables["results"]["Row"]>;
      };
      media: {
        Row: {
          id: string; storage_path: string; filename: string;
          mime_type: string | null; width: number | null; height: number | null;
          byte_size: number | null; alt: string | null; caption: string | null;
          uploaded_by: string | null; created_at: string;
          source: "upload" | "facebook";
          external_id: string | null; external_url: string | null;
          // migration 20260518000001 — homepage hero picker.
          featured_in_hero: boolean; featured_order: number;
        };
        // Partial<Row> rather than a hand-listed subset: the old list omitted
        // source / uploaded_by, which the admin uploader does write.
        Insert: Partial<PublicTables["media"]["Row"]> & { storage_path: string; filename: string };
        Update: Partial<PublicTables["media"]["Row"]>;
      };
      fb_pages: {
        Row: {
          id: string; username: string | null; name: string | null;
          about: string | null; bio: string | null; category: string | null;
          website: string | null; fan_count: number | null;
          picture_media_id: string | null; cover_media_id: string | null;
          last_synced_at: string | null; created_at: string; updated_at: string;
        };
        Insert: { id: string };
        Update: Partial<PublicTables["fb_pages"]["Row"]>;
      };
      fb_posts: {
        Row: {
          id: string; page_id: string; message: string | null;
          permalink_url: string | null; story: string | null;
          status_type: string | null; created_time: string;
          cover_media_id: string | null; attachments: unknown;
          is_published: boolean; hidden: boolean;
          raw: unknown; fetched_at: string;
        };
        Insert: { id: string; page_id: string; created_time: string };
        Update: Partial<PublicTables["fb_posts"]["Row"]>;
      };
      fb_albums: {
        Row: {
          id: string; page_id: string; name: string | null;
          description: string | null; cover_media_id: string | null;
          count: number | null; created_time: string | null;
          updated_time: string | null; fetched_at: string;
        };
        Insert: { id: string; page_id: string };
        Update: Partial<PublicTables["fb_albums"]["Row"]>;
      };
      fb_photos: {
        Row: {
          id: string; page_id: string; album_id: string | null;
          post_id: string | null; media_id: string;
          alt_text: string | null; width: number | null; height: number | null;
          created_time: string | null; fetched_at: string;
        };
        Insert: { id: string; page_id: string; media_id: string };
        Update: Partial<PublicTables["fb_photos"]["Row"]>;
      };
      news: {
        Row: {
          id: string; slug: string; title_sq: string; title_en: string | null;
          body_sq: string; body_en: string | null;
          cover_media_id: string | null; status: ContentStatus;
          author_id: string | null; published_at: string | null;
          tags: string[];
          // migration 20260517000013 — Facebook-sourced posts.
          source: NewsSource;
          fb_post_id: string | null;
          gallery_media_ids: string[];
          external_url: string | null;
          // migration 20260518000002 — the race this post reports on.
          race_event_id: string | null;
          // migration 20260519000013 — editor said "not a race"; stop suggesting.
          race_dismissed: boolean;
          created_at: string; updated_at: string;
        };
        // Partial<Row> rather than a hand-listed subset: the old list omitted
        // cover_media_id, which both the admin editor and the FB sync write.
        Insert: Partial<PublicTables["news"]["Row"]> & { slug: string; title_sq: string; body_sq: string };
        Update: Partial<PublicTables["news"]["Row"]>;
      };
      sponsors: {
        Row: {
          id: string; name: string; tier: SponsorTier;
          logo_media_id: string | null; role_sq: string | null; role_en: string | null;
          body_sq: string | null; body_en: string | null;
          website_url: string | null; contract_start: string | null; contract_end: string | null;
          // migration 20260518000014 — null = club-wide, set = shown on one event.
          event_id: string | null;
          display_order: number; active: boolean; created_at: string; updated_at: string;
        };
        // Partial<Row> rather than a hand-listed subset: the old list silently
        // omitted logo_media_id, which the event-sponsor editor does write.
        Insert: Partial<PublicTables["sponsors"]["Row"]> & { name: string; tier: SponsorTier };
        Update: Partial<PublicTables["sponsors"]["Row"]>;
      };
      membership_plans: {
        Row: {
          id: string; code: string; name_sq: string;
          description_sq: string | null;
          // null only on a non-billable tier ("Garues"); a billable plan is
          // required by CHECK to carry a price.
          amount_eur: number | null;
          // false = structurally outside billing, never invoiced.
          billable: boolean;
          display_order: number; active: boolean;
          created_at: string; updated_at: string;
        };
        Insert: Partial<PublicTables["membership_plans"]["Row"]> & {
          code: string; name_sq: string;
        };
        Update: Partial<PublicTables["membership_plans"]["Row"]>;
      };
      memberships: {
        Row: {
          id: string; member_id: string; plan_id: string;
          // Frozen from the plan at creation, so a later price change never
          // restates existing rows. 0 with billable = true means a paying tier
          // waived for this rider (e.g. under 14).
          amount_eur: number;
          // Copied from the plan. false = a racer who does not pay at all —
          // distinct from an amount of 0, and never invoiced.
          billable: boolean;
          start_date: string; end_date: string | null;
          status: MembershipStatus;
          notes: string | null;
          created_at: string; updated_at: string;
        };
        Insert: Partial<PublicTables["memberships"]["Row"]> & {
          member_id: string; plan_id: string; start_date: string;
        };
        Update: Partial<PublicTables["memberships"]["Row"]>;
      };
      dues: {
        Row: {
          id: string; member_id: string; period: string;
          amount_eur: number; status: DuesStatus;
          paid_at: string | null; paid_method: PaidMethod | null;
          recorded_by: string | null; notes: string | null;
          membership_id: string | null; due_date: string | null;
          invoice_no: string | null;
          // The INVOICE DATE shown to the member. Distinct from period (the
          // first-of-month idempotency bucket) and created_at (generation
          // timestamp). Null on rows created before invoice dates existed.
          issued_on: string | null;
          created_at: string; updated_at: string;
        };
        Insert: { member_id: string; period: string; amount_eur: number; status?: DuesStatus; paid_at?: string | null; paid_method?: PaidMethod | null; notes?: string | null; membership_id?: string | null; due_date?: string | null; invoice_no?: string | null; issued_on?: string | null };
        Update: Partial<PublicTables["dues"]["Row"]>;
      };
      expense_categories: {
        Row: {
          id: string; code: string; name_sq: string;
          description_sq: string | null;
          display_order: number; active: boolean;
          created_at: string; updated_at: string;
        };
        Insert: Partial<PublicTables["expense_categories"]["Row"]> & {
          code: string; name_sq: string;
        };
        Update: Partial<PublicTables["expense_categories"]["Row"]>;
      };
      club_funds: {
        Row: {
          id: string; title: string;
          // The day the money was received. club_funds holds received money only.
          occurred_on: string;
          amount_eur: number;
          kind: ClubFundKind;
          // Required by CHECK when kind = 'sponsor'.
          sponsor_id: string | null;
          reference: string | null;
          notes: string | null;
          recorded_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: Partial<PublicTables["club_funds"]["Row"]> & {
          title: string; occurred_on: string; amount_eur: number;
        };
        Update: Partial<PublicTables["club_funds"]["Row"]>;
      };
      club_expenses: {
        Row: {
          id: string;
          occurred_on: string;
          category_id: string;
          description: string;
          // NULL ON PURPOSE: a real cost with no agreed price yet. It is NOT
          // zero — sum it with sumAmounts() from lib/finance, never sumEur().
          amount_eur: number | null;
          // NULL = the club itself ("Klubi"), not "unknown".
          beneficiary_member_id: string | null;
          // NULL = no invoice was issued. Never the string "pa fature".
          invoice_no: string | null;
          payment_method: ExpensePaymentMethod | null;
          paid_by: ExpensePaidBy;
          // Set iff paid_by = 'member' (club_expenses_paid_by_ck).
          paid_by_member_id: string | null;
          // Whose budget the cost draws on — independent of whether that sponsor
          // has transferred anything yet (see club_funds.status).
          funding_sponsor_id: string | null;
          status: ExpenseStatus;
          // Only a member-fronted cost can be reimbursed, often in kind, which
          // is why the note IS the record.
          reimbursed: boolean;
          reimbursed_note: string | null;
          // Up to three receipt-photo paths in the `media` bucket; empty array
          // when none is attached (migration 20260817000001 replaced the single
          // receipt_path column).
          receipt_paths: string[];
          notes: string | null;
          recorded_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: Partial<PublicTables["club_expenses"]["Row"]> & {
          occurred_on: string; category_id: string; description: string;
        };
        Update: Partial<PublicTables["club_expenses"]["Row"]>;
      };
      // Anonymous (no-login) signups from the public /events/<slug> page —
      // distinct from event_registrations, which needs a profiles row
      // (migration 20260518000011).
      event_signups: {
        Row: {
          id: string; event_id: string;
          full_name: string; email: string;
          phone: string | null; dob: string | null;
          gender: EventSignupGender | null;
          category: string | null; club: string | null;
          notes: string | null;
          status: EventSignupStatus;
          bib_number: number | null;
          result_place: number | null;
          result_time: string | null;
          result_notes: string | null;
          created_at: string; updated_at: string;
        };
        Insert: Partial<PublicTables["event_signups"]["Row"]> & {
          event_id: string; full_name: string; email: string;
        };
        Update: Partial<PublicTables["event_signups"]["Row"]>;
      };
      // Sponsors pinned to one event (migration 20260518000013). Composite PK,
      // so there is no `id`.
      event_sponsors: {
        Row: { event_id: string; sponsor_id: string; display_order: number; created_at: string };
        Insert: { event_id: string; sponsor_id: string; display_order?: number };
        Update: Partial<PublicTables["event_sponsors"]["Row"]>;
      };
      attendance: {
        Row: {
          id: string; member_id: string; session_date: string;
          section_id: string | null; status: AttendanceStatus;
          notes: string | null; recorded_by: string | null; created_at: string;
        };
        Insert: { member_id: string; session_date: string; section_id?: string | null; status?: AttendanceStatus; notes?: string | null };
        Update: Partial<PublicTables["attendance"]["Row"]>;
      };
      settings: {
        Row: { key: string; value: unknown; updated_by: string | null; updated_at: string };
        // The old hand-listed Insert/Update omitted updated_by / updated_at,
        // which the settings upsert does write.
        Insert: Partial<PublicTables["settings"]["Row"]> & { key: string; value: unknown };
        Update: Partial<PublicTables["settings"]["Row"]>;
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
      team_members: {
        Row: {
          id: string; slug: string;
          full_name: string; first_name: string; last_name: string;
          dob: string | null;
          gender: "m" | "f" | null;
          positions: TeamPosition[];
          section_slug: string | null;
          photo_media_id: string | null;
          external_photo_url: string | null;
          status: "active" | "past";
          ended_at: string | null;
          bio: string | null;
          profile_id: string | null;
          // migration 20260518000004 — masters-category rider.
          is_master: boolean;
          display_order: number;
          created_at: string; updated_at: string;
        };
        Insert: {
          slug: string; full_name: string; first_name: string; last_name: string;
          positions: TeamPosition[];
          dob?: string | null; gender?: "m"|"f"|null;
          section_slug?: string | null;
          photo_media_id?: string | null; external_photo_url?: string | null;
          status?: "active"|"past"; ended_at?: string | null;
          bio?: string | null; profile_id?: string | null;
          is_master?: boolean;
          display_order?: number;
        };
        Update: {
          slug?: string; full_name?: string; first_name?: string; last_name?: string;
          dob?: string | null; gender?: "m"|"f"|null;
          positions?: TeamPosition[];
          section_slug?: string | null;
          photo_media_id?: string | null; external_photo_url?: string | null;
          status?: "active"|"past"; ended_at?: string | null;
          bio?: string | null; profile_id?: string | null;
          is_master?: boolean;
          display_order?: number;
        };
      };
      race_events: {
        Row: {
          id: string; slug: string; name: string;
          race_date: string;
          location: string | null;
          race_type: "road"|"mtb"|"tt"|"stage"|"gravel"|"cyclocross"|null;
          organizer: string | null;
          description: string | null;
          result_summary: string | null;
          cover_media_id: string | null;
          external_url: string | null;
          // migration 20260518000009 — carried over from the source news post.
          gallery_media_ids: string[];
          display_order: number;
          created_at: string; updated_at: string;
        };
        Insert: { slug: string; name: string; race_date: string } & Partial<PublicTables["race_events"]["Row"]>;
        Update: Partial<PublicTables["race_events"]["Row"]>;
      };
      documents: {
        Row: {
          id: string; slug: string; title: string;
          category: "regulations"|"decisions"|"minutes"|"declarations"|"certificates"|"other";
          storage_path: string; filename: string;
          mime_type: string; byte_size: number | null; page_count: number | null;
          description: string | null;
          effective_date: string | null;
          display_order: number;
          visibility: "public" | "members" | "admin";
          uploaded_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          slug: string; title: string;
          category: "regulations"|"decisions"|"minutes"|"declarations"|"certificates"|"other";
          storage_path: string; filename: string;
          mime_type?: string; byte_size?: number | null; page_count?: number | null;
          description?: string | null;
          effective_date?: string | null;
          display_order?: number;
          visibility?: "public"|"members"|"admin";
          uploaded_by?: string | null;
        };
        Update: {
          slug?: string; title?: string;
          category?: "regulations"|"decisions"|"minutes"|"declarations"|"certificates"|"other";
          storage_path?: string; filename?: string;
          mime_type?: string; byte_size?: number | null; page_count?: number | null;
          description?: string | null;
          effective_date?: string | null;
          display_order?: number;
          visibility?: "public"|"members"|"admin";
        };
      };
      training_rides: {
        Row: {
          id: string;
          kind: TrainingRideKind;
          ride_date: string;
          // title / location / notes were DROPPED by migrations
          // 20260519000015 and 20260519000016 — do not re-add them.
          focus: string | null;
          section_id: string | null;
          route_url: string | null;
          distance_km: number | null;
          moving_seconds: number | null;
          elevation_m: number | null;
          strava_url: string | null;
          strava_activity_id: number | null;
          created_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          ride_date: string;
          kind?: TrainingRideKind;
          focus?: string | null;
          section_id?: string | null;
          route_url?: string | null;
          distance_km?: number | null; moving_seconds?: number | null; elevation_m?: number | null;
          strava_url?: string | null; strava_activity_id?: number | null;
          created_by?: string | null;
        };
        Update: Partial<PublicTables["training_rides"]["Row"]>;
      };
      ride_entries: {
        Row: {
          id: string;
          ride_id: string;
          athlete_id: string;
          participated: boolean;
          distance_km: number | null;
          moving_seconds: number | null;
          elapsed_seconds: number | null;
          elevation_m: number | null;
          avg_hr: number | null;
          max_hr: number | null;
          avg_power_w: number | null;
          np_w: number | null;
          ftp_w: number | null;
          set_ftp: boolean;
          best_power_1m_w: number | null;
          best_power_3m_w: number | null;
          best_power_5m_w: number | null;
          best_power_10m_w: number | null;
          best_power_20m_w: number | null;
          best_power_60m_w: number | null;
          tss: number | null;
          intensity_factor: number | null;
          rpe: number | null;
          avg_cadence: number | null;
          strava_url: string | null;
          strava_activity_id: number | null;
          // `notes` was DROPPED by migration 20260519000016 — do not re-add it.
          created_at: string; updated_at: string;
        };
        Insert: {
          ride_id: string; athlete_id: string;
          participated?: boolean;
        } & Partial<PublicTables["ride_entries"]["Row"]>;
        Update: Partial<PublicTables["ride_entries"]["Row"]>;
      };
      athlete_profiles: {
        Row: {
          athlete_id: string;
          ftp_w: number | null;
          ftp_updated_at: string | null;
          weight_kg: number | null;
          max_hr: number | null;
          resting_hr: number | null;
          notes: string | null;
          updated_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          athlete_id: string;
        } & Partial<PublicTables["athlete_profiles"]["Row"]>;
        Update: Partial<PublicTables["athlete_profiles"]["Row"]>;
      };
}

/**
 * supabase-js's `GenericTable` requires a `Relationships` member; a table
 * missing it means `Database["public"]` does not satisfy `GenericSchema`, the
 * client generic silently degrades and every query loses its typing. We do not
 * describe our foreign keys (embedded selects are typed by hand at the call
 * site), so the list is empty — but it has to be present.
 */
type WithRelationships<T> = { [K in keyof T]: T[K] & { Relationships: [] } };

export interface Database {
  public: {
    Tables: WithRelationships<PublicTables>;
    // Views / CompositeTypes are EMPTY BUT MANDATORY for the same reason as
    // Relationships above. There is no `create view` in supabase/migrations.
    Views: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
    Functions: {
      approve_application: { Args: { app_id: string }; Returns: string };
      reject_application:  { Args: { app_id: string; reason?: string | null }; Returns: string };
      set_user_role:       { Args: { target_id: string; new_role: UserRole }; Returns: string };
      // p_period is any date inside the month; the function normalises it.
      generate_dues_for_period: { Args: { p_period: string }; Returns: number };
      // Bill a CHOSEN SET of members for a period, with an optional explicit
      // invoice date. p_issued_on is stored on dues.issued_on and drives the due
      // date (issued_on + 5); null → the trigger fills the due date from the
      // period. Returns the count actually created. Admin/staff only; migration
      // 20260818000001.
      generate_dues_for_members: {
        Args: { p_period: string; p_member_ids: string[]; p_issued_on?: string | null };
        Returns: number;
      };
      // Puts a member on a plan and returns the id of the ACTIVE membership
      // afterwards — the same row when nothing changed or the change was a
      // correction, a brand-new one when an invoiced membership was closed and
      // reopened. Service-role only; see migration 20260808000002, section E.
      set_member_plan: {
        Args: { p_member_id: string; p_plan_id: string; p_amount: number; p_billable: boolean; p_start: string };
        Returns: string;
      };
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
      training_ride_kind: TrainingRideKind;
      news_source: NewsSource;
      team_position: TeamPosition;
    };
  };
}

/**
 * Shorthands so an action can name the exact row shape it is writing —
 * `TableUpdate<"events">` — instead of casting the payload away. Prefer these
 * over `Record<string, unknown>` for anything handed to insert/update/upsert:
 * that is what makes a wrong column name a compile error.
 */
export type TableName = keyof Database["public"]["Tables"];
export type TableRow<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends TableName> = Database["public"]["Tables"][T]["Update"];

// Shorthands for the academy finance tables. The rest of the app spells these
// out inline; these two are aliased because the plans / memberships / invoices
// screens pass the rows around a lot.
export type MembershipPlan = PublicTables["membership_plans"]["Row"];
export type MembershipPlanInsert = PublicTables["membership_plans"]["Insert"];
export type MembershipPlanUpdate = PublicTables["membership_plans"]["Update"];

export type Membership = PublicTables["memberships"]["Row"];
export type MembershipInsert = PublicTables["memberships"]["Insert"];
export type MembershipUpdate = PublicTables["memberships"]["Update"];

export type Due = PublicTables["dues"]["Row"];
export type DueInsert = PublicTables["dues"]["Insert"];
export type DueUpdate = PublicTables["dues"]["Update"];

// Club money that is not membership dues: the funds coming in and the expense
// ledger going out (migration 20260810000002). Aliased for the same reason as
// the rows above — the funds / expenses screens pass them around a lot.
export type ExpenseCategory = PublicTables["expense_categories"]["Row"];
export type ExpenseCategoryInsert = PublicTables["expense_categories"]["Insert"];
export type ExpenseCategoryUpdate = PublicTables["expense_categories"]["Update"];

export type ClubFund = PublicTables["club_funds"]["Row"];
export type ClubFundInsert = PublicTables["club_funds"]["Insert"];
export type ClubFundUpdate = PublicTables["club_funds"]["Update"];

export type ClubExpense = PublicTables["club_expenses"]["Row"];
export type ClubExpenseInsert = PublicTables["club_expenses"]["Insert"];
export type ClubExpenseUpdate = PublicTables["club_expenses"]["Update"];

// Types for the `family_planner` schema.
// Mirrors supabase/migrations/20261116120000_family_planner_init.sql.
// Update this file whenever you add a migration.

export type MemberRole = "parent" | "child" | "other";
export type EventPermission = "allowed" | "approval" | "blocked";
export type EventStatus = "approved" | "pending" | "declined";
export type RuleArea = "everything" | "events" | "tasks" | "shopping" | "meals" | "requests";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Family = {
  id: string;
  name: string;
  invite_code: string;
  timezone: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FamilyMember = {
  family_id: string;
  user_id: string;
  display_name: string;
  role: MemberRole;
  color: string;
  event_permission: EventPermission;
  joined_at: string;
};

export type CalendarEvent = {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  assigned_to: string | null;
  kind: "event" | "slot";
  requests_close_at: string | null;
  chosen_request_id: string | null;
  lat: number | null;
  lng: number | null;
  driver_id: string | null;
  status: EventStatus;
  invitees_can_edit: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  family_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  points: number;
  assigned_to: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ShoppingList = {
  id: string;
  family_id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type ShoppingItem = {
  id: string;
  list_id: string;
  family_id: string;
  name: string;
  quantity: string | null;
  checked: boolean;
  checkers_url: string | null;
  added_by: string;
  created_at: string;
};

export type Meal = {
  id: string;
  family_id: string;
  date: string;
  meal_type: MealType;
  title: string;
  notes: string | null;
  created_by: string;
  created_at: string;
};

export type ActivityRequest = {
  id: string;
  family_id: string;
  event_id: string;
  title: string;
  notes: string | null;
  requested_by: string;
  created_at: string;
};

export type ActivityVote = { request_id: string; user_id: string; family_id: string; created_at: string };

export type MemberRule = {
  id: string;
  family_id: string;
  target_user: string | null;
  target_role: MemberRole | null;
  area: RuleArea;
  days: number[] | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type Invite = {
  id: string;
  family_id: string;
  email: string;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
};

export type MyInvite = {
  id: string;
  family_id: string;
  family_name: string;
  role: MemberRole;
  invited_by_name: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  family_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
};

export type EventInvite = {
  event_id: string;
  user_id: string;
  family_id: string;
  status: "pending" | "accepted" | "declined";
  invited_by: string | null;
  created_at: string;
  responded_at: string | null;
};

export type SavedPlace = {
  id: string;
  user_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  is_home: boolean;
  created_at: string;
};

export type ChangeLogRow = {
  id: number;
  family_id: string;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "delete";
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export type Database = {
  family_planner: {
    Tables: {
      families: Table<Family, never, Pick<Family, "name" | "timezone">>;
      family_members: Table<
        FamilyMember,
        never,
        Partial<Pick<FamilyMember, "display_name" | "color" | "role" | "event_permission">>
      >;
      events: Table<
        CalendarEvent,
        Pick<CalendarEvent, "family_id" | "title" | "starts_at"> &
          Partial<
            Pick<
              CalendarEvent,
              | "description"
              | "location"
              | "ends_at"
              | "all_day"
              | "assigned_to"
              | "kind"
              | "requests_close_at"
              | "chosen_request_id"
              | "lat"
              | "lng"
              | "driver_id"
              | "status"
              | "invitees_can_edit"
            >
          >
      >;
      tasks: Table<
        Task,
        Pick<Task, "family_id" | "title"> &
          Partial<
            Pick<Task, "notes" | "due_date" | "points" | "assigned_to" | "completed_at" | "completed_by">
          >
      >;
      shopping_lists: Table<ShoppingList, Pick<ShoppingList, "family_id"> & Partial<Pick<ShoppingList, "name">>>;
      shopping_items: Table<
        ShoppingItem,
        Pick<ShoppingItem, "list_id" | "family_id" | "name"> &
          Partial<Pick<ShoppingItem, "quantity" | "checked" | "checkers_url">>
      >;
      activity_requests: Table<
        ActivityRequest,
        Pick<ActivityRequest, "family_id" | "event_id" | "title"> & Partial<Pick<ActivityRequest, "notes">>,
        Partial<Pick<ActivityRequest, "title" | "notes">>
      >;
      activity_votes: Table<ActivityVote, Pick<ActivityVote, "request_id" | "family_id">, never>;
      member_rules: Table<
        MemberRule,
        Pick<MemberRule, "family_id"> &
          Partial<
            Pick<
              MemberRule,
              "target_user" | "target_role" | "area" | "days" | "start_time" | "end_time" | "start_date" | "end_date" | "note"
            >
          >
      >;
      invites: Table<Invite, Pick<Invite, "family_id" | "email" | "role">, never>;
      notifications: Table<Notification, never, Pick<Notification, "read_at">>;
      push_subscriptions: Table<PushSubscriptionRow, never, never>;
      saved_places: Table<
        SavedPlace,
        Pick<SavedPlace, "name" | "address" | "lat" | "lng"> & Partial<Pick<SavedPlace, "is_home">>
      >;
      change_log: Table<ChangeLogRow, never, never>;
      event_invites: Table<EventInvite, Pick<EventInvite, "event_id" | "user_id" | "family_id">, Pick<EventInvite, "status">>;
      meals: Table<
        Meal,
        Pick<Meal, "family_id" | "date" | "title"> & Partial<Pick<Meal, "meal_type" | "notes">>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_family: { Args: { p_name: string; p_display_name: string }; Returns: Family };
      join_family: { Args: { p_invite_code: string; p_display_name: string }; Returns: Family };
      regenerate_invite_code: { Args: { p_family_id: string }; Returns: string };
      is_family_member: { Args: { p_family_id: string }; Returns: boolean };
      is_family_parent: { Args: { p_family_id: string }; Returns: boolean };
      can_write: { Args: { p_family_id: string; p_area: RuleArea }; Returns: boolean };
      can_edit_event: { Args: { p_event_id: string }; Returns: boolean };
      is_event_invitee: { Args: { p_event_id: string }; Returns: boolean };
      my_invites: { Args: Record<string, never>; Returns: MyInvite[] };
      accept_invite: { Args: { p_invite_id: string; p_display_name: string }; Returns: Family };
      save_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent: string };
        Returns: undefined;
      };
      vapid_public_key: { Args: Record<string, never>; Returns: string | null };
    };
    Enums: { member_role: MemberRole; meal_type: MealType; rule_area: RuleArea };
    CompositeTypes: Record<string, never>;
  };
};

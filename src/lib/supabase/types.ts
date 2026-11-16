// Types for the `family_planner` schema.
// Mirrors supabase/migrations/20261116120000_family_planner_init.sql.
// Update this file whenever you add a migration.

export type MemberRole = "owner" | "adult" | "child";
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

export type Database = {
  family_planner: {
    Tables: {
      families: Table<Family, never, Pick<Family, "name" | "timezone">>;
      family_members: Table<
        FamilyMember,
        never,
        Partial<Pick<FamilyMember, "display_name" | "color" | "role">>
      >;
      events: Table<
        CalendarEvent,
        Pick<CalendarEvent, "family_id" | "title" | "starts_at"> &
          Partial<
            Pick<CalendarEvent, "description" | "location" | "ends_at" | "all_day" | "assigned_to">
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
          Partial<Pick<ShoppingItem, "quantity" | "checked">>
      >;
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
      is_family_owner: { Args: { p_family_id: string }; Returns: boolean };
    };
    Enums: { member_role: MemberRole; meal_type: MealType };
    CompositeTypes: Record<string, never>;
  };
};

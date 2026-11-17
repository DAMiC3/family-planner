-- Pick-ups: when someone must be collected from an event (null = no pick-up needed).
alter table family_planner.events
  add column pickup_at timestamptz;

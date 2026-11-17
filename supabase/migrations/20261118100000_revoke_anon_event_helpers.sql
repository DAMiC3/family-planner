-- New helper functions were created with the default PUBLIC execute grant; signed-in users only.
revoke execute on function family_planner.can_edit_event(uuid), family_planner.is_event_invitee(uuid) from public, anon;

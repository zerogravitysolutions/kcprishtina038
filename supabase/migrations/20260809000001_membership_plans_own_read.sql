-- Let a member read the plan rows their OWN memberships point at, even after the
-- club deactivates that tier.
--
-- membership_plans_select_active is `using (active = true)`, so once a tier is
-- retired the member portal could no longer resolve the plan name and fell back to
-- "Plan i arkivuar", while staff looking at the same invoice in /admin/finance saw
-- the real name. Two screens naming one invoice differently is exactly the kind of
-- disagreement that turns into a support conversation.
--
-- Scoped deliberately: this exposes only the plans the member is or was actually
-- enrolled on, not the whole catalogue, so an unreleased or retired tier stays
-- hidden from everyone who was never on it. The subquery is evaluated with the
-- caller's own privileges and memberships_select_own already restricts it to
-- member_id = auth.uid(); memberships' policies do not reference membership_plans,
-- so there is no policy recursion.
create policy membership_plans_select_own_membership on public.membership_plans
  for select to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.plan_id = membership_plans.id
        and m.member_id = auth.uid()
    )
  );

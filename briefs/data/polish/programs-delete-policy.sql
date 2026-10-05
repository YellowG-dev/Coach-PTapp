-- Step 9 polish · P4 · tighten the delete policy on public.programs
--
-- WRITES. Run once in the Supabase SQL Editor, after the Coach 0.12.1 PR is
-- merged. Not run by the cloud session.
--
-- Before: programs_delete = (owner_id = auth.uid())   — no date guard; the
--         owner could delete an in-force or past version and re-score history.
-- After:  programs_delete = (owner_id = auth.uid() AND effective_from > current_date)
--         — only a version that has not yet taken effect can be deleted.
--
-- ALTER POLICY changes only the USING expression, so the policy's command
-- (DELETE) and roles stay exactly as they are. The guard makes this a no-op,
-- with a NOTICE, unless the current expression is exactly the one checked on
-- 3 Oct; anything else is left for a human to look at.
--
-- current_date is the database's date (UTC). The Coach app compares against
-- the coach's local date, which is never behind UTC in Finland, so the app is
-- always at least as strict as this policy.

do $$
declare
  cur text;
begin
  select qual into cur
  from pg_policies
  where schemaname = 'public' and tablename = 'programs' and policyname = 'programs_delete';

  if cur is null then
    raise notice 'programs_delete not found on public.programs: nothing changed';
  elsif cur = '(owner_id = auth.uid())' then
    alter policy programs_delete on public.programs
      using (owner_id = auth.uid() and effective_from > current_date);
    raise notice 'programs_delete updated';
  else
    raise notice 'programs_delete is not the expected text, nothing changed. Current: %', cur;
  end if;
end
$$;

-- Result: expect qual = ((owner_id = auth.uid()) AND (effective_from > CURRENT_DATE)), cmd = DELETE.
select policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'programs'
order by policyname;

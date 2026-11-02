-- Step 10 · Phase 1 · relabel Ville's Polar sessions stored under raw sport ids
--
-- WRITES. Run once in the Supabase SQL Editor. Not run by a cloud session.
-- Independent of the Phase 1 code: wearable-sync v8 (deployed 26 Oct 2026)
-- already writes these names for new sessions. This fixes the 7 rows stored
-- before v8, which are outside the sync window and would never be rewritten.
--
-- Mapping, each matched against the Oura workout with the same start minute:
--   polar:24 -> crossCountrySkiing   4/4  (10, 12, 13, 14 Oct)
--   polar:11 -> walking              2/2  (10, 11 Oct)
--   polar:9  -> nordicWalking        1/1  (13 Oct)
--
-- Only `sport` changes. `raw` keeps Polar's original payload. The client's
-- confirmed entries are keyed by vendor:session id, not by sport, so nothing
-- is re-offered. The 7 entries Ville already confirmed keep the label his app
-- stored ("Polar:24" etc.); his phone copy is the source of truth, so this
-- file does not touch day_overrides.
--
-- Guard: changes nothing, with a NOTICE, unless exactly these rows exist —
-- 4 / 2 / 1 for Ville and no polar:24/11/9 rows for anyone else.

do $$
declare
  ville uuid;
  n24 int; n11 int; n9 int; others int; changed int;
begin
  select id into ville from public.profiles where display_name = 'Ville';
  if ville is null then
    raise notice 'Ville not found in profiles: nothing changed';
    return;
  end if;

  select count(*) filter (where sport = 'polar:24'),
         count(*) filter (where sport = 'polar:11'),
         count(*) filter (where sport = 'polar:9')
    into n24, n11, n9
  from public.wearable_workouts
  where user_id = ville and vendor = 'polar';

  select count(*) into others
  from public.wearable_workouts
  where vendor = 'polar' and sport in ('polar:24', 'polar:11', 'polar:9') and user_id <> ville;

  if n24 <> 4 or n11 <> 2 or n9 <> 1 or others <> 0 then
    raise notice 'Not the expected state (polar:24=%, polar:11=%, polar:9=%, other users=%): nothing changed',
      n24, n11, n9, others;
    return;
  end if;

  update public.wearable_workouts
     set sport = case sport
                   when 'polar:24' then 'crossCountrySkiing'
                   when 'polar:11' then 'walking'
                   when 'polar:9'  then 'nordicWalking'
                 end
   where user_id = ville and vendor = 'polar' and sport in ('polar:24', 'polar:11', 'polar:9');
  get diagnostics changed = row_count;
  raise notice 'Relabelled % rows', changed;
end
$$;

-- Result: expect crossCountrySkiing 4, walking includes the 2, nordicWalking 1,
-- and no polar:24 / polar:11 / polar:9 rows left.
select w.sport, count(*) as n, min(w.day) as first_day, max(w.day) as last_day
from public.wearable_workouts w
join public.profiles p on p.id = w.user_id
where p.display_name = 'Ville' and w.vendor = 'polar'
  and (w.sport in ('crossCountrySkiing', 'nordicWalking', 'polar:24', 'polar:11', 'polar:9')
       or (w.sport = 'walking' and w.day between '2026-10-10' and '2026-10-11'))
group by w.sport
order by w.sport;

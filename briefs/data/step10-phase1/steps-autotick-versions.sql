-- Step 10 · Phase 1 · data: steps auto-tick versions for Juha and Henna (D11, D11a)
--
-- WRITES. Run once in the Supabase SQL Editor of the **PT app** project
-- (qpkdqyazdzhoohowkouy). Needs client apps 5.10.0-beta1 (merged 14 Nov 2026).
-- Older cached apps ignore the new `auto` field, so nothing breaks before a
-- phone updates.
--
-- Inserts two new versions, effective Sun 15 Nov 2026. Nothing existing is
-- changed.
--   juha-2026-11-15   from juha-2026-11-14 (fp 40001ef9):
--     daily[2] "Daily Check" task chk-walk gains auto { source: steps, min: 10000 }.
--     Nothing else changes.
--   henna-2026-11-15  from henna-2026-10-07 (fp a9aa68b7):
--     daily[1] "Daily Check" task steps gains auto { source: steps, min: 7000 }
--     and is renamed "Walk 7,000 steps". The two Program-tab sentences that say
--     "10,000 steps" now say "7,000 steps". Nothing else changes.
--
-- Dry-run on 14 Nov 2026 (read-only): resulting fingerprints
--   juha-2026-11-15   7b447476
--   henna-2026-11-15  daf2d2a1
-- Check afterwards:
--   select id, left(md5(definition::text),8) from public.programs
--   where effective_from = '2026-11-15';
--
-- Guards: changes nothing, with a NOTICE, unless both source versions have the
-- expected fingerprints, both tasks are exactly as expected, each Program-tab
-- sentence occurs exactly once, and neither client already has a version
-- effective 15 Nov. Both rows are inserted or neither.

do $$
declare
  jsrc public.programs%rowtype;
  hsrc public.programs%rowtype;
  jdef jsonb;
  hdef jsonb;
  htxt text;
  s1 constant text := 'Plus the mobility flow every day, and 10,000 steps.';
  s2 constant text := 'plus 10,000 steps a day.';
begin
  select * into jsrc from public.programs where id = 'juha-2026-11-14';
  select * into hsrc from public.programs where id = 'henna-2026-10-07';

  if jsrc.id is null or left(md5(jsrc.definition::text), 8) <> '40001ef9' then
    raise notice 'juha-2026-11-14 missing or changed: nothing changed'; return;
  end if;
  if hsrc.id is null or left(md5(hsrc.definition::text), 8) <> 'a9aa68b7' then
    raise notice 'henna-2026-10-07 missing or changed: nothing changed'; return;
  end if;
  if jsrc.definition #> '{daily,2,title}' <> '"Daily Check"'::jsonb
     or not (jsrc.definition #> '{daily,2,tasks}' @> '[{"id":"chk-walk","name":"Walk 10,000 steps","presc":"Daily step target"}]'::jsonb) then
    raise notice 'Juha chk-walk not where expected: nothing changed'; return;
  end if;
  if hsrc.definition #> '{daily,1,title}' <> '"Daily Check"'::jsonb
     or not (hsrc.definition #> '{daily,1,tasks}' @> '[{"id":"steps","name":"Walk 10,000 steps","presc":"Daily step target"}]'::jsonb) then
    raise notice 'Henna steps task not where expected: nothing changed'; return;
  end if;
  htxt := hsrc.definition::text;
  if (length(htxt) - length(replace(htxt, s1, ''))) / length(s1) <> 1
     or (length(htxt) - length(replace(htxt, s2, ''))) / length(s2) <> 1 then
    raise notice 'Henna Program-tab sentences not found exactly once: nothing changed'; return;
  end if;
  if exists (select 1 from public.programs
             where effective_from = '2026-11-15'
               and assigned_to in (jsrc.assigned_to, hsrc.assigned_to)) then
    raise notice 'A version effective 2026-11-15 already exists: nothing changed'; return;
  end if;

  jdef := jsonb_set(jsrc.definition, '{daily,2,tasks}',
    (select jsonb_agg(case when t->>'id' = 'chk-walk'
                           then t || '{"auto":{"source":"steps","min":10000}}'::jsonb
                           else t end order by i)
       from jsonb_array_elements(jsrc.definition #> '{daily,2,tasks}') with ordinality x(t, i)));

  hdef := replace(replace(htxt, s1, 'Plus the mobility flow every day, and 7,000 steps.'),
                  s2, 'plus 7,000 steps a day.')::jsonb;
  hdef := jsonb_set(hdef, '{daily,1,tasks}',
    (select jsonb_agg(case when t->>'id' = 'steps'
                           then t || '{"name":"Walk 7,000 steps","auto":{"source":"steps","min":7000}}'::jsonb
                           else t end order by i)
       from jsonb_array_elements(hdef #> '{daily,1,tasks}') with ordinality x(t, i)));

  insert into public.programs (id, owner_id, name, definition, app_version, assigned_to, effective_from)
  values
    ('juha-2026-11-15',  jsrc.owner_id, 'Juha — effective 2026-11-15',  jdef, jsrc.app_version, jsrc.assigned_to, '2026-11-15'),
    ('henna-2026-11-15', hsrc.owner_id, 'Henna — effective 2026-11-15', hdef, hsrc.app_version, hsrc.assigned_to, '2026-11-15');

  raise notice 'Inserted juha-2026-11-15 (fp %) and henna-2026-11-15 (fp %)',
    left(md5(jdef::text), 8), left(md5(hdef::text), 8);
end
$$;

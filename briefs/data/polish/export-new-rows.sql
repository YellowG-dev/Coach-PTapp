-- Step 9 polish · export the 6 programme rows missing from Coach fixtures/programs.json
-- READ-ONLY. Run in the Supabase SQL Editor, copy the single result cell,
-- save it as programs-new-rows.json and attach it in chat. Chat checks each
-- definition against the md5s in briefs/step9-polish.md before committing it.
select jsonb_pretty(jsonb_agg(jsonb_build_object(
         'id', id,
         'name', name,
         'owner_id', owner_id,
         'assigned_to', assigned_to,
         'effective_from', effective_from::text,
         'definition', definition
       ) order by id)) as rows
from public.programs
where id in ('henna-2026-10', 'joonatan-2026-09-29', 'joonatan-2026-10',
             'juha-2026-09-29', 'juha-2026-10', 'ville-2026-10');

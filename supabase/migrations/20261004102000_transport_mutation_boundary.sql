-- Only controlled workflows may mutate records whose changes have lifecycle effects.
do $$declare target_table text; columns text; begin
 foreach target_table in array array['events','event_series','event_locations','event_participation','ride_participation'] loop
  execute format('revoke insert,update,delete on public.%I from anon,authenticated',target_table);
  select string_agg(quote_ident(column_name),',') into columns from information_schema.columns where table_schema='public' and information_schema.columns.table_name=target_table;
  execute format('revoke insert(%s),update(%s) on public.%I from anon,authenticated',columns,columns,target_table);
 end loop;
end $$;

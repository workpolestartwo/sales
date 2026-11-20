-- Rates are stamped with who updated them and when.
-- From the app (a signed-in member) the stamp is always automatic and can't be faked.
-- From the SQL editor / admin scripts (no signed-in user), keep the name and time given,
-- so rates can be seeded or imported on someone's behalf.

create or replace function public.stamp_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    new.updated_at := coalesce(new.updated_at, now());
    new.updated_by_name := coalesce(new.updated_by_name, 'Admin');
    return new;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  select coalesce(full_name, 'Unknown') into new.updated_by_name from profiles where id = auth.uid();
  return new;
end $$;

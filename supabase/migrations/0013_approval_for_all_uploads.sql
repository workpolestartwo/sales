-- Every uploaded client goes through approval -> priority before it appears in the CRM,
-- including the uploader's own clients. Requests now carry the sheet's other columns
-- (shipments, dates, email...) so nothing is lost when the client is approved.

alter table public.client_assignments add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function public.accept_assignments(p_ids uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare
  r record;
  d jsonb;
  v_client uuid;
  v_added int := 0;
begin
  for r in
    select * from client_assignments
    where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending'
  loop
    d := coalesce(r.details, '{}'::jsonb);
    select id into v_client from clients where owner_id = auth.uid() and company_key = normalize_company(r.company);
    if v_client is null then
      insert into clients (
        owner_id, company, area, contact_person, phone, notes, email, address, industry,
        total_shipments, first_shipment_date, last_shipment_date, last_meeting_date, last_contact_date, next_follow_up,
        source, status, priority_pending
      ) values (
        auth.uid(), btrim(r.company), r.area, r.contact_person, r.phone, r.notes,
        nullif(d ->> 'email', ''), nullif(d ->> 'address', ''), nullif(d ->> 'industry', ''),
        coalesce((d ->> 'total_shipments')::int, 0),
        (d ->> 'first_shipment_date')::date, (d ->> 'last_shipment_date')::date,
        (d ->> 'last_meeting_date')::date, (d ->> 'last_contact_date')::date, (d ->> 'next_follow_up')::date,
        'assigned', 'active', true
      )
      returning id into v_client;
      update client_assignments set status = 'accepted', client_id = v_client, decided_at = now() where id = r.id;
      v_added := v_added + 1;
    else
      update clients set
        area = coalesce(area, r.area),
        contact_person = coalesce(contact_person, r.contact_person),
        phone = coalesce(phone, r.phone)
      where id = v_client;
      update client_assignments set status = 'duplicate', client_id = v_client, decided_at = now() where id = r.id;
    end if;
  end loop;
  return v_added;
end $$;

-- Passing clients to a teammate keeps their details too.
create or replace function public.reassign_assignments(p_ids uuid[], p_to uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_batch uuid := gen_random_uuid();
begin
  if p_to is null or p_to = auth.uid() then
    raise exception 'Pick a teammate to pass these clients to';
  end if;
  insert into client_assignments (batch_id, assignee_id, assigned_by, company, area, contact_person, phone, notes, details)
  select v_batch, p_to, auth.uid(), company, area, contact_person, phone, notes, details
  from client_assignments
  where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending';

  update client_assignments set status = 'reassigned', reassigned_to = p_to, decided_at = now()
  where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending';
  return v_batch;
end $$;

grant execute on function public.accept_assignments(uuid[]), public.reassign_assignments(uuid[], uuid) to authenticated, service_role;
revoke execute on function public.accept_assignments(uuid[]), public.reassign_assignments(uuid[], uuid) from anon, public;

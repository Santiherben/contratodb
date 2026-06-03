alter table public.profiles
add column if not exists contract_accepted_at timestamptz;

create or replace function public.accept_contract()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_at timestamptz;
begin
  accepted_at := now();

  update public.profiles
  set contract_accepted_at = accepted_at
  where id = auth.uid()
    and role = 'student';

  return accepted_at;
end;
$$;

grant execute on function public.accept_contract() to authenticated;

revoke update on table public.profiles from authenticated;

grant update (full_name, phone, avatar_url, birth_date, cpf)
on table public.profiles
to authenticated;

comment on table public.profiles is 'User profiles. Authenticated users may edit only personal profile columns; account activation and blocking are controlled by privileged RPCs.';

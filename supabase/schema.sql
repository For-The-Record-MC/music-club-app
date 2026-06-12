-- Current-state schema snapshot of the public schema.
-- GENERATED — do not edit by hand. Regenerate after every `supabase db push`.
-- Source of truth for CURRENT schema; migration files are append-only history.

-- =====================================================
-- TABLES
-- =====================================================

CREATE TABLE club_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  joined_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE clubs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🎵'::text,
  owner_id uuid NOT NULL,
  invite_code text NOT NULL DEFAULT generate_invite_code(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id uuid NOT NULL,
  display_name text,
  avatar_color integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);


-- =====================================================
-- CONSTRAINTS
-- =====================================================

ALTER TABLE club_members ADD CONSTRAINT club_members_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;

ALTER TABLE club_members ADD CONSTRAINT club_members_club_id_profile_id_key UNIQUE (club_id, profile_id);

ALTER TABLE club_members ADD CONSTRAINT club_members_pkey PRIMARY KEY (id);

ALTER TABLE club_members ADD CONSTRAINT club_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE club_members ADD CONSTRAINT club_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));

ALTER TABLE clubs ADD CONSTRAINT clubs_invite_code_key UNIQUE (invite_code);

ALTER TABLE clubs ADD CONSTRAINT clubs_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 60)));

ALTER TABLE clubs ADD CONSTRAINT clubs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id);

ALTER TABLE clubs ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);

ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_color_check CHECK (((avatar_color >= 0) AND (avatar_color <= 6)));

ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_check CHECK (((display_name IS NULL) OR ((char_length(display_name) >= 1) AND (char_length(display_name) <= 40))));

ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX club_members_club_idx ON public.club_members USING btree (club_id);

CREATE UNIQUE INDEX club_members_one_owner_idx ON public.club_members USING btree (club_id) WHERE (role = 'owner'::text);

CREATE INDEX club_members_profile_idx ON public.club_members USING btree (profile_id);


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY club_members_delete ON club_members AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((profile_id = auth.uid()) AND (role <> 'owner'::text)) OR ((club_role(club_id) = 'owner'::text) AND (profile_id <> auth.uid())) OR ((club_role(club_id) = 'admin'::text) AND (role = 'member'::text))));

CREATE POLICY club_members_select ON club_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(club_id));

CREATE POLICY club_members_update ON club_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((club_role(club_id) = 'owner'::text) AND (profile_id <> auth.uid())))
  WITH CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])));

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY clubs_delete ON clubs AS PERMISSIVE FOR DELETE TO authenticated
  USING ((club_role(id) = 'owner'::text));

CREATE POLICY clubs_select ON clubs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_club_member(id));

CREATE POLICY clubs_update ON clubs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((club_role(id) = ANY (ARRAY['owner'::text, 'admin'::text])))
  WITH CHECK ((club_role(id) = ANY (ARRAY['owner'::text, 'admin'::text])));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY profiles_update ON profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));


-- =====================================================
-- FUNCTIONS & PROCEDURES
-- =====================================================

CREATE OR REPLACE FUNCTION public.club_role(p_club uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from club_members
  where club_id = p_club and profile_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.create_club(p_name text, p_emoji text DEFAULT '🎵'::text)
 RETURNS clubs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into clubs (name, emoji, owner_id)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '🎵'), auth.uid())
  returning * into v_club;

  insert into club_members (club_id, profile_id, role)
  values (v_club.id, auth.uid(), 'owner');

  return v_club;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invite_code()
 RETURNS text
 LANGUAGE sql
AS $function$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1),
    ''
  )
  from generate_series(1, 8);
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, avatar_color)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    floor(random() * 7)::int
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_club_member(p_club uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from club_members
    where club_id = p_club and profile_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.join_club(p_code text)
 RETURNS clubs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club public.clubs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_club from clubs where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into club_members (club_id, profile_id, role)
  values (v_club.id, auth.uid(), 'member')
  on conflict (club_id, profile_id) do nothing;

  return v_club;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_invite_code(p_club uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
begin
  if public.club_role(p_club) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  update clubs set invite_code = public.generate_invite_code()
  where id = p_club
  returning invite_code into v_code;
  return v_code;
end;
$function$
;


-- =====================================================
-- TRIGGERS
-- =====================================================

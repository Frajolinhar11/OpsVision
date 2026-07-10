-- ============================================
-- Create any user directly (no rate limit, no email)
-- Run in Supabase SQL Editor whenever you need
-- a new user. Edit the values below.
-- ============================================

DO $$
DECLARE
  v_email TEXT := 'novo@email.com';           -- << CHANGE
  v_password TEXT := 'senha123';               -- << CHANGE
  v_name TEXT := 'Nome do Usuário';            -- << CHANGE
  v_type TEXT := 'funcionario';                -- gestor | funcionario
  v_company_id BIGINT := 1;                    -- ID da empresa
  v_auth_id UUID;
BEGIN
  -- Create auth user
  INSERT INTO auth.users (instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), 'authenticated', 'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', v_name, 'type', v_type),
    NOW(), NOW(),
    '', '', '', ''
  )
  RETURNING id INTO v_auth_id;

  -- Create profile
  INSERT INTO users (id, auth_id, company_id, name, type, initials, email)
  VALUES (
    (SELECT COALESCE(MAX(id), 0) + 1 FROM users),
    v_auth_id,
    v_company_id,
    v_name,
    v_type,
    UPPER(LEFT(v_name, 2)),
    v_email
  );

  RAISE NOTICE 'User created: % / %', v_email, v_password;
END;
$$;

-- ============================================
-- Create first admin user directly (bypass rate limit)
-- Run ONLY ONCE in Supabase SQL Editor
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Replace the values below with your desired credentials:
-- NOTE: if gen_salt still fails, run: CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_email TEXT := 'admin@empresa.com';        -- << CHANGE THIS
  v_password TEXT := 'admin123';              -- << CHANGE THIS
  v_name TEXT := 'Admin Master';              -- << CHANGE THIS
  v_company_id BIGINT;
  v_auth_id UUID;
BEGIN
  -- Ensure default company exists
  SELECT id INTO v_company_id FROM companies ORDER BY id LIMIT 1;
  IF v_company_id IS NULL THEN
    INSERT INTO companies (id, name, slug) VALUES (1, 'Minha Empresa', 'minha-empresa')
    RETURNING id INTO v_company_id;
  END IF;

  -- Create user in auth.users with correct password hash
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', v_name, 'type', 'gestor'),
    NOW(), NOW(),
    '', '', '', ''
  )
  RETURNING id INTO v_auth_id;

  -- Create profile in public.users
  INSERT INTO users (id, auth_id, company_id, name, type, initials, email)
  VALUES (
    (SELECT COALESCE(MAX(id), 0) + 1 FROM users),
    v_auth_id,
    v_company_id,
    v_name,
    'gestor',
    UPPER(LEFT(v_name, 2)),
    v_email
  );

  RAISE NOTICE 'Admin user created: %', v_email;
END;
$$;

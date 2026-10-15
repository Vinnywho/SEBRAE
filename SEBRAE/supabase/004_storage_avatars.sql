-- =====================================================================
-- 004_storage_avatars.sql: Bucket de Avatares para Foto de Perfil
-- =====================================================================

-- 1. Cria o bucket publico 'avatars' caso nao exista
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permite que qualquer pessoa leia as fotos de perfil
DROP POLICY IF EXISTS "Public Avatars Access" ON storage.objects;
CREATE POLICY "Public Avatars Access" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');

-- 3. Permite que usuarios autenticados facam upload de fotos
DROP POLICY IF EXISTS "Authenticated User Upload Avatar" ON storage.objects;
CREATE POLICY "Authenticated User Upload Avatar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- 4. Permite que o usuario atualize ou delete suas fotos
DROP POLICY IF EXISTS "Authenticated User Update Avatar" ON storage.objects;
CREATE POLICY "Authenticated User Update Avatar" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated User Delete Avatar" ON storage.objects;
CREATE POLICY "Authenticated User Delete Avatar" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars');

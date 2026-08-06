-- Revogar permissão de execução de todos os papéis (inclusive public)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

-- Garantir que apenas o service_role possa executar se necessário (embora triggers rodem como superuser internamente)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
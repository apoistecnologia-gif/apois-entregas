-- Restringir privilégios na sequence do order_number
-- O nome padrão para uma coluna IDENTITY em public.orders é public.orders_order_number_seq
REVOKE ALL PRIVILEGES ON SEQUENCE public.orders_order_number_seq FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON SEQUENCE public.orders_order_number_seq TO service_role;

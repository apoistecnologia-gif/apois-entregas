import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: () => <Outlet />,
});

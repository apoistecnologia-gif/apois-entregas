import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/perfil/notificacoes')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/perfil/notificacoes"!</div>
}

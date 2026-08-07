import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/perfil/legal')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/perfil/legal"!</div>
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/perfil/ajuda')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/perfil/ajuda"!</div>
}

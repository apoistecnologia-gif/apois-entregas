import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/perfil/pagamentos')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/perfil/pagamentos"!</div>
}

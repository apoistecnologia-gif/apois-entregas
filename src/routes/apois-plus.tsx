import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/apois-plus')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/apois-plus"!</div>
}

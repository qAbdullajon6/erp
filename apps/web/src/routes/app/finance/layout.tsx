import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/finance/layout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/finance/layout"!</div>
}

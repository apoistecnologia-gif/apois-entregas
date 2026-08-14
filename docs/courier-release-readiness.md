# APOIS Entregas — Courier release readiness

This document tracks the release gates for the courier application without declaring external payment providers live before homologation.

## Functional gates

- Courier onboarding, documents and approval states.
- Online/offline availability with location required before going online.
- Incoming delivery offers delivered through the authenticated `get_courier_incoming_offers` RPC.
- Offer UI with realtime subscription, polling fallback, countdown, sound/vibration and accept/reject actions.
- Destination privacy before acceptance: only the permitted approximate delivery area is shown.
- Atomic acceptance through `accept_delivery_offer`.
- Single active delivery enforced by backend rules.
- Delivery lifecycle: accepted → arriving_pickup → at_pickup → picked_up → on_the_way → arrived_destination → delivered.
- Delivery completion protected by four-digit PIN.
- Earnings, wallet, payout history, delivery history and support surfaces.
- Premium mobile-first black/gold visual language and bottom navigation: Início, Corridas, Ganhos, Perfil.

## Security gates

- Backend/RPC remains source of truth for critical status transitions.
- RLS remains enabled for courier-sensitive entities.
- `service_role` is never exposed to the frontend.
- Offer acceptance remains atomic and cannot assign the same delivery twice.
- Full customer destination is not exposed through the pre-acceptance offer payload.
- Payment/webhook state is not simulated manually.

## Payment/payout note

OpenPix is configured for the project, but the current environment must not be described as production-live until provider homologation and production credentials are confirmed. No real payout is required for courier UI/build validation.

## Final build gate

Before distributing the consolidated courier APK, require green install, typecheck, lint, tests, courier web build and Android courier build, then verify the generated artifact before sharing it for installation.

# FestFlow architecture

_Last edited by Meera Kulkarni, 18 Jan 2026_

## Overview

FestFlow is a small monorepo with three deployables: the web app, the API and
the gate scanner PWA. Email templates are a build-time package used by the API.
There is a single production environment and no staging.

## Auth

We use Firebase Authentication for participant login (Google sign-in and email
link). The API verifies Firebase ID tokens with firebase-admin and maps the uid
to a `participant` row. Admin desk access is an allow-list of emails.

## Data

PostgreSQL holds participants, events, teams, registrations, payments and
tickets. Prisma migrations live in `apps/api/prisma`. The production database
URL and password are set as environment variables on the host; they are not in
the repo.

## Payments

Gateway not chosen yet. Whatever we pick must support UPI, send a signed
webhook, and allow refunds through the API.

## Tickets and check-in

Each paid registration gets a ticket ID and a QR code. The scanner PWA must be
able to verify tickets offline and sync check-ins when it gets network back.
Hostel and auditorium Wi-Fi is unreliable, so offline verification is a hard
requirement.

## Email

`services/email-templates` renders MJML templates (confirmation, ticket,
reminder, refund) and sends through the provider configured in `MAIL_PROVIDER`.
Currently Gmail SMTP from the club account.

## Refunds

Refund policy: full refund on request until 15 April 2026; no refunds after
15 Apr. Refunds are triggered from the admin desk and processed through the
gateway API.

## Environments

- dev: local, seeded with `npm run db:seed`
- prod: single environment, no staging

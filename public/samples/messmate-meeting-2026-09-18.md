# MessMate sync: 18 Sep 2026

Attendees: Riya Deshpande (tech lead), Omkar Joshi, Farhan Sheikh, Dr. Nisha Menon (warden)
Location: Hostel Council room, 7:30 pm

## Status

MessMate is live for Blocks A–D (412 students). Daily menu, meal ratings and the complaint form work.
Average rating last week: 3.6 / 5. Block E goes live after the Diwali break.

## Decisions

- Hosting moves from Heroku to Render. Heroku student credits ended on 31 Aug. Riya to migrate by 20 Sep.
- Menu sync runs weekly, Sunday 8 pm, from the contractor's Google Sheet. Final.
- Meal feedback stays anonymous. We store block and meal, never the roll number.

## Action items

- Riya: migrate API + Postgres to Render, update the README (due 20 Sep)
- Farhan: fix the Windows build (postinstall uses `rm -rf`)
- Omkar: shadow Riya on deploys; take over as tech lead in November
- Dr. Menon: share the contractor contract renewal date

## Open questions

- The SMS alerts (MSG91) account is registered on Riya's personal phone. Who takes it over?
- Diwali break menu must be published by 25 Oct.

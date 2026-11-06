# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

It didn't tell me which days count. I assumed Monday to Friday. No assignment starts on a weekend, yet more than a third end on one.
Counting 7 days puts all 321 people on 40h over capacity, but counting 5 leaves only Dee.
A partial column would compare a few days of work against a full week of capacity.
Over capacity means strictly above weekly hours, so 40/40 is not over. It shows in hours because Eli has 0 capacity.
Scale. The whole roster loads per range, capped at 106 weeks, and only visible rows are drawn.
After a save the new value shows right away, but cached data only changes once the server confirms, so a failed save has nothing to undo. Then every cached range is patched and refreshed in the background.
A failed save returns the cell to the real value, marks it red and shows a notice with Retry and Dismiss.
There is no version column, so the PATCH sends the value it last saw and gets a 409 if it changed.

## What did you notice that looked wrong?

Ana's rows look duplicated, but each assignment is split into 15 rows that add up. Removing the "duplicates" would show her at 7.5h instead of 40h.
Eli has 0 weekly hours and 20h allocated in the week of Jan 5. I left it and show it as over.
1/5th of the hours fall on weekends. 
First of January counts as a working day because the schema has no holidays.
One week in three is empty for everyone.
Editing someone's hours changes past weeks too, because the schema holds one value. The UI says so.
The (start_date, end_date) index is weak, but adding one on person_id and start_date does not help this whole roster query style.

## What did the AI get wrong that you caught?

It didn't write a query client config at first, so a save made offline stayed on "Saving" forever.
It was also chaining ternaries and hiding anys inside generics.
It was rolling its own date maths. No date came out wrong, but I had it moved to the Temporal API.
A browser run I asked for passed every check despite a glaring bug. At phone width the two fixed columns covered every week. 

## What would you do differently with a week?

Agree on business rules instead of assuming them.
Add dated capacity, holidays and leave, so an edit stops rewriting past weeks.
Choose a UI library or roll my own components on a headless library or a customizable one like ShadCN.
Add some linting and tooling to the repo to guide the AI properly.
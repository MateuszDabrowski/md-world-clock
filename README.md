# MCE World Clock

World Clock that helps you with Salesforce Marketing Cloud Engagement (MCE) system dates. Let the dashboard handle the timezone math so you can focus on building your automations.

> You Should Know
>
> The app code is 100% AI generated as a part of my agentic coding learning journey.

## The UTC-6 Challenge

The most straightforward way to work with dates in MCE is to understand the server time.

> You Should Know
>
> For Salesforce Marketing Cloud Engagement, the system time is Central Standard Time (UTC-6) without changes between standard and daylight savings time. This behavior cannot be changed, even with timezone and culture settings in the Setup.
>
> This dashboard allows you to paste a raw system date from Query or Data Extension and instantly see what that moment was in up to 8 different global timezones. It effectively bridges the gap between fixed server timestamps and your local audience's reality.

## Script Generation Engine

One of the standout features of this tool is the ability to generate production-ready code snippets for your Marketing Automation needs. Depending on your specific use case, you can choose between SQL, AMPScript, or SSJS.

### SFMC SQL

The generator leverages the [AT TIME ZONE function](https://mateuszdabrowski.pl/docs/salesforce/marketing-cloud-engagement/sql/sql-date-functions/#at-time-zone) to handle offset information. It specifically uses the Central America Standard Time workaround to account for MCE's lack of DST.

### AMPScript & SSJS

The tool provides dynamic datetime conversion logic. Since AMPScript & SSJS does not natively handle timezone objects, the generated code uses one of the three approaches:

1. Simple DateAdd when you convert to UTC (no DST)
2. SystemDateToLocalDate when you convert to your local time (assuming you have the same timezone selected on your user in MCE)
3. Manual Summer Time (DST) boundary variables to ensure accuracy throughout the year for all other timezones.

## Key Features

- MCE Date Conversion: Paste a raw SFMC system date to sync all clocks to that specific point in time.
- Instant Script Generation: One-click snippets for SQL, AMPScript, and SSJS to handle timezone shifts.
- DST-Aware Logic: Automatically detects if a target timezone is in Summer/Winter time and suggests appropriate offsets.
- Minimalist Dual Face: Toggle between a geometric analog aesthetic and a high-readability digital dashboard.
- Local Storage: Your added clocks and theme preferences are saved locally in your browser.

## Sum Up

This dashboard is a useful tool for everyone working in multiple timezones and developers planning to personalize communication using date data.

- Be consistent with SFMC system time (UTC-6).
- Strive for readability by generating clean, formatted code.
- Save time by avoiding complex manual calculations.
- Handle DST magic automatically.
- Free & Browser-based with no server-side dependencies required.

Looking for more Marketing Cloud style? Check out my guides on [SQL](https://mateuszdabrowski.pl/docs/category/salesforce/marketing-cloud-engagement/sql/), [AMPScript](https://mateuszdabrowski.pl/docs/category/salesforce/marketing-cloud-engagement/ampscript/), and [SSJS](https://mateuszdabrowski.pl/docs/category/salesforce/marketing-cloud-engagement/ssjs/) to keep your codebase clean and bug-free.

# Editing your city's content

This is the guide for the staff who edit the site. To put a copy online first,
see [DEPLOYMENT.md](../DEPLOYMENT.md).

Sign in at `/admin/` and open **Site content**. Only administrators can edit and
publish; viewers can see responses and reports. Content changes take effect
without a code deploy.

The site starts with the City of DeLand's content, photos, videos and figures as
a sample. None of it is verified for another city. Choosing your city changes
the property lookup and every place the text uses the city name; it does not
replace DeLand's budget, claims, links or artwork. Name a content reviewer and a
Finance reviewer for the millage, budget figures and calculator explanations.

## How the editor is organized

**Site content** opens on **Start here**: the steps in order, each with a count
of items still to review (the same counts appear on the tabs). The yellow
**items to review** panel lists every one; **Show me** opens the exact field.

The tabs, in the order to work through them:

1. **City & branding**
   - The city and its verified **municipal operating millage**. This is the
     city's operating rate, not the total rate on a tax bill. Picking a city
     does not fill in its rate; have Finance confirm it.
   - **Site name** (browser tab, menus and footer), **Search result title**
     (the headline Google shows for the home page and the bold title in link
     previews; blank uses the site name), **Public site address**, and the
     **Search and link description** (one or two sentences under the title in
     search results and link previews).
   - Whether you are a City or Town, and the tagline under the logo.
   - The **city logo** (also used as the browser tab icon), the **link preview
     image** with its **image description** (what Facebook, X, Teams and text
     messages show, and what screen readers read aloud), and the **postcard
     artwork**. Replace artwork that shows DeLand landmarks or lettering;
     changing text cannot remove words baked into an image.
2. **Key facts:** what the site repeats in many places, entered once: the Year 2
   budget impact, the fiscal year the gap begins, General Fund totals, City
   Clerk phone and mailing address, city website, privacy policy and public
   records pages, budget and millage pages, an example search address, social
   media links (blank hides the icon), and review dates. Each fact shows how
   many places use it. Search engines also read the city website, Clerk phone
   and address from here to identify who publishes the site.
3. **Budget:** the annual gap target, departments (1 to 30), their budget items,
   annual amounts and community impacts, the messages residents see as they cut
   a department, and potential revenue. Amounts are dollars, not millions.
   Department totals are the sum of their items. Use **Jump to** at the top of
   the tab to reach Departments, Potential revenue, or the Property tax slider.
   - **Potential revenue** lists the fee and revenue options, plus the heading,
     introduction and labels around them.
   - **Property tax rate slider** has its own section. Uncheck **Offer residents
     a property tax increase** to hide the slider; its settings are kept for
     later. Its amount is the revenue from one additional mill, separate from
     the household calculator's base rate. If you turn it off, edit any text
     that still mentions it (the review list points these out).
   - Removing a department removes its items and videos from the draft; earlier
     resident submissions keep what they saw.
4. **Home page:** pick a part of the page (Opening banner, By the numbers, City
   services, Amendment explained, Savings calculator, Budget builder, FAQs,
   Sources, Feedback, Sharing & postcard, Menus, Footer, Video player).
5. **Privacy:** the title area, the highlighted notice, and a list of sections,
   each a heading and its text. Each section can be shown always, only while
   Google Analytics is on, or only while it is off; a label says which one
   visitors see right now. The records contacts and the "last updated" date
   come from Key facts.
6. **Coming soon** and **Sign-in:** their wording, highlights and illustration.
7. **Videos:** add or remove department videos, with titles and poster images.
   The length shown on the department card is read from the file
   automatically. MP4 and WebM uploads up to 25 MiB. Include captions in the
   video you supply; the editor does not create caption tracks or convert files.

## Editing text

- The fields most cities change come first; headings, buttons and labels are
  folded into **More wording**, named by where they sit, such as "Card 2,
  paragraph". Screen-reader text and messages that appear only after a visitor
  clicks something are in a collapsed group at the end of each part.
- Paragraphs are edited whole. The toolbar has **bold**, *italic* (shown in the
  accent color in headings), links, lists, and **Insert a fact**, which adds a
  key fact at the cursor. Pasted text arrives without outside formatting. In
  headings, Shift+Enter starts a new line.
- Shaded values in text are key facts and fill in automatically from Key facts,
  City & branding and the Budget tab: the city name, official name, site name,
  fiscal years, the budget gap, department count, contacts and dates. In short
  fields they appear as `{{double braces}}`, for example `{{clerkPhone}}`.
  Money can show as `$8,800,000`, `$8.8M` (`{{yearTwoImpact:short}}`) or
  `$8.8 million` (`{{yearTwoImpact:words}}`). Keep them when you edit.
- Repeating parts are lists you can add to, remove from and reorder: the
  amendment's key points, FAQs, the source explanations, the official source
  links, privacy sections and coming-soon highlights.
- Links accept `https://` addresses, site paths such as `/privacy`, `mailto:`
  and `tel:`. Links that point to a key fact say so and are changed in Key facts.
- Figures the page calculates itself (from the budget and key facts) and
  Amendment 3 numbers that are the same statewide are not offered for editing.
- **Find text on this page** searches every part, including folded groups.
  Click anything in the live preview to jump to its field.

Image uploads everywhere accept PNG, JPEG, WebP and GIF up to 8 MiB. SVG is not
supported; export a PNG or WebP. The generated postcard image uses the logo and
artwork stored in this installation, so upload those files rather than linking
to another website. The opening banner holds up to 100 slideshow photos, each
with a caption and a description for screen readers.

## Draft, preview, publish

Edits are saved as a draft. Use **Save draft**, then **Preview saved draft** to
see the saved content in a new tab while signed in. The editor's **Live website
preview** shows unsaved changes; choose **Desktop** or **Mobile**, or **Expand
preview** for more room. In **Click to edit** mode, select text, images or links
to find their fields; **Try the site** lets you use menus, the calculator, the
budget builder and the postcard. Submissions and downloads are disabled in
previews.

**Publish changes** publishes the saved draft as one version; the dashboard's
own name and logo update immediately. If another administrator changes the
draft at the same time, the editor reports a conflict; keep your unsaved text,
reload the latest draft, and reconcile.

Uploads are stored immediately. Replacing an image or video does not delete the
old file; there is no media delete screen yet.

## Calculator scope and budget history

The city list includes the Volusia County Property Appraiser's 17 municipal
operating authorities, including the Volusia County portion of Flagler Beach.
It cannot look up properties in another county. Supported authorities and codes
are in `src/volusia-cities.js`, checked against the Property Appraiser's
[municipal authority listing](https://vcpa.vcgov.org/files/historical/2025/trim/proposedtaxingauthoritymillagerates2025trim.pdf)
and the county's [tax-district descriptions](https://maps.vcgov.org/gis/data/TaxDistricts.htm).
These establish which authority a parcel belongs to, not the current rate.

Property autofill requires the selected city's operating-authority row in the
county record. A postal address or nearby city name does not establish that a
property pays city taxes. The calculator uses assessed value before exemptions.
When county data is missing, lookup fails safely and residents can type an
assessed value. Debt millage, other taxing authorities and non-ad valorem
assessments are excluded. The county integration reads the Property
Appraiser's public website and may need maintenance if that website changes.

Publishing a changed budget or city starts a new budget version. Saved
submissions keep the amounts and impacts residents saw; do not read them as
responses to the new budget. Old links built on an earlier version cannot submit
as though they used the new one. Keep a budget item's identity when you edit the
same item; add a new item for a genuinely different choice.

The editor does not change the Amendment 3 exemption schedule, the calculation
rules or the page layout; those need developer work. Review the sample's
amendment explanation and 2026 baseline before publishing your own.

## Check, then open the site

Before opening the site to the public:

- Sign in as an administrator, save a draft with a changed heading, logo, image,
  video, FAQ, city rate and budget item; check the draft and the published
  version separately. Confirm a viewer cannot edit content.
- Search a known in-city parcel and a known outside-city parcel. Compare the
  authority, assessed value and operating rate with the Property Appraiser.
  Try manual entry and the homestead message.
- Play and seek a video on a phone and a computer. Share the home page link in
  a message to yourself and check the title, description and image.
- Complete a budget, submit it, and check that the dashboard reports the same
  choices and amounts. Publish a changed budget and confirm the earlier
  submission keeps its original amounts.
- Check keyboard navigation, the phone layout, the FAQs, and the coming-soon page.

When content has been approved, connect the city's domain (see
[DEPLOYMENT.md](../DEPLOYMENT.md#using-your-own-domain)). An administrator then
opens **Site settings**, chooses **Open to the public** under **Who can see the
site**, and clicks **Save settings**. Add Google Analytics there too if the city
uses it.

Back up the database (content, submissions and accounts) and the media bucket
separately from Git; see [Backups](../DEPLOYMENT.md#backups). A code rollback does
not restore earlier content or media, and the editor keeps one draft and one
published version, not a full history.

# PageTurn — Feature Reference

## Shelves

Shelves are collections of books — think of them like playlists, but for reading.

### Default Shelves (every account)
| Shelf | Description |
|---|---|
| Want to Read | Books you plan to read |
| Currently Reading | Books you're actively reading |
| Read | Books you've finished |

### Custom Shelves
- Create unlimited custom shelves (Religious, Book Club, Favorites, etc.)
- Each shelf has a name, optional description, and a color dot
- Books can appear on multiple shelves simultaneously

### Cross-Shelf Query
One of PageTurn's standout features. On any shelf page you can select one or more additional shelves — the view then shows only books present on **all** selected shelves.

**Example:** You have a "Religious" shelf and a "Children's" shelf.
Open "Religious" → toggle "Children's" in the cross-shelf panel → you see only your Christian children's books.

You can also stack a **genre filter** on top of the cross-shelf query for an even narrower result.

---

## Book Search

- Powered by **Google Books API** — access to 40+ million books
- Search by title, author, ISBN, or keyword
- Results show cover, title, author, and genre
- Click any result to see full details before adding

---

## Reading Status & Progress

Every book in your library has a status:
- **Want to Read** — queued up
- **Currently Reading** — actively reading; tracks current page and progress %
- **Read** — finished; unlocks rating and review

### Progress Bar
While a book is "Currently Reading", a progress bar shows page number and percentage.
Update it by logging a reading session or editing the book directly.

---

## Reading Sessions Log

Log every reading session with:
- **Date** — when you read
- **Pages read** — how many pages you covered
- **Notes** — quick thoughts, quotes, or reflections

Sessions accumulate into:
- Total pages read (dashboard stat)
- Reading streak (consecutive days with at least one session)
- Per-book reading history (visible on the book detail page)

---

## Star Ratings & Reviews

- Rate any finished book 1–5 stars
- Write a personal review or notes (private to you)
- Ratings feed into your average rating stat on the dashboard

---

## Reading Challenges

Create custom reading goals:

| Parameter | Options |
|---|---|
| Duration | 1 Week / 1 Month / 1 Year / Custom date range |
| Target | Any number of books |
| Genre filter | Optional — only books of that genre count |

**Examples:**
- "Read 12 books in 2025" (year, 12 books, no genre filter)
- "Read 4 Romance novels in January" (month, 4 books, Romance filter)
- "Read 1 book this week" (week, 1 book, no genre filter)

Progress bars update automatically: whenever you mark a book "Read" (or edit one that's already read), it's checked against every active challenge — matching on date finished falling within the challenge window, and genre if the challenge has a filter. Challenges past their end date are swept on your next Dashboard or Challenges page load and marked **Completed** (target hit) or **Failed** (target missed) automatically.

Delete a challenge any time from the Challenges page — click the trash icon on its card, confirm, and it's gone (unlinks its progress but doesn't touch your library).

> Genre matching only works for books that have genre data attached (Google Books search results do; Goodreads CSV imports don't — see Import below). A genre-filtered challenge won't auto-count an imported book until you look it up again via Search.

---

## Statistics Dashboard

Your reading dashboard shows:
- **Total books read** (all time + this year)
- **Total pages read** (from logged sessions)
- **Average star rating**
- **Reading streak** (consecutive days with a session)
- **Monthly bar chart** — books read per month this year
- **Genre pie chart** — breakdown of what you read by category

---

## Import / Export

### Export
Download your entire library as a CSV file with:
- Title, authors, status, rating, review, dates, ISBN, page count, genres

### Import (Goodreads)
- Export your Goodreads library (My Books → Export Library)
- Upload the CSV to PageTurn
- Imports title, authors, ISBN, page count, your rating, review, reading status, date finished,
  and recreates any custom Goodreads shelves as PageTurn shelves
- Goodreads' export format doesn't include cover images or genre/category data, so those stay
  blank on imported books until you look them up again via Search

---

## Account

Your Profile page has a **Danger Zone** with a "Delete Account" button. It requires typing your
exact email address to confirm — this permanently deletes every book, shelf, session, and challenge
you own. There's no undo.

---

## Planned Future Features

- Tags (lightweight per-book labels)
- Social features (share shelves, reading challenges with friends)
- Reading reminders / push notifications
- Advanced statistics (reading pace, time-to-finish predictions)

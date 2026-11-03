# Baakio

**Know what's pending. Know who's next.**

Baakio is a mobile-first customer credit ledger for small businesses. It brings purchases, payments, outstanding balances, and payment promises into one account for each customer, so an owner can see what is owed and decide who needs a follow-up.

[Website](https://www.baakio.shop/) · [Try the interactive demo](https://www.baakio.shop/demo.html) · [Open the account app](https://www.baakio.shop/app.html) · [Backend repository](https://github.com/sanjaygupta45/Baakio-be)

The interactive demo uses fictional data and keeps changes only while the page is open. Its sample bill scan is simulated. The account app connects to the backend and saves real business records.

## The problem

When customers buy on credit and pay in parts, a notebook or chat history makes it hard to answer simple questions: How much does this customer still owe? What has already been paid? Who promised to pay today? Which bill created the balance? An unclear record can lead to awkward conversations and missed follow-ups.

## The solution

Baakio gives the business owner a clear, current account for every customer. Purchases add to the balance, confirmed payments reduce it, and payment promises stay visible until fulfilled. A dashboard highlights amounts due today and overdue. The owner can review a statement and prepare an English or Hindi WhatsApp reminder from the same records.

For a quick tour, [open the interactive demo](https://www.baakio.shop/demo.html) and follow this path:

1. Open a customer account to see its balance and transaction history.
2. Add a purchase or review the sample bill scan.
3. Record a partial payment and a payment promise.
4. Visit Follow-ups, then preview a WhatsApp statement.

## What the app does

| Area | Owner experience |
| --- | --- |
| Customer accounts | Create and search customers, view their outstanding balances, and bring an existing balance into Baakio with an acknowledged opening entry. |
| Purchases and payments | Enter a quick amount or itemized purchase, record money actually received, and see the updated balance. Payments can be applied to a specific promise. |
| Statements | Review dated purchases and payments, with opening and closing balances for a chosen period. |
| Payment promises | Record an amount and due date, reschedule with a revision history, and see due, overdue, upcoming, or unpromised balances. |
| Bill scanning | Upload a bill image. AI proposes an editable itemized draft; the owner compares it with the original and confirms before any purchase is posted. Manual entry is always available. |
| Reminders | Preview a short or detailed statement in English or Hindi, copy it, or open a prefilled WhatsApp chat. The owner chooses whether to send it. Confirmed UPI details can be included. |
| Access and language | Sign in with an email code or, when configured, Google. Switch the interface between English and Hindi and link another sign-in method. |

Baakio treats a **promise as a plan, not a payment**. Only a confirmed payment reduces what is owed. Scanned text is also a draft until the owner reviews and posts it.

## Built with

- **Frontend:** React 19, TypeScript, Vite, i18next, and a mobile-first web interface.
- **Backend:** Java 21, Spring Boot, Spring Security, MySQL, Flyway, and RabbitMQ. See the [backend README](https://github.com/sanjaygupta45/Baakio-be#readme) for the API, data flow, and deployment details.
- **Bill extraction:** Mistral OCR, with private image storage in Google Cloud Storage and owner review before posting.
- **Hosting:** Vercel for the frontend and a Google Compute Engine VM for the API.

The React app calls the authenticated `/api/v1` API. Balances, statement totals, and financial writes are calculated and validated on the server.

## Repositories

This repository contains the public site, interactive demo, and authenticated React app. [Baakio-be](https://github.com/sanjaygupta45/Baakio-be) contains the REST API, ledger rules, scan pipeline, database migrations, tests, and deployment scripts.

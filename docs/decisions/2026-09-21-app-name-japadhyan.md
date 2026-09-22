---
status: accepted
date: 2026-09-21
---

# App name: JapaDhyan

## Context

The working name was `naam-japam`. The name has to work for Hindu, Sikh, Buddhist and Jain devotees, read well in English, Hindi and Nepali, and be free in the app stores and as a domain. The final two were **JapaDhyan** and **JapamYoga**.

## Decision

The app is called **JapaDhyan** (जपध्यान): _japa_, repeating the Name, and _dhyan_, meditation — the practice and the state it leads to.

- **Spelling:** one word, capital J and D: JapaDhyan. Where capitals aren't allowed: `japadhyan`.
- **Store listings:** brand first, then what the app does — see [store-listing](../product/store-listing.md).
- **Web:** japadhyan.com, with japadhyan.app redirecting to it. Neither is registered yet; both were free on 2026-09-21.
- **App identifiers:** iOS bundle ID and Android package `com.japadhyan.app`, URL scheme `japadhyan`, Expo slug `japadhyan`, workspace packages `@japadhyan/*`.

## Why JapaDhyan

- **Every tradition knows the word.** Dhyana is core to Hindu, Buddhist (_jhāna_, _Chan_ and _Zen_ come from it) and Jain practice. In Sikh practice, _Naam Japna_ is one of Guru Nanak's three pillars, and _dhiāuṇā_ (ਧਿਆਉਣਾ, to meditate on the Name) shares dhyan's root.
- **It reads naturally in Hindi and Nepali.** ध्यान is an everyday word meaning both meditation and attention.
- **It's free.** No app or business uses the name.

## Why not JapamYoga

- **Already taken:** "Japam Yoga Treks and Tours", a yoga and trekking business in Rishikesh, uses the name and the @japamyoga Instagram handle.
- **Wrong neighbours in search:** "yoga" places the app among fitness and pose apps.
- **Not neutral for Sikhs:** Sikh teaching sets itself apart from yogic renunciation.
- **Regional form:** _japam_ is the South Indian form; Hindi and Nepali speakers say _jap_.

## Consequences

- Register japadhyan.com and japadhyan.app soon, before someone else does.
- Some English speakers will misspell it (JapaDhyaan, JapaDyan, Japa Dhyana). Consider registering the common misspellings as domains.
- The bundle ID and Android package can't change once the app is uploaded to a store.
- The GitHub repository is still called `naam-japam`. Renaming it is a separate step; GitHub redirects the old URL.
- Before launch: trademark search (India, Nepal, US), claim social handles, and ask each tradition's advisor to check the name.

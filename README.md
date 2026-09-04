# Bangalore Hide and Seek

A two-player, Jet Lag style hide and seek game played across central and south Bangalore.

- Rules: [RULES.md](RULES.md)
- Game board: https://richie-03.github.io/bangalore-hide-and-seek/

The game board is a single static page. It keeps timers, the challenge list, the hint menu and an event log in the browser's local storage, so each player's phone holds its own copy. The WhatsApp chat remains the official record for timestamps and photos.

## Running locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## Versioning

Rules are versioned in RULES.md. Rebalance after a game, not during it.

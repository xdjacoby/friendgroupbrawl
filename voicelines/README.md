# Voicelines

Drop audio clips in here and the game plays them. No code changes needed: each friend has a folder, and the **file name** decides when it plays.

```
voicelines/
  draven/   jacoby/   eli/   andrew/   byron/
```

**Formats:** `.mp3`, `.m4a`, `.ogg`, `.wav`, `.webm`, `.aac` (phone voice memos are usually `.m4a`, which works).

**More than one take?** Add a number: `victory.mp3`, `victory2.mp3`, `victory-3.mp3`. The game picks one at random each time.

**Uploading on GitHub:** open the friend's folder (e.g. `voicelines/eli`), click **Add file → Upload files**, drag the clips in, then **Commit changes**. Restart `npm run dev` afterwards so the game picks them up.

## When each file plays

| File name | When |
|---|---|
| `select` | Picked on the character select screen |
| `intro` | Match starts (one random fighter says theirs) |
| `victory` | Victory screen |
| `ko` | They get KO'd |
| `hurt` | They take a really big hit (about half the time) |
| `parry` | They parry a hit |
| a move's name (below) | They use that move (most of the time, not every single time) |

Moves everyone has: `jab`, `ftilt`, `utilt`, `dtilt`, `nair`, `fair`, `bair`, `uair`, `dair`, `nspecial`, `sspecial`, `uspecial`, `dspecial`, `grab`, `pummel`, `fthrow`, `bthrow`, `uthrow`, `dthrow`, `roll`, `airdodge`. (Eli's `uspecial` is his Subway Surfers hoverboard now.)

Moves only some characters have:

| Friend | Extra move names |
|---|---|
| Draven | `jab2`, `jab3` |
| Jacoby | `snackToss` (throwing a snack), `munch`, `sspecialEmpty` (no magnifying glass) |
| Eli | `jab2`, `jab3`, `fbi` (FBI OPEN UP) |
| Andrew | `jab2`, `jab3`, `correction` (insulin on himself) |
| Byron | `jab2`, `jab3`, `lassoAir`, `inTheShop` (Lambo's wrecked), `kravKick` (counter lands) |

Good ones to start with: `victory`, `ko`, and each special (`nspecial`, `sspecial`, `uspecial`, `dspecial`). Keep clips short (1–3 seconds) so they don't talk over the fight.

There's a **Voices** checkbox on the menu to turn them all off.

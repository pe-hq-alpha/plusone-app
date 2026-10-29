# Photo-check evaluation set

36 photos, marked by hand (Claude Code, 29 Oct 2026) from the photos themselves. `key.json` holds one entry per photo.

- 8 photos generated for the app's sample vendors (not real work).
- 22 free-licence Unsplash photos, standing in for vendors' own work (see `../sample-photos.json` for sources).
- 6 trap photos generated with ElevenLabs `gpt-image-2` at 1K on 29 Oct 2026, each built to test one finding: a watermark, another business's name, a clear face, something unsafe, an unusable blur, a photo of the wrong thing.

What each field means:

- `realWork`: an actual photograph, not AI-generated or a graphic. The Unsplash photos count as real here, so this tests whether a check accepts authentic photographs and flags generated ones.
- `stock`: carries stock-library marks or is plainly a commercial stock image.
- `watermark`: visible watermark text.
- `faces`: a face clear enough to recognise.
- `unsafe`: violence, nudity or similar.
- `tags`: the tag keys right for the photo; `trade` is chosen by what the photo shows, not by which sample vendor holds it.

Limits: small, and one person marked it; the real photos are stock stand-ins, and `sample-work-17` and `-22` are the same stage. The other business's name on `trap-other-brand.jpg` has no field in the check's answer, so it is not scored.
